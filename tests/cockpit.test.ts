import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Fact, Widget } from '../shared/types.js'
import { blockerSnippet, careCards, careGoal, feasibility, goalProgress, nextStep, snippetFor } from '../shared/cockpit.js'

let counter = 0
function fact(widget: Widget, detail: string, extra: Partial<Fact> = {}): Fact {
  counter += 1
  return {
    id: `f${counter}`, conversation_id: 'c1', widget, title: widget, detail,
    status: 'reported', source_turn_id: 't1', source_quote: detail, event_date: null,
    created_at: new Date(2026, 0, counter).toISOString(), ...extra,
  }
}

test('next step asks to confirm a sent referral before booking', () => {
  const facts = [fact('referral', 'The clinic faxed a referral to a cardiologist last Tuesday')]
  assert.equal(nextStep(facts)?.text, 'Confirm the referral was received')
})

test('next step moves to scheduling once a referral was received', () => {
  const facts = [
    fact('referral', 'The clinic sent a referral to a cardiologist'),
    fact('referral', 'The office said the referral was received'),
  ]
  assert.equal(nextStep(facts)?.text, 'Schedule the appointment')
})

test('an explicit next step is used when nothing else is pending', () => {
  const facts = [fact('next_step', "I'll call the pharmacy tomorrow about a refill")]
  assert.equal(nextStep(facts)?.text, "I'll call the pharmacy tomorrow about a refill")
})

test('an upcoming appointment takes priority for the next step', () => {
  const facts = [
    fact('referral', 'The referral was sent last week'),
    fact('appointment', 'The cardiology visit is booked for Thursday'),
  ]
  assert.equal(nextStep(facts)?.text, 'Prepare for the visit')
})

test('a stated goal wins over an inferred one', () => {
  const facts = [fact('goal', 'Get Ruth established with a neurologist')]
  assert.equal(careGoal(facts), 'Get Ruth established with a neurologist')
})

test('a goal is inferred from a mentioned specialty', () => {
  const facts = [fact('person', 'The cardiologist office is far away')]
  assert.equal(careGoal(facts), 'Get established with cardiologist')
})

test('feasibility flags a ride that does not cover the appointment day', () => {
  const facts = [
    fact('appointment', 'The appointment is booked for Tuesday'),
    fact('transport', 'Sarah can take her on Thursday'),
  ]
  assert.match(feasibility(facts)!.status, /no ride reported for Tuesday/)
})

test('feasibility clears when the ride matches the appointment day', () => {
  const facts = [
    fact('appointment', 'The appointment is booked for Tuesday'),
    fact('transport', 'Sarah can take her on Tuesday'),
  ]
  assert.match(feasibility(facts)!.status, /resolved for Tuesday/)
})

test('a blocker is surfaced when progress depends on something else', () => {
  const facts = [fact('open_loop', "We can't schedule the MRI until the insurance approval arrives")]
  assert.equal(blockerSnippet(facts)?.kind, 'blockers')
})

test('goal progress reports the reported stages in order', () => {
  const facts = [
    fact('referral', 'The referral was sent last week'),
    fact('appointment', 'The appointment is booked for Thursday'),
    fact('person', 'Dr. Rivera is the cardiologist'),
  ]
  const progress = goalProgress(facts)
  assert.ok(progress)
  assert.match(progress.note!, /Referral ordered ✓/)
  assert.match(progress.note!, /Appointment booked ✓/)
})

test('a corrected fact is excluded from every view', () => {
  const facts = [fact('appointment', 'The appointment is booked for Tuesday', { status: 'corrected' })]
  assert.equal(nextStep(facts), null)
  assert.equal(feasibility(facts), null)
})

test('the goal anchor is always the first card', () => {
  const facts = [
    fact('person', 'Dr. Rivera is the cardiologist'),
    fact('next_step', "I'll call the office on Friday"),
  ]
  assert.equal(careCards(facts, 'c1')[0].kind, 'anchor')
})

test('a snippet marks a resolved detail as done', () => {
  assert.match(snippetFor(fact('referral', 'The referral was received', { status: 'completed' })), /^✓ Resolved/)
})

test('a snippet labels a captured question', () => {
  assert.match(snippetFor(fact('question', 'Ask about the memory changes')), /^Question saved/)
})
