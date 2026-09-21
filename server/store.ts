import { randomBytes, randomUUID } from 'node:crypto'
import type { AppEvent, CareContext, Certainty, Conversation, ConversationDetail, ConversationSummary, Fact, Level, PatientProfile, Priority, Settings, Turn, Widget, WidgetState } from '../shared/types.js'
import { widgets } from '../shared/types.js'
import { normalizeSettings } from '../shared/settings.js'
import type { Database } from './db.js'

type FactInput = Omit<Fact, 'id' | 'created_at' | 'level' | 'priority' | 'certainty'> & {
  level?: Level | null
  priority?: Priority | null
  certainty?: Certainty
}

export class Store {
  constructor(private db: Database, private publish: (event: AppEvent) => void) {}

  private patientKey(context: CareContext | null | undefined): string {
    return context?.subject === 'other' && context.patient_name.trim() ? `other:${context.patient_name.trim().toLowerCase()}` : 'self'
  }

  async event(conversationId: string, type: AppEvent['type'], data: unknown): Promise<void> {
    const row = (await this.db.query<AppEvent>('INSERT INTO events(conversation_id,type,data) VALUES($1,$2,$3) RETURNING seq,conversation_id,type,data,created_at',
      [conversationId, type, JSON.stringify(data)])).rows[0]
    this.publish(row)
  }

  async visitor(token?: string): Promise<{ id: string; token: string; created: boolean }> {
    if (token) {
      const existing = (await this.db.query<{ visitor_id: string }>('SELECT visitor_id FROM visitor_profiles WHERE visitor_id=$1', [token])).rows[0]
      if (existing) return { id: token, token, created: false }
    }
    const id = token || randomBytes(18).toString('base64url')
    await this.db.query('INSERT INTO visitor_profiles(visitor_id,context) VALUES($1,$2) ON CONFLICT(visitor_id) DO NOTHING', [id, JSON.stringify({ subject: 'self', patient_name: '', relationship: 'self', speaker_name: '' })])
    return { id, token: id, created: !token }
  }

  async setContext(visitorId: string, context: CareContext): Promise<void> {
    await this.db.query('INSERT INTO visitor_profiles(visitor_id,context,updated_at) VALUES($1,$2,now()) ON CONFLICT(visitor_id) DO UPDATE SET context=EXCLUDED.context,updated_at=now()',
      [visitorId, JSON.stringify(context)])
  }

  /** Settings with the separately-stored care context merged in, so the two never disagree. */
  async settings(visitorId: string): Promise<Settings | null> {
    const row = (await this.db.query<{ settings: Settings | null; context: CareContext | null }>(
      'SELECT settings, context FROM visitor_profiles WHERE visitor_id=$1', [visitorId])).rows[0]
    if (!row) return null
    const base = normalizeSettings(row.settings)
    return row.context ? { ...base, context: { ...base.context, ...row.context } } : base
  }

  async saveSettings(visitorId: string, settings: Settings): Promise<void> {
    await this.db.query(
      `INSERT INTO visitor_profiles(visitor_id,settings,context,updated_at) VALUES($1,$2,$3,now())
       ON CONFLICT(visitor_id) DO UPDATE SET settings=EXCLUDED.settings, context=EXCLUDED.context, updated_at=now()`,
      [visitorId, JSON.stringify(settings), JSON.stringify(settings.context)])
  }

  async profile(visitorId: string): Promise<PatientProfile> {
    const context = (await this.db.query<{ context: CareContext | null }>('SELECT context FROM visitor_profiles WHERE visitor_id=$1', [visitorId])).rows[0]?.context || null
    const patientKey = this.patientKey(context)

    const factsFor = async (key: string) => (await this.db.query<Fact>(
      `SELECT f.* FROM facts f JOIN conversations c ON c.id=f.conversation_id
       WHERE c.visitor_id=$1 AND c.patient_key=$2 AND f.status NOT IN ('corrected','superseded')
       ORDER BY f.created_at DESC`, [visitorId, key])).rows
    const statsFor = async (key: string | null) => (await this.db.query<{ count: string; last_activity: string | null }>(
      `SELECT count(*)::text AS count, max(COALESCE(ended_at, started_at)) AS last_activity FROM conversations
       WHERE visitor_id=$1${key ? ' AND patient_key=$2' : ''}`, key ? [visitorId, key] : [visitorId])).rows[0]

    // Facts are scoped to the current care context, but a conversation can be
    // recorded before the context is set (or after it changes). Falling back to
    // everything this visitor has keeps their care thread visible instead of
    // showing empty screens because of a key mismatch.
    const scoped = await factsFor(patientKey)
    const facts = scoped.length ? scoped : (await this.db.query<Fact>(
      `SELECT f.* FROM facts f JOIN conversations c ON c.id=f.conversation_id
       WHERE c.visitor_id=$1 AND f.status NOT IN ('corrected','superseded')
       ORDER BY f.created_at DESC`, [visitorId])).rows
    const stats = await statsFor(scoped.length ? patientKey : null)
    return { facts, conversation_count: Number(stats?.count || 0), context, last_activity: stats?.last_activity || null }
  }

  async createConversation(visitorId: string, settings: Settings): Promise<Conversation> {
    const id = randomUUID()
    const patientKey = this.patientKey(settings.context)
    const conversation = (await this.db.query<Conversation>(
      'INSERT INTO conversations(id,visitor_id,patient_key,status,settings) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [id, visitorId, patientKey, 'ready', JSON.stringify(settings)])).rows[0]
    for (const widget of widgets) await this.db.query('INSERT INTO widget_states(conversation_id,widget,status) VALUES($1,$2,$3)', [id, widget, 'waiting'])
    await this.event(id, 'conversation', conversation)
    return conversation
  }

  async conversation(id: string, visitorId: string): Promise<Conversation | null> {
    return (await this.db.query<Conversation>('SELECT * FROM conversations WHERE id=$1 AND visitor_id=$2', [id, visitorId])).rows[0] || null
  }

  async list(visitorId: string): Promise<Conversation[]> {
    const conversations = (await this.db.query<Conversation>('SELECT * FROM conversations WHERE visitor_id=$1 ORDER BY started_at DESC LIMIT 50', [visitorId])).rows
    if (!conversations.length) return conversations
    const firstTurns = (await this.db.query<{ conversation_id: string; text: string }>(
      `SELECT DISTINCT ON (t.conversation_id) t.conversation_id, t.text FROM turns t
       JOIN conversations c ON c.id=t.conversation_id WHERE c.visitor_id=$1 AND t.speaker='user'
       ORDER BY t.conversation_id, t.seq`, [visitorId])).rows
    const titles = new Map(firstTurns.map(row => [row.conversation_id, row.text.replace(/\s+/g, ' ').trim().slice(0, 80)]))
    return conversations.map(conversation => ({ ...conversation, title: titles.get(conversation.id) || null }))
  }

  async search(visitorId: string, query: string): Promise<Conversation[]> {
    const term = query.trim().toLowerCase()
    if (!term) return this.list(visitorId)
    const like = `%${term}%`
    const rows = (await this.db.query<Conversation>(
      `SELECT DISTINCT c.* FROM conversations c
       LEFT JOIN turns t ON t.conversation_id=c.id LEFT JOIN facts f ON f.conversation_id=c.id
       WHERE c.visitor_id=$1 AND (lower(coalesce(t.text,'')) LIKE $2 OR lower(coalesce(f.detail,'')) LIKE $2)
       ORDER BY c.started_at DESC LIMIT 50`, [visitorId, like])).rows
    return rows.map(conversation => ({ ...conversation, title: null }))
  }

  async visitorFor(conversationId: string): Promise<string | null> {
    return (await this.db.query<{ visitor_id: string }>('SELECT visitor_id FROM conversations WHERE id=$1', [conversationId])).rows[0]?.visitor_id || null
  }

  async detail(id: string, visitorId: string): Promise<ConversationDetail | null> {
    const conversation = await this.conversation(id, visitorId)
    if (!conversation) return null
    const [turns, facts, widgetStates, memory] = await Promise.all([
      this.db.query<Turn>('SELECT * FROM turns WHERE conversation_id=$1 ORDER BY seq', [id]),
      this.db.query<Fact>('SELECT * FROM facts WHERE conversation_id=$1 ORDER BY created_at', [id]),
      this.db.query<WidgetState>('SELECT widget,status,updated_at FROM widget_states WHERE conversation_id=$1', [id]),
      this.db.query<Fact>(
        `SELECT f.* FROM facts f JOIN conversations c ON c.id=f.conversation_id
         WHERE c.visitor_id=$1 AND c.patient_key=$2 AND f.conversation_id <> $3
           AND f.status NOT IN ('corrected','superseded')
         ORDER BY f.created_at DESC`, [visitorId, conversation.patient_key, id]),
    ])
    return { conversation, turns: turns.rows, facts: facts.rows, memory: memory.rows, widgets: widgetStates.rows }
  }

  async setStatus(id: string, status: Conversation['status']): Promise<void> {
    const summary = status === 'ended' ? await this.summary(id) : null
    const conversation = (await this.db.query<Conversation>(
      `UPDATE conversations SET status=$2, ended_at=CASE WHEN $2 IN ('ended','incomplete') THEN now() ELSE ended_at END,
       summary=COALESCE($3,summary) WHERE id=$1 RETURNING *`, [id, status, summary ? JSON.stringify(summary) : null])).rows[0]
    if (conversation) await this.event(id, 'conversation', conversation)
  }

  async deleteConversation(id: string, visitorId: string): Promise<boolean> {
    return (await this.db.query('DELETE FROM conversations WHERE id=$1 AND visitor_id=$2 RETURNING id', [id, visitorId])).rows.length > 0
  }

  async turns(id: string): Promise<Turn[]> {
    return (await this.db.query<Turn>('SELECT * FROM turns WHERE conversation_id=$1 ORDER BY seq', [id])).rows
  }

  async addTurn(conversationId: string, speaker: Turn['speaker'], text: string, interrupted = false): Promise<Turn> {
    const seq = (await this.db.query<{ next: number }>('SELECT COALESCE(max(seq),0)+1 AS next FROM turns WHERE conversation_id=$1', [conversationId])).rows[0]?.next || 1
    const turn = (await this.db.query<Turn>('INSERT INTO turns(id,conversation_id,speaker,text,seq,interrupted) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [randomUUID(), conversationId, speaker, text, seq, interrupted])).rows[0]
    await this.event(conversationId, 'turn', turn)
    return turn
  }

  /**
   * Create or update one streaming utterance in place. Transcript partials reuse the
   * same source id, so the transcript grows live instead of appearing all at once.
   */
  async upsertTurn(conversationId: string, sourceId: string, speaker: Turn['speaker'], text: string, interrupted = false): Promise<Turn> {
    const existing = (await this.db.query<Turn>('SELECT * FROM turns WHERE conversation_id=$1 AND source_id=$2', [conversationId, sourceId])).rows[0]
    if (existing) {
      if (existing.text === text && existing.interrupted === interrupted) return existing
      const updated = (await this.db.query<Turn>('UPDATE turns SET text=$3, interrupted=$4 WHERE id=$1 AND conversation_id=$2 RETURNING *',
        [existing.id, conversationId, text, interrupted])).rows[0]
      await this.event(conversationId, 'turn', updated)
      return updated
    }
    const seq = (await this.db.query<{ next: number }>('SELECT COALESCE(max(seq),0)+1 AS next FROM turns WHERE conversation_id=$1', [conversationId])).rows[0]?.next || 1
    const turn = (await this.db.query<Turn>('INSERT INTO turns(id,conversation_id,speaker,text,seq,interrupted,source_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [randomUUID(), conversationId, speaker, text, seq, interrupted, sourceId])).rows[0]
    await this.event(conversationId, 'turn', turn)
    return turn
  }

  /** Finalize a user utterance and enqueue its one extraction pass. */
  async finalizeUserTurn(conversationId: string, sourceId: string, text: string): Promise<Turn> {
    const turn = await this.upsertTurn(conversationId, sourceId, 'user', text)
    await this.db.transaction(async query => {
      await query('INSERT INTO analysis_jobs(id,conversation_id,turn_id) VALUES($1,$2,$3)', [randomUUID(), conversationId, turn.id])
      for (const widget of widgets) await query("UPDATE widget_states SET status='working', updated_at=now() WHERE conversation_id=$1 AND widget=$2", [conversationId, widget])
    })
    for (const widget of widgets) await this.event(conversationId, 'widget', { widget, status: 'working' })
    return turn
  }

  async addUserTurn(conversationId: string, text: string): Promise<Turn> {
    const turn = await this.addTurn(conversationId, 'user', text)
    await this.db.transaction(async query => {
      await query('INSERT INTO analysis_jobs(id,conversation_id,turn_id) VALUES($1,$2,$3)', [randomUUID(), conversationId, turn.id])
      for (const widget of widgets) await query("UPDATE widget_states SET status='working', updated_at=now() WHERE conversation_id=$1 AND widget=$2", [conversationId, widget])
    })
    for (const widget of widgets) await this.event(conversationId, 'widget', { widget, status: 'working' })
    return turn
  }

  async facts(conversationId: string): Promise<Fact[]> {
    return (await this.db.query<Fact>('SELECT * FROM facts WHERE conversation_id=$1 ORDER BY created_at', [conversationId])).rows
  }

  /** Persist a turn's extracted facts atomically, then announce them. */
  async addFacts(inputs: FactInput[]): Promise<Fact[]> {
    if (!inputs.length) return []
    const saved = await this.db.transaction(async query => {
      const rows: Fact[] = []
      for (const input of inputs) {
        const row = (await query<Fact>(
          `INSERT INTO facts(id,conversation_id,widget,title,detail,status,level,priority,certainty,source_turn_id,source_quote,event_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [randomUUID(), input.conversation_id, input.widget, input.title, input.detail, input.status,
            input.level || null, input.priority || null, input.certainty || 'reported',
            input.source_turn_id, input.source_quote, input.event_date])).rows[0]
        rows.push(row)
      }
      return rows
    })
    for (const fact of saved) await this.event(fact.conversation_id, 'fact', fact)
    return saved
  }

  /** Mark facts as superseded, used when a newer statement replaces an older one. */
  async supersedeFacts(ids: string[]): Promise<void> {
    for (const id of ids) await this.db.query("UPDATE facts SET status='superseded' WHERE id=$1", [id])
  }

  /** Mark facts resolved, used when a later update closes a loop. */
  async completeFacts(ids: string[]): Promise<void> {
    for (const id of ids) await this.db.query("UPDATE facts SET status='completed' WHERE id=$1", [id])
  }

  /** Mark facts confirmed, used when a short reply settles something. */
  async confirmFacts(ids: string[]): Promise<void> {
    for (const id of ids) await this.db.query("UPDATE facts SET certainty='confirmed' WHERE id=$1", [id])
  }

  async updateFact(id: string, visitorId: string, patch: { detail?: string; status?: Fact['status']; certainty?: Certainty; priority?: Priority; level?: Level }): Promise<Fact | null> {
    const fact = (await this.db.query<Fact>(
      `UPDATE facts f SET detail=COALESCE($3,f.detail), status=COALESCE($4,f.status), certainty=COALESCE($5,f.certainty),
         priority=COALESCE($6,f.priority), level=COALESCE($7,f.level)
       FROM conversations c WHERE f.id=$1 AND c.id=f.conversation_id AND c.visitor_id=$2 RETURNING f.*`,
      [id, visitorId, patch.detail || null, patch.status || null, patch.certainty || null, patch.priority || null, patch.level || null])).rows[0]
    if (fact) await this.event(fact.conversation_id, 'fact', fact)
    return fact || null
  }

  async setWidget(conversationId: string, widget: Widget, status: WidgetState['status']): Promise<void> {
    await this.db.query('UPDATE widget_states SET status=$3, updated_at=now() WHERE conversation_id=$1 AND widget=$2', [conversationId, widget, status])
    await this.event(conversationId, 'widget', { widget, status })
  }

  async pendingJobs(): Promise<{ id: string; conversation_id: string; turn_id: string }[]> {
    return (await this.db.query<{ id: string; conversation_id: string; turn_id: string }>(
      "SELECT id,conversation_id,turn_id FROM analysis_jobs WHERE status='pending' ORDER BY created_at LIMIT 8")).rows
  }

  async jobStatus(id: string, status: 'running' | 'done' | 'failed'): Promise<void> {
    await this.db.query('UPDATE analysis_jobs SET status=$2 WHERE id=$1', [id, status])
  }

  async recoverJobs(): Promise<void> {
    await this.db.query("UPDATE analysis_jobs SET status='pending' WHERE status='running'")
    await this.db.query("UPDATE conversations SET status='incomplete', ended_at=now() WHERE status IN ('connecting','live')")
  }

  async summary(conversationId: string): Promise<ConversationSummary> {
    const facts = (await this.db.query<Fact>("SELECT * FROM facts WHERE conversation_id=$1 AND status NOT IN ('corrected','superseded')", [conversationId])).rows
    const titles = (widget: Widget) => facts.filter(fact => fact.widget === widget).map(fact => fact.detail)
    return {
      talked_about: [...new Set(facts.map(fact => fact.title))].slice(0, 8),
      decisions: titles('decision').slice(0, 5),
      next_steps: titles('next_step').slice(0, 5),
      waiting_on: titles('open_loop').slice(0, 5),
      questions: titles('question').slice(0, 5),
    }
  }
}
