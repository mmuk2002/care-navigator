import type { Fact, Widget } from './types.js'
import { widgets } from './types.js'

export interface CareCard {
  kind: string
  title: string
  subtitle: string
  status: string
  items: Fact[]
  note?: string
  derived?: boolean
}

/** Title, subtitle, and provenance label for each widget. */
export const cardMeta: Record<Widget, { title: string; subtitle: string; status: string }> = {
  person: { title: 'Care circle', subtitle: 'People and offices involved.', status: 'Patient-reported' },
  timeline: { title: 'Care timeline', subtitle: 'Reported events and dates.', status: 'Dates are patient-reported' },
  referral: { title: 'Referral tracker', subtitle: 'Reported referral updates.', status: 'Check which office each concerns' },
  appointment: { title: 'Appointment prep', subtitle: 'The visit, concerns, and logistics.', status: 'Patient-reported' },
  transport: { title: 'Transportation', subtitle: 'A ride plan is not a confirmed ride.', status: 'Ride not confirmed' },
  question: { title: 'Questions to ask', subtitle: 'Bring these to the appropriate professional.', status: 'Patient-reported questions' },
  open_loop: { title: 'Open loops', subtitle: 'Waiting on someone or missing a detail.', status: 'Still unresolved' },
  concern: { title: 'Concerns to discuss', subtitle: 'Your own words; no diagnosis inferred.', status: 'Patient-reported observation' },
  medication: { title: 'Medications & pharmacy', subtitle: 'Reported medicine and refill details.', status: 'Confirm any dose change with a clinician' },
  decision: { title: 'Decisions & ruled out', subtitle: 'Keep choices and reasons available later.', status: 'Patient-stated choice' },
  goal: { title: 'Care goals', subtitle: 'What you are trying to accomplish.', status: 'Patient-stated goal' },
  next_step: { title: 'Next steps', subtitle: 'Concrete actions to take.', status: 'Patient-stated action' },
  provider: { title: 'Provider requirements', subtitle: 'Your stated criteria and known unknowns.', status: 'Availability and insurance unverified' },
}

const active = (facts: Fact[]) => facts.filter(fact => fact.status !== 'corrected')
const textOf = (fact: Fact) => `${fact.title} ${fact.detail}`
const newest = (facts: Fact[]) => [...facts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
const byWidget = (facts: Fact[], widget: Widget) => newest(facts.filter(fact => fact.widget === widget))
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const receipt = /\b(received|got (?:the|it)|arrived)\b/i
const noReceipt = /\b(not received|never received|never got|hasn't received|haven't received|didn't receive|not arrived|hasn't arrived)\b/i

function weekdayOf(fact: Fact): string | null {
  const match = textOf(fact).match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?\b/i)
  return match ? DAYS.find(day => day.toLowerCase() === match[1].toLowerCase()) || null : null
}

/** The next navigation step, resolved in priority order. */
export function nextStep(facts: Fact[]): { text: string; fact: Fact } | null {
  const care = active(facts)
  const appointment = byWidget(care, 'appointment')[0]
  if (appointment) return { text: 'Prepare for the visit', fact: appointment }

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
  return {
    kind: 'feasibility', title: 'Logistics & feasibility', subtitle: 'A cross-check of your plans.', derived: true,
    status: resolved ? `Transportation resolved for ${day}` : `Attention: no ride reported for ${day}`,
    note: resolved ? `A ride is reported available on ${day}.` : `A ride is only reported for ${days.join(', ')}; the appointment is ${day}.`,
    items: [appointment, ...rides].slice(0, 3),
  }
}

/** Something that cannot move until another thing happens. */
export function blockerSnippet(facts: Fact[]): CareCard | null {
  const blockers = active(facts).filter(fact =>
    (fact.widget === 'open_loop' || fact.widget === 'concern') &&
    /\b(can ?not|can't|cannot|won't) (?:schedule|book|start|proceed|move)|not until|blocked|until (?:the )?\w+ (?:arrives|comes|is received|is sent)|without (?:the|an?) \w+/i.test(textOf(fact)))
  if (!blockers.length) return null
  return {
    kind: 'blockers', title: 'Blocked', subtitle: 'Something has to happen first.', derived: true,
    status: 'Progress is blocked', note: blockers[0].detail, items: newest(blockers).slice(0, 3),
  }
}

/** Stage plan for the active referral/appointment goal. */
export function goalProgress(facts: Fact[]): CareCard | null {
  const care = active(facts)
  const referrals = care.filter(fact => fact.widget === 'referral')
  const appointments = care.filter(fact => fact.widget === 'appointment')
  const providers = care.filter(fact => fact.widget === 'person')
  if (!referrals.length && !appointments.length) return null
  const joined = referrals.map(fact => fact.detail).join(' ')
  const booked = appointments.some(fact => /\b(booked|scheduled)\b/i.test(textOf(fact)))
  const stages: [string, boolean][] = [
    ['Referral ordered', referrals.length > 0],
    ['Referral sent', /\b(sent|submitted|resent|faxed|ordered)\b/i.test(joined)],
    ['Referral received', booked || referrals.some(fact => receipt.test(fact.detail) && !noReceipt.test(fact.detail))],
    ['Provider selected', providers.length > 0],
    ['Appointment booked', booked],
  ]
  return {
    kind: 'progress', title: 'Goal progress', subtitle: 'Where this care goal stands.', derived: true,
    status: 'Patient-reported stages',
    note: stages.map(([label, done]) => `${label} ${done ? '✓' : '—'}`).join(' · '),
    items: newest([...appointments, ...referrals]).slice(0, 3),
  }
}

/** A short confirmation chip for a newly captured detail. */
export function snippetFor(fact: Fact): string {
  if (fact.status === 'completed') return `✓ Resolved: ${fact.detail}`
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
    default: return `Captured: ${fact.detail}`
  }
}

/** Projects the shared fact graph into the live care views. */
export function careCards(facts: Fact[], conversationId: string): CareCard[] {
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

  const progress = goalProgress(care)
  if (progress) cards.push(progress)
  const feas = feasibility(care)
  if (feas) cards.push(feas)
  const block = blockerSnippet(care)
  if (block) cards.push(block)

  for (const widget of widgets) {
    if (widget === 'goal') continue // already surfaced by the goal anchor
    const items = byWidget(care, widget)
    if (items.length) cards.push({ kind: widget, ...cardMeta[widget], items })
  }

  if (current.length) {
    cards.push({
      kind: 'changes', title: 'What changed today', subtitle: 'Newly captured during this conversation.',
      status: 'Review before carrying forward', items: newest(current).slice(0, 6), derived: true,
    })
  }
  return cards
}
