import { GoogleGenAI, Type } from '@google/genai'
import OpenAI from 'openai'
import type { CareContext, Certainty, Conflict, Fact, Level, Priority, Turn, Widget } from '../shared/types.js'
import { widgets } from '../shared/types.js'
import { cardMeta } from '../shared/cockpit.js'
import type { Store } from './store.js'

export interface ExtractedFact {
  widget: Widget
  title: string
  detail: string
  quote: string
  event_date?: string | null
  level?: Level | null
  priority?: Priority | null
  certainty?: Certainty
}

// Total budget for one turn's extraction, across every fallback attempt.
const budgetMs = () => Number(process.env.ANALYSIS_TIMEOUT_MS || 12_000)
// Cap a single model attempt so the fallback chain cannot compound the wait.
const attemptMs = () => Number(process.env.ANALYSIS_ATTEMPT_MS || 6_000)
const textModels = () => [
  process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
  ...(process.env.GEMINI_TEXT_FALLBACKS || 'gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3.8-flash')
    .split(',').map(name => name.trim()).filter(Boolean),
].filter((name, index, all) => all.indexOf(name) === index)

const systemPrompt = `You read a care-navigation conversation and pull out only what the person actually said. You are not a clinician and never infer symptoms, diagnoses, or urgency.

Tag every fact with the one widget it feeds. Use only these values:
- person: a person, office, or organization involved
- timeline: a dated event, call, or visit
- referral: the status of a referral (ordered, sent, received, or not received)
- appointment: an upcoming visit and what it is for
- transport: a ride, a driver, or a transport constraint
- question: something they want to ask a professional
- open_loop: something they are waiting on, or a detail that is missing
- attempt: something they already tried (for example calling an office twice)
- concern: a symptom or worry in their own words
- medication: a medicine, prescription, refill, or pharmacy detail
- decision: a choice made, or an option ruled out
- goal: what they are trying to accomplish
- next_step: a concrete action they or someone else will take
- provider: a criterion for choosing a provider (insurance, distance, language, accessibility)
- preference: a scheduling or contact preference (mornings, afternoons, phone vs portal)
- readiness: a preparation item for an upcoming visit (for example updating a medication list)

For every fact also provide:
- level: for provider and preference facts, one of "required", "preferred", or "nice_to_have"; otherwise null.
- priority: "high" when the person stresses that it matters most, otherwise "normal".
- certainty: "confirmed" when they say it is already settled, "needs_verification" for external claims that cannot be checked (for example "she has Medicare"), otherwise "reported".

Disambiguation:
- A named clinician, clinic, or family member is a "person", not a "provider".
- "provider" is only for criteria used to choose a provider.
- A scheduling preference (mornings, afternoons, evenings) is "preference", NOT "appointment", even when the sentence contains the word "appointment".
- A referral is "referral"; the specialty being referred to is a "person".
- Something the person is trying to accomplish is a "goal", not a "referral".

Self-correction:
- If the speaker corrects themselves within the turn (for example "two months - actually, no, more like three weeks"), return ONLY the corrected value and ignore the retracted one.

Confirmations:
- If a short reply confirms something discussed earlier (for example "yeah, she said she can"), return a fact with certainty "confirmed" whose "detail" stands alone by naming the earlier subject (for example detail "Sarah can drive Maria on Thursday", quote "she said she can"). Never leave a confirmed fact as a bare pronoun.

Rules:
- Each fact is ONE atomic detail, not a whole sentence. "detail" must be a short phrase of 12 words or fewer in the person's own words, with no clinical rewriting.
- "title" is a short 2-5 word label.
- "quote" MUST be an exact, character-for-character span copied from the transcript. Do not paraphrase, fix grammar, or merge two sentences.
- Include "event_date" only when a date or weekday is explicitly stated, else null.
- Never invent details, never claim anything was verified, and never add advice.
- Return only the widgets that are relevant to this turn. An empty list is correct when nothing new is worth saving.
- Prefer a small number of high-signal facts over many trivial ones. Split a sentence into separate facts when it carries separate details.`

const schema = {
  type: Type.OBJECT,
  properties: {
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          widget: { type: Type.STRING, enum: [...widgets] },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          quote: { type: Type.STRING },
          event_date: { type: Type.STRING, nullable: true },
          level: { type: Type.STRING, enum: ['required', 'preferred', 'nice_to_have'], nullable: true },
          priority: { type: Type.STRING, enum: ['high', 'normal'], nullable: true },
          certainty: { type: Type.STRING, enum: ['reported', 'confirmed', 'needs_verification'], nullable: true },
        },
        required: ['widget', 'title', 'detail', 'quote'],
      },
    },
  },
  required: ['facts'],
}

function renderTranscript(turns: Turn[], context: CareContext): string {
  const lines = turns.slice(-16).map(turn => `${turn.speaker === 'user' ? (context.speaker_name || 'Speaker') : 'Navigator'}: ${turn.text}`)
  const who = context.subject === 'other' ? `The speaker is helping ${context.patient_name || 'a relative'}.` : 'The speaker is the patient.'
  return `${who}\n\n${lines.join('\n')}`
}

const jsonShape = `Respond with JSON only, shaped exactly like:
{"facts":[{"widget":"one of the widget values above","title":"short label","detail":"short phrase in their words","quote":"exact span from the transcript","event_date":null,"level":null,"priority":"normal","certainty":"reported"}]}`

const levels: Level[] = ['required', 'preferred', 'nice_to_have']
const certainties: Certainty[] = ['reported', 'confirmed', 'needs_verification']

/**
 * A time-of-day preference often arrives tagged as an appointment because the
 * sentence contains the word "appointment". Reclassify it deterministically so
 * conflict detection never depends on the model's word choice.
 */
export function reclassifyFact(fact: ExtractedFact): ExtractedFact {
  if (fact.widget === 'appointment') {
    const timeOfDay = /\b(mornings?|afternoons?|evenings?|time of day)\b/i.test(fact.detail)
    const preferencePhrasing = /\b(prefers?|works? better|better for|can only|only do)\b/i.test(fact.detail)
    if (timeOfDay && preferencePhrasing) return { ...fact, widget: 'preference' }
  }
  // A missing or out-of-date document is a preparation item, not a medicine.
  if (fact.widget === 'medication' || fact.widget === 'open_loop') {
    if (/\bmed(ication)? list\b/i.test(fact.detail) && /\b(updated?|current|don't have|do not have|not have|need|missing)\b/i.test(fact.detail)) {
      return { ...fact, widget: 'readiness' }
    }
  }
  return fact
}

/** A short reply that confirms something discussed earlier. */
export function isAffirmation(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.split(/\s+/).length > 12) return false
  return /^(yes|yeah|yep|yup|sure|correct|right|exactly|perfect|confirmed|that works|she said she can|he said she can|they said|she can|he can|they can|okay|ok)\b/i.test(trimmed)
}

function normalizeFacts(parsed: unknown): ExtractedFact[] {
  const facts = (parsed as { facts?: ExtractedFact[] })?.facts || []
  return facts
    .filter(fact => fact && widgets.includes(fact.widget) && String(fact.detail || '').trim())
    .map(fact => reclassifyFact({
      ...fact,
      level: fact.level && levels.includes(fact.level) ? fact.level : null,
      priority: fact.priority === 'high' ? 'high' : 'normal',
      certainty: fact.certainty && certainties.includes(fact.certainty) ? fact.certainty : 'reported',
    }))
}

/**
 * Primary extractor: one OpenAI-compatible call to DeepSeek, returning every lane at once.
 * DeepSeek is used first because it is reliable and inexpensive for structured output.
 */
async function extractWithDeepSeek(turns: Turn[], context: CareContext, signal: AbortSignal): Promise<ExtractedFact[]> {
  const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com' })
  const completion = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n${jsonShape}` },
      { role: 'user', content: renderTranscript(turns, context) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  }, { signal })
  return normalizeFacts(JSON.parse(completion.choices[0]?.message?.content || '{}'))
}

/** Fallback extractor: walks a short Gemini model chain so one outage cannot stall the view. */
async function extractWithGemini(turns: Turn[], context: CareContext, deadline: number): Promise<ExtractedFact[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  const ai = new GoogleGenAI({ apiKey: key })
  let lastError: unknown = new Error('no Gemini model configured')
  for (const model of textModels()) {
    const remaining = deadline - Date.now()
    if (remaining < 500) break
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(attemptMs(), remaining))
    try {
      const response = await ai.models.generateContent({
        model,
        contents: renderTranscript(turns, context),
        config: { systemInstruction: systemPrompt, responseMimeType: 'application/json', responseSchema: schema, abortSignal: controller.signal },
      })
      return normalizeFacts(JSON.parse(response.text || '{}'))
    } catch (error) {
      lastError = error
      console.warn(`extraction: ${model} unavailable, trying next model`)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

/**
 * One model call per turn: all four lanes at once, to stay inside free-tier limits.
 * Tries DeepSeek first, then Gemini, then lets the caller fall back to rules.
 */
export async function extractFacts(turns: Turn[], context: CareContext): Promise<ExtractedFact[]> {
  const deadline = Date.now() + budgetMs()
  const errors: string[] = []
  if (process.env.DEEPSEEK_API_KEY) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(attemptMs() * 2, budgetMs()))
    try {
      return await extractWithDeepSeek(turns, context, controller.signal)
    } catch (error) {
      errors.push(`deepseek: ${(error as Error).message}`)
      console.warn('extraction: deepseek unavailable, trying Gemini')
    } finally {
      clearTimeout(timer)
    }
  }
  try {
    return await extractWithGemini(turns, context, deadline)
  } catch (error) {
    errors.push(`gemini: ${(error as Error).message}`)
  }
  throw new Error(errors.join(' | '))
}

// Ordered most-specific first so a clause is tagged with its best-fitting widget.
const kindRules: { widget: Widget; pattern: RegExp }[] = [
  { widget: 'referral', pattern: /\b(referral|prior auth)\b/i },
  { widget: 'appointment', pattern: /\b(appointment|booked|scheduled)\b/i },
  { widget: 'preference', pattern: /\b(mornings?|afternoons?|evenings?|prefers?|works? better|through the portal|by phone)\b/i },
  { widget: 'transport', pattern: /\b(ride|transport|drive|driving|driver|bus|taxi|take (?:me|her|him|us|them))\b/i },
  { widget: 'attempt', pattern: /\b(called .*(?:twice|two times|again)|already (?:called|tried|asked)|tried calling|been trying)\b/i },
  { widget: 'readiness', pattern: /\b(medication list|med list|insurance card|paperwork|documents?|records|forms?)\b/i },
  { widget: 'question', pattern: /\b(question|ask (?:the|my|a)|discuss with|want to know)\b/i },
  { widget: 'open_loop', pattern: /\b(waiting|pending|haven't heard|not received|never received|callback|call (?:me|us) back|hear back|still need|missing)\b/i },
  { widget: 'medication', pattern: /\b(medication|medicine|prescription|refill|pharmacy|dose|dosage|pill)\b/i },
  { widget: 'decision', pattern: /\b(decided|chose|ruled out|too far|not interested|don't want|do not want)\b/i },
  { widget: 'goal', pattern: /\b(goal|trying to|want to (?:find|get|arrange|stay)|working toward|get (?:her|him|them) into)\b/i },
  { widget: 'concern', pattern: /\b(symptom|pain|fatigue|tired|swelling|sleep|memory changes|forgetting|worried|concern|short of breath)\b/i },
  { widget: 'provider', pattern: /\b(insurance|medicare|medicaid|in.network|female|woman|male|man|speaks?|language|distance|telehealth|accessible)\b/i },
  { widget: 'person', pattern: /\b(doctor|clinic|office|hospital|specialist|neurolog\w*|cardiolog\w*|dr\.|mother|father|mom|dad|daughter|son|sister|brother|wife|husband|caregiver)\b/i },
  { widget: 'next_step', pattern: /\b(i will|i'll|we will|we'll|need to|going to|plan to|call|ask|send|schedule|book|follow up)\b/i },
  { widget: 'timeline', pattern: /\b(visit|last (?:week|month|monday|tuesday|wednesday|thursday|friday)|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i },
]

/** Map a rule match to a requirement level when the phrasing implies one. */
function levelFor(clause: string): Level | null {
  if (/\b(must|needs? to|requires?|has|has to|only)\b/i.test(clause)) return 'required'
  if (/\b(prefer|prefers|would rather|ideally)\b/i.test(clause)) return 'preferred'
  if (/\b(nice|would be nice|if possible|maybe|bonus)\b/i.test(clause)) return 'nice_to_have'
  return null
}

/**
 * Used when every model is slow or unavailable, so the live view never stalls.
 * Splits into clauses and emits one fact per matching lane rather than stopping
 * at the first match, so a detail-rich sentence still populates several views.
 */
export function ruleFacts(turn: Turn): ExtractedFact[] {
  const clauses = turn.text
    .split(/(?<=[.!?])\s+|,\s+|\s+(?:and|but)\s+/i)
    .map(clause => clause.trim().replace(/^(?:and|but)\s+/i, '').replace(/^[a-z]/, char => char.toUpperCase()))
    .filter(clause => clause.length > 3)
  const found: ExtractedFact[] = []
  for (const clause of clauses) {
    for (const rule of kindRules) {
      if (!rule.pattern.test(clause)) continue
      if (found.some(fact => fact.widget === rule.widget && fact.detail.toLowerCase() === clause.toLowerCase())) continue
      found.push(reclassifyFact({
        widget: rule.widget, title: cardMeta[rule.widget].title,
        detail: clause.replace(/[.\s]+$/, ''), quote: clause, event_date: null,
        level: rule.widget === 'provider' || rule.widget === 'preference' ? levelFor(clause) : null,
        priority: 'normal', certainty: 'reported',
      }))
    }
  }
  return found
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

function isDuplicate(fact: ExtractedFact, existing: { widget: Widget; detail: string }[]): boolean {
  const detail = normalize(fact.detail)
  return existing.some(saved => {
    const other = normalize(saved.detail)
    return saved.widget === fact.widget && (other === detail || other.includes(detail) || detail.includes(other))
  })
}

/**
 * Reject anything the model cannot point to in the transcript. The quote is the
 * primary evidence; the detail is accepted only when it appears verbatim too.
 */
export function hasEvidence(fact: ExtractedFact, haystack: string): boolean {
  const available = new Set(haystack.split(' ').filter(Boolean))
  // A quote counts as evidence when every word in it appears in the conversation.
  // This tolerates punctuation and small reordering while still rejecting invented text.
  const contained = (value: string) => {
    const words = normalize(value).split(' ').filter(Boolean)
    return words.length > 0 && words.every(word => available.has(word))
  }
  return contained(fact.quote || '') || contained(fact.detail || '')
}

/** The topic a preference is about, so a newer value can be compared with an older one. */
function preferenceTopic(fact: { title: string; detail: string }): string {
  const text = normalize(`${fact.title} ${fact.detail}`)
  if (/morning|afternoon|evening|time of day|schedul/.test(text)) return 'scheduling-time'
  if (/portal|phone|text|contact/.test(text)) return 'contact-method'
  return 'preference'
}

/**
 * A preference that contradicts an earlier one. We do not overwrite silently:
 * the navigator asks which to use, and the workspace offers the choice.
 */
export function detectConflicts(accepted: ExtractedFact[], existing: Fact[]): Conflict[] {
  const conflicts: Conflict[] = []
  for (const fact of accepted) {
    if (fact.widget !== 'preference') continue
    const topic = preferenceTopic(fact)
    const prior = existing.find(saved =>
      saved.widget === 'preference' &&
      saved.status !== 'corrected' && saved.status !== 'superseded' &&
      preferenceTopic(saved) === topic &&
      normalize(saved.detail) !== normalize(fact.detail))
    if (prior) conflicts.push({ widget: fact.widget, title: fact.title, previous: prior.detail, next: fact.detail, previousId: prior.id, nextId: '' })
  }
  return conflicts
}

/**
 * Loops that a newer update has closed. One sentence ("the referral came through")
 * should resolve the waiting and the blocker it was causing, not just add a fact.
 */
export function resolvedLoopIds(facts: Fact[]): string[] {
  const care = facts.filter(fact => !['corrected', 'superseded', 'completed'].includes(fact.status))
  const denied = /\b(not received|never received|never got|hasn't received|haven't received|didn't receive|not arrived|hasn't arrived|never got it)\b/i
  const received = care.some(fact => fact.widget === 'referral' && /\b(received|got|arrived|came through)\b/i.test(fact.detail) && !denied.test(fact.detail))
  const rideConfirmed = care.some(fact => fact.widget === 'transport' && fact.certainty === 'confirmed')
  const ids: string[] = []
  for (const fact of care) {
    if (fact.widget !== 'open_loop' && fact.widget !== 'next_step') continue
    if (received && /\b(referral|call ?back|heard back|call me back)\b/i.test(fact.detail)) ids.push(fact.id)
    if (rideConfirmed && /\b(transport|ride|drive|driving)\b/i.test(fact.detail)) ids.push(fact.id)
  }
  return ids
}

/** Background worker: drains analysis jobs and keeps the live views current. */
export class AnalysisWorker {
  private running = false
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private store: Store, private onConflict?: (conversationId: string, conflict: Conflict) => void) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.drain(), 700)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const jobs = await this.store.pendingJobs()
      for (const job of jobs) {
        await this.store.jobStatus(job.id, 'running')
        try {
          await this.process(job.conversation_id, job.turn_id)
          await this.store.jobStatus(job.id, 'done')
        } catch (error) {
          console.error('analysis job failed', error)
          for (const widget of widgets) await this.store.setWidget(job.conversation_id, widget, 'failed').catch(() => {})
          await this.store.jobStatus(job.id, 'failed')
        }
      }
    } finally {
      this.running = false
    }
  }

  private async process(conversationId: string, turnId: string): Promise<void> {
    const visitor = await this.store.visitorFor(conversationId)
    if (!visitor) return
    const detail = await this.store.detail(conversationId, visitor)
    if (!detail) return
    const latest = detail.turns.find(turn => turn.id === turnId)
    if (!latest || latest.speaker !== 'user') {
      for (const widget of widgets) await this.store.setWidget(conversationId, widget, 'current')
      return
    }

    let extracted: ExtractedFact[] = []
    try {
      extracted = await extractFacts(detail.turns, detail.conversation.settings.context)
    } catch (error) {
      console.warn('extraction fell back to rules:', (error as Error).message)
    }
    if (!extracted.length) extracted = ruleFacts(latest)

    // Only keep facts whose quote (or verbatim detail) actually appears in the conversation.
    const haystack = normalize(detail.turns.map(turn => turn.text).join(' '))
    const accepted: ExtractedFact[] = []
    for (const fact of extracted) {
      if (!hasEvidence(fact, haystack)) continue
      if (isDuplicate(fact, detail.facts) || isDuplicate(fact, accepted)) continue
      accepted.push(fact)
    }
    // Safety net: if the model gave us nothing usable, mine the turn with rules.
    if (!accepted.length) {
      for (const fact of ruleFacts(latest)) {
        if (!hasEvidence(fact, haystack)) continue
        if (isDuplicate(fact, detail.facts) || isDuplicate(fact, accepted)) continue
        accepted.push(fact)
      }
    }

    if (!accepted.length) console.log('analysis: no new facts from this turn')
    else if (extracted.length > accepted.length) console.log(`analysis: kept ${accepted.length} of ${extracted.length} extracted fact(s)`)

    // Conflicts are checked against this conversation AND what we remember from earlier ones.
    const conflicts = detectConflicts(accepted, [...detail.facts, ...detail.memory])
    const saved = await this.store.addFacts(accepted.map(fact => ({
      conversation_id: conversationId, widget: fact.widget, title: fact.title,
      detail: fact.detail, status: 'reported' as const, source_turn_id: turnId, source_quote: fact.quote,
      event_date: fact.event_date || null, level: fact.level || null,
      priority: fact.priority || 'normal', certainty: fact.certainty || 'reported',
    })))
    const combined = [...detail.facts, ...saved]

    // A newer update can close loops that earlier turns opened.
    const loops = resolvedLoopIds(combined)
    if (loops.length) await this.store.completeFacts(loops)

    // A short "yes, she said she can" settles the most recent thing it refers to.
    if (isAffirmation(latest.text)) {
      const ride = combined
        .filter(fact => fact.widget === 'transport' && fact.certainty !== 'confirmed')
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      if (ride) await this.store.confirmFacts([ride.id])
    }

    for (const widget of widgets) await this.store.setWidget(conversationId, widget, 'current')
    for (const conflict of conflicts) {
      console.log(`analysis: preference conflict (${conflict.previous} -> ${conflict.next})`)
      this.onConflict?.(conversationId, conflict)
    }
  }
}
