/**
 * Rehearses the flagship Elena/Maria demo end to end against a running server.
 *
 * It replays the exact utterances through the typed-turn endpoint (same persona and
 * same extraction pipeline as voice) and asserts the workspace transitions after
 * every beat, so the demo can be tuned without a microphone.
 *
 *   npm run rehearse                       # against http://localhost:5199
 *   npm run rehearse -- --base=https://... # against a deployment
 */
import type { ConversationDetail, Fact } from '../shared/types.js'
import { accomplishments, agenda, careCards, careGoal, hasConfirmedRide, nextStep, preferenceConflicts, readinessChecklist } from '../shared/cockpit.js'

const base = process.argv.find(arg => arg.startsWith('--base='))?.split('=')[1] || 'http://localhost:5199'
let cookie = ''
let passed = 0
let failed = 0

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = response.headers.getSetCookie?.() || []
  if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ')
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

function check(label: string, condition: boolean, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`) }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

const active = (facts: Fact[]) => facts.filter(fact => !['corrected', 'superseded'].includes(fact.status))
const has = (facts: Fact[], widget: string, pattern?: RegExp) =>
  active(facts).some(fact => fact.widget === widget && (!pattern || pattern.test(fact.detail)))

async function settle(id: string): Promise<ConversationDetail> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 800))
    const detail = await call<ConversationDetail>(`/api/conversations/${id}`)
    if (!detail.widgets.some(widget => widget.status === 'working')) return detail
  }
  return call<ConversationDetail>(`/api/conversations/${id}`)
}

async function say(id: string, text: string): Promise<ConversationDetail> {
  const result = await call<{ reply: string }>(`/api/conversations/${id}/typed`, 'POST', { text })
  const detail = await settle(id)
  console.log(`\n> ${text}`)
  if (result.reply) console.log(`  navigator: ${result.reply.replace(/\s+/g, ' ')}`)
  return detail
}

function show(detail: ConversationDetail) {
  const cards = careCards(detail.facts, detail.conversation.id, detail.memory)
  console.log(`  cards: ${cards.map(card => card.kind).join(', ') || '(none)'}`)
  console.log(`  next:  ${nextStep(detail.facts)?.text || '—'}`)
  return cards
}

async function main() {
  console.log(`Rehearsing against ${base}\n`)
  await call('/api/bootstrap', 'POST', {})
  await call('/api/context', 'PUT', { subject: 'other', patient_name: 'Maria', relationship: 'mother', speaker_name: 'Elena' })

  // A prior session that persisted Maria's earlier preference, for the conflict beat.
  const prior = await call<ConversationDetail>('/api/conversations', 'POST')
  await say(prior.conversation.id, 'Maria prefers afternoon appointments.')
  await call(`/api/conversations/${prior.conversation.id}/end`, 'POST', {})

  const created = await call<ConversationDetail>('/api/conversations', 'POST')
  const id = created.conversation.id

  // ---- Beat 1: chaos becomes structure -------------------------------------
  let detail = await say(id, "Hi, I'm helping my mom Maria and honestly this has become kind of a mess. We're trying to get her into neurology. Her PCP, Dr. Patel, told us he sent the referral Monday, but the neurology office says they never got it. I've already called them twice and they said they'd call me back yesterday, but they haven't. Mom has Medicare, she doesn't drive, we'd prefer a woman doctor and Spanish would be nice if possible.")
  let cards = show(detail)
  console.log('  --- beat 1: chaos becomes structure ---')
  check('goal is understood', Boolean(careGoal(detail.facts)), careGoal(detail.facts) || 'none')
  check('referral status captured', active(detail.facts).filter(fact => fact.widget === 'referral').length >= 2)
  check('open loop captured', has(detail.facts, 'open_loop', /call ?back|call me back|received/i))
  check('attempts captured', has(detail.facts, 'attempt', /called|twice|tried/i))
  check('provider requirements captured', active(detail.facts).filter(fact => fact.widget === 'provider').length >= 2)
  check('transportation constraint captured', has(detail.facts, 'transport', /drive|ride/i))
  check('next step is to confirm the referral', nextStep(detail.facts)?.text === 'Confirm the referral was received', nextStep(detail.facts)?.text)
  check('anchor + progress + referral cards present', ['anchor', 'progress', 'referral'].every(kind => cards.some(card => card.kind === kind)))

  // ---- Beat 2: one update resolves several things ---------------------------
  detail = await say(id, 'Actually, I just remembered - neurology called about ten minutes ago. They said the resent referral finally came through.')
  cards = show(detail)
  console.log('  --- beat 2: one update, several resolutions ---')
  check('referral reads as received', has(detail.facts, 'referral', /received|came through/i))
  check('next step advances to scheduling', nextStep(detail.facts)?.text === 'Schedule the appointment', nextStep(detail.facts)?.text)
  check('blocker cleared', !cards.some(card => card.kind === 'blockers'))
  check('waiting-on loop resolved', !has(detail.facts, 'open_loop', /call ?back|call me back/i) || active(detail.facts).every(fact => fact.widget !== 'open_loop' || fact.status === 'completed'))

  // ---- Beat 3: appointment transforms the workspace -------------------------
  detail = await say(id, 'Yes. They gave Mom next Thursday at 2 PM with Dr. Rivera.')
  cards = show(detail)
  console.log('  --- beat 3: the journey becomes an appointment ---')
  check('appointment captured', has(detail.facts, 'appointment', /thursday|2 ?pm|rivera/i))
  check('clinician captured', has(detail.facts, 'person', /rivera/i))
  check('upcoming care card appears', cards.some(card => card.kind === 'upcoming'))
  check('appointment readiness appears', cards.some(card => card.kind === 'readiness'))
  check('referral card collapses', cards.some(card => card.kind === 'referral' && card.resolved))
  check('next step becomes preparation', (nextStep(detail.facts)?.text || '').match(/Arrange transportation|Add questions|Update the medication list|Gather insurance|Prepare/) !== null, nextStep(detail.facts)?.text)

  // ---- Beat 4: cross-widget transportation reasoning ------------------------
  detail = await say(id, 'Sarah can usually take Mom on Thursdays.')
  console.log('  --- beat 4: cross-widget reasoning ---')
  check('potential ride captured', has(detail.facts, 'transport', /sarah|thursday/i))
  check('ride is not yet confirmed', !hasConfirmedRide(detail.facts))
  detail = await say(id, 'Yeah, she said she can.')
  cards = show(detail)
  check('ride becomes confirmed', hasConfirmedRide(detail.facts))
  check('readiness marks transportation done', readinessChecklist(detail.facts).find(row => row.label === 'Transportation')?.state === 'done')

  // ---- Beat 5: the visit agenda builds itself -------------------------------
  detail = await say(id, "Her memory has gotten worse lately, and she's also been sleeping really badly. The memory stuff is definitely the bigger concern.")
  cards = show(detail)
  console.log('  --- beat 5: the agenda builds and prioritizes ---')
  check('memory concern captured', has(detail.facts, 'concern', /memory/i))
  check('sleep concern captured', has(detail.facts, 'concern', /sleep/i))
  check('agenda card appears', cards.some(card => card.kind === 'agenda'))
  const top = agenda(detail.facts)?.items[0]?.detail || ''
  check('memory is ranked first', /memory/i.test(top), top)
  check('memory is marked high priority', active(detail.facts).some(fact => /memory/i.test(fact.detail) && fact.priority === 'high'))

  // ---- Beat 6: self-correction ----------------------------------------------
  detail = await say(id, "She's been forgetting names for about two months - actually, no, more like three weeks.")
  console.log('  --- beat 6: self-correction settles on the final value ---')
  const durations = active(detail.facts).filter(fact => /two months|three weeks|2 months|3 weeks/i.test(fact.detail))
  check('only the corrected duration remains', durations.length >= 1 && !durations.some(fact => /two months|2 months/i.test(fact.detail)), durations.map(fact => fact.detail).join(' | '))

  // ---- Beat 7: conflict with persistent memory ------------------------------
  detail = await say(id, 'Actually mornings work much better for Mom now.')
  cards = show(detail)
  console.log('  --- beat 7: persistent-memory conflict ---')
  const conflicts = preferenceConflicts([...detail.facts, ...detail.memory])
  check('conflict detected against the earlier preference', conflicts.length > 0, conflicts.map(c => `${c.previous} -> ${c.next}`).join('; '))
  check('possible-update card appears', cards.some(card => card.kind === 'possible_update'))

  // ---- Beat 8: missing information drives the conversation ------------------
  detail = await say(id, "Actually I don't think we have an updated medication list.")
  cards = show(detail)
  console.log('  --- beat 8: the UI surfaces the gap ---')
  check('prep item captured', has(detail.facts, 'readiness', /medication|med list/i))
  check('readiness marks the medication list as needed', readinessChecklist(detail.facts).find(row => row.label === 'Medication list')?.state === 'needed')

  // ---- Beat 9: end of call --------------------------------------------------
  const ended = await call<ConversationDetail>(`/api/conversations/${id}/end`, 'POST', {})
  const done = accomplishments(ended.facts)
  console.log('\n  --- beat 9: end of call ---')
  console.log(`  resolved: ${done.resolved.join(' | ') || '—'}`)
  console.log(`  scheduled: ${done.scheduled.join(' | ') || '—'}`)
  console.log(`  prepared: ${done.prepared.join(' | ') || '—'}`)
  console.log(`  still to do: ${done.stillToDo.join(' | ') || '—'}`)
  check('something was resolved', done.resolved.length > 0)
  check('an appointment was scheduled', done.scheduled.length > 0)
  check('concerns were prepared', done.prepared.length > 0)
  check('a remaining prep item exists', done.stillToDo.length > 0)
  check('objective is set', Boolean(done.objective))

  // ---- Beat 10: come back tomorrow ------------------------------------------
  const profile = await call<{ facts: Fact[] }>('/api/profile')
  const profileCards = careCards(profile.facts, id)
  console.log('\n  --- beat 10: next day ---')
  check('memory persists across the session', profile.facts.length >= 8, `${profile.facts.length} facts`)
  check('the appointment persists', profile.facts.some(fact => fact.widget === 'appointment'))
  check('the prep gap persists', readinessChecklist(profile.facts).some(row => row.state === 'needed'))

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch(error => { console.error(error); process.exit(1) })
