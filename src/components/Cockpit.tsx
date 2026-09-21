import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { Conflict, Fact } from '../../shared/types.js'
import { widgets } from '../../shared/types.js'
import { careCards, cardMeta, type CareCard, type ChecklistRow } from '../../shared/cockpit.js'
import { api } from '../api'
import { widgetLabel, widgetTint } from '../widgets'

const configKey = 'harbor.cockpit'

type Mode = 'recommended' | 'custom'
interface CockpitConfig { mode: Mode; pinned: string[]; hidden: string[] }

/** Derived views are curated separately from the fact-backed widgets. */
const derivedLabels: Record<string, string> = {
  anchor: 'Goal & next step', progress: 'Goal progress', upcoming: 'Upcoming care',
  readiness: 'Appointment readiness', agenda: 'Visit agenda', feasibility: 'Logistics & feasibility',
  blockers: 'Blocked', possible_update: 'Possible update', changes: 'What changed today',
}

/** An empty card for a widget the person added before anything has been captured. */
function placeholderCard(kind: string): CareCard {
  const meta = (cardMeta as Record<string, { title: string; subtitle: string }>)[kind]
  return {
    kind,
    title: meta?.title || derivedLabels[kind] || kind,
    subtitle: meta?.subtitle || 'Added by you. It will fill in as you talk.',
    status: 'Nothing captured yet',
    items: [],
    derived: !meta,
  }
}

function loadConfig(): CockpitConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(configKey) || '{}') as Partial<CockpitConfig>
    return { mode: raw.mode === 'custom' ? 'custom' : 'recommended', pinned: raw.pinned || [], hidden: raw.hidden || [] }
  } catch { return { mode: 'recommended', pinned: [], hidden: [] } }
}

const certaintyLabel: Record<Fact['certainty'], string> = {
  reported: 'You told me',
  confirmed: 'Confirmed',
  needs_verification: 'Needs verification',
}

export function Cockpit({ facts, memory = [], conversationId, onChanged, onDeleted }: {
  facts: Fact[]
  memory?: Fact[]
  conversationId: string
  onChanged: () => void
  onDeleted: (fact: Fact) => void
}) {
  const [config, setConfig] = useState<CockpitConfig>(loadConfig)
  const [picker, setPicker] = useState(false)
  useEffect(() => { localStorage.setItem(configKey, JSON.stringify(config)) }, [config])

  const { mode, pinned, hidden } = config
  const cards = useMemo(() => careCards(facts, conversationId, memory), [facts, conversationId, memory])
  const visible = useMemo(() => {
    if (mode === 'recommended') return cards
    const shown = cards.filter(card => pinned.includes(card.kind) || !hidden.includes(card.kind))
    // A pinned widget with nothing captured yet still has to appear, otherwise
    // adding it looks like it did nothing.
    const present = new Set(shown.map(card => card.kind))
    const placeholders = pinned
      .filter(kind => !present.has(kind))
      .map(kind => placeholderCard(kind))
    return [...shown, ...placeholders]
  }, [cards, mode, pinned, hidden])
  const ordered = useMemo(() => {
    const isPinned = (card: CareCard) => pinned.includes(card.kind)
    return [...visible.filter(isPinned), ...visible.filter(card => !isPinned(card))]
  }, [visible, pinned])

  const setMode = (next: Mode) => setConfig(current => ({ ...current, mode: next }))
  const togglePin = (kind: string) => setConfig(current => ({
    ...current,
    pinned: current.pinned.includes(kind) ? current.pinned.filter(item => item !== kind) : [...current.pinned, kind],
  }))
  const toggleKind = (kind: string) => setConfig(current => current.pinned.includes(kind)
    ? { ...current, mode: 'custom', pinned: current.pinned.filter(item => item !== kind), hidden: [...new Set([...current.hidden, kind])] }
    : { ...current, mode: 'custom', pinned: [...new Set([...current.pinned, kind])], hidden: current.hidden.filter(item => item !== kind) })

  const addable = [
    ...widgets.map(widget => ({ kind: widget as string, label: cardMeta[widget].title })),
    ...Object.entries(derivedLabels).map(([kind, label]) => ({ kind, label })),
  ]

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">Live care view</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-full border border-line p-0.5 text-xs">
            <button onClick={() => setMode('recommended')} className={`rounded-full px-2.5 py-1 transition ${mode === 'recommended' ? 'bg-ink text-panel' : 'text-muted hover:bg-line/50'}`}>Recommended</button>
            <button onClick={() => setMode('custom')} className={`rounded-full px-2.5 py-1 transition ${mode === 'custom' ? 'bg-ink text-panel' : 'text-muted hover:bg-line/50'}`}>Custom</button>
          </div>
          <button onClick={() => setPicker(value => !value)} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs transition hover:bg-line/50">
            <Plus size={12} /> Add widget
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {cards.length} views · patient-reported · {mode === 'recommended' ? 'curated for you' : 'your selection'}
      </p>

      {picker && (
        <div className="mt-3 rounded-2xl border border-line bg-panel p-3">
          <div className="flex flex-wrap gap-1.5">
            {addable.map(({ kind, label }) => (
              <button
                key={kind}
                onClick={() => toggleKind(kind)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${pinned.includes(kind) ? 'bg-teal text-panel' : 'border border-line hover:bg-line/50'}`}
              >
                {pinned.includes(kind) ? '−' : '+'} {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">Adding a widget switches to Custom and keeps it visible. Removing one only hides it — your care details stay saved.</p>
        </div>
      )}
      {ordered.length === 0 ? (
        <p className="mt-3 rounded-3xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
          As you talk, Harbor sorts what it hears into these views. Nothing is verified by Harbor.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {ordered.map(card => (
            <Card key={card.kind} card={card} pinned={pinned.includes(card.kind)} onPin={() => togglePin(card.kind)} onChanged={onChanged} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </section>
  )
}

function Card({ card, pinned, onPin, onChanged, onDeleted }: {
  card: CareCard
  pinned: boolean
  onPin: () => void
  onChanged: () => void
  onDeleted: (fact: Fact) => void
}) {
  if (card.resolved) {
    return (
      <article className="flex items-center gap-2 rounded-2xl border border-teal/30 bg-teal-soft/50 px-4 py-2 text-xs text-teal">
        <Check size={14} /> <span className="font-medium">{card.title}</span> <span className="text-teal/80">resolved</span>
      </article>
    )
  }

  return (
    <article data-tone={cardTone(card)} className={`care-card rise ${pinned ? 'ring-1 ring-teal/30' : ''}`}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{card.title}</h3>
          <p className="text-xs text-muted">{card.subtitle}</p>
        </div>
        <button onClick={onPin} title={pinned ? 'Unpin' : 'Pin'} className="text-muted transition hover:text-teal">
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      </header>
      <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${card.derived ? 'bg-ink/80 text-panel' : 'bg-line/70 text-muted'}`}>
        {card.status}
      </p>
      {card.note && <p className="mt-2 whitespace-pre-line text-xs text-muted">{card.note}</p>}
      {card.conflict && <ConflictPrompt conflict={card.conflict} onChanged={onChanged} />}
      {card.checklist && <Checklist rows={card.checklist} />}
      <ul className="mt-3 space-y-2">
        {card.items.slice(0, 5).map(fact => (
          <FactRow key={fact.id} fact={fact} onChanged={onChanged} onDeleted={onDeleted} />
        ))}
      </ul>
      {!card.items.length && !card.checklist && !card.conflict && !card.note && (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
          Nothing captured yet. This view fills in as you talk.
        </p>
      )}
    </article>
  )
}

function cardTone(card: CareCard): 'teal' | 'plum' | 'amber' | 'rose' {
  const kind = card.kind.toLowerCase()
  if (/people|provider|preference|circle/.test(kind)) return 'plum'
  if (/question|concern|loop|medication|attempt/.test(kind)) return 'amber'
  if (/next|transport|decision|goal/.test(kind)) return 'rose'
  return 'teal'
}

function Checklist({ rows }: { rows: ChecklistRow[] }) {
  const marker: Record<ChecklistRow['state'], string> = { done: '✓', needed: '□', unknown: '?' }
  const tone: Record<ChecklistRow['state'], string> = { done: 'text-teal', needed: 'text-amber', unknown: 'text-muted' }
  return (
    <ul className="mt-3 space-y-1">
      {rows.map(row => (
        <li key={row.label} className="flex items-center gap-2 text-sm">
          <span className={`w-4 text-center font-semibold ${tone[row.state]}`}>{marker[row.state]}</span>
          <span className={row.state === 'done' ? 'text-muted line-through' : ''}>{row.label}</span>
          {row.detail && row.state !== 'done' && <span className="truncate text-xs text-muted">· {row.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

function ConflictPrompt({ conflict, onChanged }: { conflict: Conflict; onChanged: () => void }) {
  const resolve = async (keep: 'previous' | 'next') => {
    const dropId = keep === 'previous' ? conflict.nextId : conflict.previousId
    if (dropId) await api.updateFact(dropId, { status: 'superseded' })
    onChanged()
  }
  return (
    <div className="mt-3 rounded-2xl border border-amber/40 bg-amber-soft/60 p-3">
      <p className="text-xs text-amber">Previously: {conflict.previous}</p>
      <p className="mt-1 text-sm font-medium">Now: {conflict.next}</p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => void resolve('next')} className="rounded-full bg-teal px-3 py-1 text-xs font-medium text-panel">Use the new one</button>
        <button onClick={() => void resolve('previous')} className="rounded-full border border-line px-3 py-1 text-xs font-medium">Keep previous</button>
      </div>
    </div>
  )
}

function FactRow({ fact, onChanged, onDeleted }: { fact: Fact; onChanged: () => void; onDeleted: (fact: Fact) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact.detail)
  const [expanded, setExpanded] = useState(false)

  const save = async () => {
    const detail = draft.trim()
    setEditing(false)
    if (!detail || detail === fact.detail) return
    await api.updateFact(fact.id, { detail })
    onChanged()
  }

  const act = async (patch: { status?: Fact['status']; certainty?: Fact['certainty'] }) => { await api.updateFact(fact.id, patch); onChanged() }

  return (
    <li className="fact-row">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${widgetTint(fact.widget)}`}>
          {widgetLabel(fact.widget)}
        </span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={event => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') { setDraft(fact.detail); setEditing(false) } }}
            className="min-w-0 flex-1 rounded-lg border border-teal bg-paper px-2 py-1 text-sm outline-none"
          />
        ) : (
          <button onClick={() => setExpanded(value => !value)} className="min-w-0 flex-1 text-left text-sm">
            {fact.detail}
          </button>
        )}
        <div className="flex shrink-0 gap-1 text-muted">
          {fact.status !== 'completed' && (
            <button onClick={() => void act({ status: 'completed' })} title="Mark done" className="transition hover:text-teal"><Check size={14} /></button>
          )}
          <button onClick={() => { setDraft(fact.detail); setEditing(true) }} title="Edit" className="transition hover:text-ink"><Pencil size={14} /></button>
          <button onClick={() => onDeleted(fact)} title="Delete" className="transition hover:text-rose"><Trash2 size={14} /></button>
        </div>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {fact.source_quote && <p className="border-l-2 border-line pl-2 text-xs italic text-muted">“{fact.source_quote}”</p>}
          <p className="flex items-center gap-1 pl-2 text-[11px] text-muted">
            <ChevronRight size={10} /> {certaintyLabel[fact.certainty]} · remembered {new Date(fact.created_at).toLocaleDateString()}
            {fact.level && ` · ${fact.level.replace('_', ' ')}`}
            {fact.priority === 'high' && ' · top priority'}
          </p>
        </div>
      )}
    </li>
  )
}
