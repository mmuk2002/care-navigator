import type { Conflict, Fact, Widget } from './types.js'
import { widgets } from './types.js'

export type ChecklistState = 'done' | 'needed' | 'unknown'

export interface ChecklistRow {
  label: string
  state: ChecklistState
  detail?: string
}

export interface CareCard {
  kind: string
  title: string
  subtitle: string
  status: string
  items: Fact[]
  checklist?: ChecklistRow[]
  note?: string
  derived?: boolean
  /** A card that is finished collapses, then hides, so the workspace reflows. */
  resolved?: boolean
  /** Previous/next values for a preference that changed. */
  conflict?: Conflict
}

/** Title, subtitle, and provenance label for each widget. */
export const cardMeta: Record<Widget, { title: string; subtitle: string; status: string }> = {
  person: { title: 'Care circle', subtitle: 'People and offices involved.', status: 'Patient-reported' },
  timeline: { title: 'Care timeline', subtitle: 'Reported events and dates.', status: 'Dates are patient-reported' },
  referral: { title: 'Referral tracker', subtitle: 'Reported referral updates.', status: 'Check which office each concerns' },
  appointment: { title: 'Upcoming care', subtitle: 'The visit and what it is for.', status: 'Patient-reported' },
  transport: { title: 'Transportation', subtitle: 'A ride plan is not a confirmed ride.', status: 'Ride not confirmed' },
  question: { title: 'Questions to ask', subtitle: 'Bring these to the appropriate professional.', status: 'Patient-reported questions' },
  open_loop: { title: 'Open loops', subtitle: 'Waiting on someone or missing a detail.', status: 'Still unresolved' },
  attempt: { title: 'Already tried', subtitle: 'What you have already done.', status: 'Your own attempts' },
  concern: { title: 'Concerns to discuss', subtitle: 'Your own words; no diagnosis inferred.', status: 'Patient-reported observation' },
  medication: { title: 'Medications & pharmacy', subtitle: 'Reported medicine and refill details.', status: 'Confirm any dose change with a clinician' },
  decision: { title: 'Decisions & ruled out', subtitle: 'Keep choices and reasons available later.', status: 'Patient-stated choice' },
  goal: { title: 'Care goals', subtitle: 'What you are trying to accomplish.', status: 'Patient-stated goal' },
  next_step: { title: 'Next steps', subtitle: 'Concrete actions to take.', status: 'Patient-stated action' },
  provider: { title: 'Provider requirements', subtitle: 'Your stated criteria and known unknowns.', status: 'Availability and insurance unverified' },
  preference: { title: 'Preferences', subtitle: 'How this family likes to schedule and communicate.', status: 'Patient-stated preference' },
  readiness: { title: 'Visit preparation', subtitle: 'What to bring or prepare before the visit.', status: 'Preparation item' },
}

/** Order the workspace so the most decision-relevant cards lead. */
const cardOrder: string[] = [
  'anchor', 'possible_update', 'progress', 'upcoming', 'readiness', 'agenda', 'blockers',
  'feasibility', 'referral', 'open_loop', 'attempt', 'transport', 'provider', 'preference',
  'question', 'concern', 'medication', 'decision', 'next_step', 'person', 'timeline', 'changes',
]

const active = (facts: Fact[]) => facts.filter(fact => fact.status !== 'corrected' && fact.status !== 'superseded')
const textOf = (fact: Fact) => `${fact.title} ${fact.detail}`
const newest = (facts: Fact[]) => [...facts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
const byWidget = (facts: Fact[], widget: Widget) => newest(facts.filter(fact => fact.widget === widget))
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const RIDE = /\b(ride|drive|driver|take (?:me|her|him|us|them)|transport)\b/i
// "She doesn't drive" is a constraint that creates the need, not a ride that meets it.
const NO_DRIVE = /\b(doesn'?t drive|does not drive|can'?t drive|cannot drive|no (?:car|ride|way)|needs? a ride|without a ride)\b/i

/** The most recent confirmed ride that actually provides transportation. */
export function confirmedRide(facts: Fact[]): Fact | undefined {
  return newest(facts.filter(fact =>
    fact.widget === 'transport' && fact.certainty === 'confirmed' && RIDE.test(fact.detail) && !NO_DRIVE.test(fact.detail)))[0]
}

export function hasConfirmedRide(facts: Fact[]): boolean {
  return Boolean(confirmedRide(facts))
}
const receipt = /\b(received|got (?:the|it)|arrived|came through)\b/i
const noReceipt = /\b(not received|never received|never got|hasn't received|haven't received|didn't receive|not arrived|hasn't arrived|never got it)\b/i

function weekdayOf(fact: Fact): string | null {
  const match = textOf(fact).match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?\b/i)
  return match ? DAYS.find(day => day.toLowerCase() === match[1].toLowerCase()) || null : null
}

/** The next navigation step, resolved in priority order. */
export function nextStep(facts: Fact[]): { text: string; fact: Fact } | null {
  const care = active(facts)
  const appointment = byWidget(care, 'appointment')[0]
  if (appointment) {
    const pending = readinessChecklist(care).find(row => row.state !== 'done')
    return pending ? { text: pendingAction(pending), fact: appointment } : { text: 'Prepare for the visit', fact: appointment }
  }

  const blocker = blockerSnippet(care)
  if (blocker) return { text: `Resolve: ${blocker.items[0].detail.replace(/[.\s]+$/, '')}`, fact: blocker.items[0] }

  const referrals = care.filter(fact => fact.widget === 'referral')
  if (referrals.length) {
    const joined = referrals.map(fact => fact.detail).join(' ')
    const sent = /\b(sent|submitted|resent|faxed|ordered)\b/i.test(joined)
    const got = referrals.some(fact => receipt.test(fact.detail) && !noReceipt.test(fact.detail))
    if (sent && !got) return { text: 'Confirm the referral was received', fact: referrals.find(fact => !receipt.test(fact.detail)) || referrals[0] }
    if (got) return { text: 'Schedule the appointment', fact: referrals.find(fact => receipt.test(fact.detail)) || referrals[0] }
  }

  const task = byWidget(care, 'next_step')[0]
  return task ? { text: task.detail.replace(/[.\s]+$/, ''), fact: task } : null
}

function pendingAction(row: ChecklistRow): string {
  switch (row.label) {
    case 'Transportation': return 'Arrange transportation'
    case 'Questions': return 'Add questions for the visit'
    case 'Medication list': return 'Update the medication list'
    case 'Insurance & documents': return 'Gather insurance and documents'
    default: return `Prepare: ${row.label}`
  }
}

/** The overarching goal: a stated goal, or one inferred from the situation. */
export function careGoal(facts: Fact[]): string | null {
  const care = active(facts)
  const stated = byWidget(care, 'goal')[0]
  if (stated) return stated.detail.replace(/[.\s]+$/, '')

  const specialty = care
    .map(fact => textOf(fact).toLowerCase().match(/\b(neurolog\w*|cardiolog\w*|physical therapy|dental|dentist|dermatolog\w*|orthoped\w*|psychiatr\w*|geriatric\w*)\b/)?.[1])
    .find(Boolean)
  if (specialty) return `Get established with ${specialty}`
  if (care.some(fact => fact.widget === 'appointment')) return 'Prepare for the upcoming visit'
  const open = byWidget(care, 'open_loop')[0]
  return open ? `Resolve: ${open.detail.replace(/[.\s]+$/, '')}` : null
}

/** Whether the appointment day matches reported transportation. */
export function feasibility(facts: Fact[]): CareCard | null {
  const care = active(facts)
  const appointment = byWidget(care, 'appointment').find(fact => weekdayOf(fact))
  if (!appointment) return null
  const day = weekdayOf(appointment)!
  const rides = care.filter(fact => fact.widget === 'transport' && weekdayOf(fact))
  if (!rides.length) return null
  const days = [...new Set(rides.map(weekdayOf).filter((value): value is string => Boolean(value)))]
  const resolved = days.includes(day)
  const confirmed = rides.some(fact => fact.certainty === 'confirmed' && weekdayOf(fact) === day)
  return {
    kind: 'feasibility', title: 'Logistics & feasibility', subtitle: 'A cross-check of your plans.', derived: true,
    status: resolved ? (confirmed ? `Transportation confirmed for ${day}` : `Likely resolved for ${day} — confirm?`) : `Attention: no ride reported for ${day}`,
    note: resolved ? `A ride is reported available on ${day}.` : `A ride is only reported for ${days.join(', ')}; the appointment is ${day}.`,
    items: [appointment, ...rides].slice(0, 3),
  }
}

/** Something that cannot move until another thing happens. */
export function blockerSnippet(facts: Fact[]): CareCard | null {
  const care = active(facts)
  const received = care.some(fact => fact.widget === 'referral' && receipt.test(fact.detail) && !noReceipt.test(fact.detail))
  const blockers = care.filter(fact =>
    (fact.widget === 'open_loop' || fact.widget === 'concern') &&
    /\b(can ?not|can't|cannot|won't) (?:schedule|book|start|proceed|move)|not until|blocked|until (?:the )?\w+ (?:arrives|comes|is received|is sent)|without (?:the|an?) \w+/i.test(textOf(fact)))
  if (!blockers.length) return null
  const open = blockers.filter(fact => !(received && /referral|received|call back/i.test(fact.detail)))
  if (!open.length) return null
  return {
    kind: 'blockers', title: 'Blocked', subtitle: 'Something has to happen first.', derived: true,
    status: 'Progress is blocked', note: open[0].detail, items: newest(open).slice(0, 3),
  }
}

/** Stage plan for the active referral/appointment goal. */
export function goalProgress(facts: Fact[]): CareCard | null {
  const care = active(facts)
  const referrals = care.filter(fact => fact.widget === 'referral')
  const appointments = care.filter(fact => fact.widget === 'appointment')
  const people = care.filter(fact => fact.widget === 'person')
  if (!referrals.length && !appointments.length) return null
  const joined = referrals.map(fact => fact.detail).join(' ')
  const booked = appointments.some(fact => /\b(booked|scheduled|appointment|at \d)\b/i.test(textOf(fact)))
  const stages: [string, boolean][] = [
    ['Referral ordered', referrals.length > 0],
    ['Referral sent', /\b(sent|submitted|resent|faxed|ordered)\b/i.test(joined)],
    ['Referral received', booked || referrals.some(fact => receipt.test(fact.detail) && !noReceipt.test(fact.detail))],
    ['Provider selected', people.length > 0],
    ['Appointment booked', booked],
    ['Visit prepared', readinessChecklist(care).every(row => row.state === 'done')],
  ]
  return {
    kind: 'progress', title: 'Goal progress', subtitle: 'Where this care goal stands.', derived: true,
    status: 'Patient-reported stages',
    note: stages.map(([label, done]) => `${label} ${done ? '✓' : '—'}`).join(' · '),
    items: newest([...appointments, ...referrals]).slice(0, 3),
  }
}

/** The visit agenda: concerns and questions, most important first. */
export function agenda(facts: Fact[]): CareCard | null {
  const care = active(facts)
  const appointment = byWidget(care, 'appointment')[0]
  if (!appointment) return null
  const items = [...care.filter(fact => fact.widget === 'concern' || fact.widget === 'question')]
    .sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)))
  if (!items.length) return null
  const top = items.find(fact => fact.priority === 'high')
  return {
    kind: 'agenda', title: 'Visit agenda', subtitle: 'What Maria most wants to discuss.', status: 'Patient-reported, most important first',
    note: top ? `Top priority: ${top.detail}` : undefined, items: items.slice(0, 6),
  }
}

/** What still needs to happen before the visit. */
export function readinessChecklist(facts: Fact[]): ChecklistRow[] {
  const care = active(facts)
  const rides = care.filter(fact => fact.widget === 'transport')
  const ride = confirmedRide(care)
  const questions = care.filter(fact => fact.widget === 'question')
  const meds = care.filter(fact => fact.widget === 'readiness' && /medication|med list/i.test(fact.detail))
  const docs = care.filter(fact => fact.widget === 'readiness' && /insurance|card|document|record/i.test(fact.detail))
  return [
    { label: 'Transportation', state: ride ? 'done' : rides.length ? 'unknown' : 'needed', detail: (ride || rides[0])?.detail },
    { label: 'Questions', state: questions.length ? 'done' : 'unknown', detail: questions[0]?.detail },
    { label: 'Medication list', state: meds.length ? 'needed' : 'unknown', detail: meds[0]?.detail },
    { label: 'Insurance & documents', state: docs.length ? 'needed' : 'unknown', detail: docs[0]?.detail },
  ]
}

/** Where the care circle stands, with an inferred role for each person. */
export function careTeam(facts: Fact[]): CareCard | null {
  const people = byWidget(active(facts), 'person')
  if (!people.length) return null
  return {
    kind: 'care_team', title: 'Care team', subtitle: 'People and offices involved.', status: 'Patient-reported',
    items: people.slice(0, 6),
  }
}

/** Detect a preference that contradicts an earlier one. */
export function preferenceTopic(fact: { title: string; detail: string }): string {
  const text = `${fact.title} ${fact.detail}`.toLowerCase()
  if (/morning|afternoon|evening|time of day|schedul/.test(text)) return 'scheduling-time'
  if (/portal|phone|text|contact/.test(text)) return 'contact-method'
  return 'preference'
}

export function preferenceConflicts(facts: Fact[]): Conflict[] {
  const prefs = active(facts).filter(fact => fact.widget === 'preference')
  const groups = new Map<string, Fact[]>()
  for (const fact of prefs) {
    const topic = preferenceTopic(fact)
    groups.set(topic, [...(groups.get(topic) || []), fact])
  }
  const conflicts: Conflict[] = []
  for (const group of groups.values()) {
    const distinct = [...new Set(group.map(fact => fact.detail))]
    if (distinct.length > 1) {
      const ordered = newest(group)
      const next = ordered[0]
      const previous = ordered.find(fact => fact.detail !== next.detail) || ordered[1]
      conflicts.push({ widget: 'preference', title: next.title, previous: previous.detail, next: next.detail, previousId: previous.id, nextId: next.id })
    }
  }
  return conflicts
}

/** A short confirmation chip for a newly captured detail. */
export function snippetFor(fact: Fact): string {
  if (fact.status === 'completed') return `✓ Resolved: ${fact.detail}`
  if (fact.status === 'superseded') return `↻ Replaced: ${fact.detail}`
  switch (fact.widget) {
    case 'question': return `Question saved: ${fact.detail}`
    case 'open_loop': return `Waiting on: ${fact.detail}`
    case 'next_step': return `Task detected: ${fact.detail}`
    case 'goal': return `Goal noted: ${fact.detail}`
    case 'person': return `Caregiver identified: ${fact.detail}`
    case 'transport': return `Logistics noted: ${fact.detail}`
    case 'medication': return `Medication noted: ${fact.detail}`
    case 'referral': return `Referral update: ${fact.detail}`
    case 'appointment': return `Appointment noted: ${fact.detail}`
    case 'concern': return `Concern captured: ${fact.detail}`
    case 'readiness': return `Prep item: ${fact.detail}`
    case 'preference': return `Preference noted: ${fact.detail}`
    case 'attempt': return `Attempt logged: ${fact.detail}`
    default: return `Captured: ${fact.detail}`
  }
}

/** What the conversation accomplished, for the end-of-call screen. */
export interface Accomplishments {
  resolved: string[]
  scheduled: string[]
  prepared: string[]
  stillToDo: string[]
  objective: string | null
}

export function accomplishments(facts: Fact[]): Accomplishments {
  const care = active(facts)
  const received = care.some(fact => fact.widget === 'referral' && receipt.test(fact.detail) && !noReceipt.test(fact.detail))
  const resolved = [
    ...(received ? ['Referral received'] : []),
    ...care.filter(fact => fact.widget === 'open_loop' && fact.status === 'completed').map(fact => fact.detail),
    ...(confirmedRide(care) ? [`Transportation: ${confirmedRide(care)!.detail}`] : []),
  ]
  return {
    resolved,
    scheduled: care.filter(fact => fact.widget === 'appointment').map(fact => fact.detail),
    prepared: care.filter(fact => fact.widget === 'concern' || fact.widget === 'question').map(fact => fact.detail),
    stillToDo: [
      ...care.filter(fact => fact.widget === 'readiness').map(fact => fact.detail),
      ...readinessChecklist(care).filter(row => row.state === 'needed').map(row => pendingAction(row)),
    ],
    objective: careGoal(care),
  }
}

/** Projects the shared fact graph into the live care views. */
export function careCards(facts: Fact[], conversationId: string, memory: Fact[] = []): CareCard[] {
  const care = active(facts)
  const current = care.filter(fact => fact.conversation_id === conversationId)
  const cards: CareCard[] = []

  const step = nextStep(care)
  const goal = careGoal(care)
  if (step || goal) {
    const anchorItems = [step?.fact, ...(step && step.fact.widget !== 'goal' ? byWidget(care, 'goal').slice(0, 1) : [])]
      .filter((fact): fact is Fact => Boolean(fact))
    cards.push({
      kind: 'anchor', title: 'Goal & next step', subtitle: 'Where this is going and what to do next.',
      status: step ? 'System-suggested next step' : 'Goal set', items: anchorItems,
      note: [goal && `Goal: ${goal}`, step && `Next: ${step.text}`].filter(Boolean).join('\n'),
    })
  }

  // A conflict can be with something remembered from an earlier conversation.
  const conflict = preferenceConflicts([...care, ...active(memory)])[0]
  if (conflict) {
    cards.push({
      kind: 'possible_update', title: 'Possible update', subtitle: 'This may replace something you told me before.',
      status: 'Needs your decision', items: [], conflict,
    })
  }

  const progress = goalProgress(care)
  if (progress) cards.push(progress)

  const appointment = byWidget(care, 'appointment')[0]
  if (appointment) {
    cards.push({ kind: 'upcoming', ...cardMeta.appointment, title: 'Upcoming care', items: byWidget(care, 'appointment').slice(0, 3) })
    const readiness = readinessChecklist(care)
    cards.push({
      kind: 'readiness', title: 'Appointment readiness', subtitle: 'What still needs to happen before the visit.',
      status: readiness.every(row => row.state === 'done') ? 'Ready for the visit' : 'Still preparing',
      items: [], checklist: readiness, derived: true,
    })
    const visitAgenda = agenda(care)
    if (visitAgenda) cards.push(visitAgenda)
  }

  const block = blockerSnippet(care)
  if (block) cards.push(block)
  const feas = feasibility(care)
  if (feas) cards.push(feas)

  const referralReceived = care.some(fact => fact.widget === 'referral' && receipt.test(fact.detail) && !noReceipt.test(fact.detail))
  for (const widget of widgets) {
    if (widget === 'goal') continue // surfaced by the goal anchor
    if (widget === 'appointment') continue // surfaced as Upcoming care
    if (widget === 'readiness') continue // surfaced in Appointment readiness
    if (widget === 'concern' || widget === 'question') {
      if (appointment) continue // surfaced in the visit agenda
    }
    const items = byWidget(care, widget)
    if (!items.length) continue
    if (widget === 'referral' && referralReceived && appointment) {
      cards.push({ ...cardMeta.referral, kind: 'referral', items: items.slice(0, 2), resolved: true, status: 'Resolved' })
      continue
    }
    cards.push({ kind: widget, ...cardMeta[widget], items })
  }

  if (current.length) {
    cards.push({
      kind: 'changes', title: 'What changed today', subtitle: 'Newly captured during this conversation.',
      status: 'Review before carrying forward', items: newest(current).slice(0, 6), derived: true,
    })
  }

  return cards.sort((a, b) => {
    const ai = cardOrder.indexOf(a.kind), bi = cardOrder.indexOf(b.kind)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
}
