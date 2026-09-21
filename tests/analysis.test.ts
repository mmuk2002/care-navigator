import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Turn } from '../shared/types.js'
import { hasEvidence, ruleFacts } from '../server/analysis.js'
import { joinTranscript } from '../server/gemini.js'

function turn(text: string): Turn {
  return { id: 't1', conversation_id: 'c1', speaker: 'user', text, seq: 1, interrupted: false, created_at: '' }
}

test('rule fallback tags a detail-rich sentence with several widgets', () => {
  const facts = ruleFacts(turn('The clinic faxed a referral to a cardiologist last Tuesday but we have not received a call back'))
  const kinds = new Set(facts.map(item => item.widget))
  assert.ok(kinds.has('person'), 'expected a care-circle fact')
  assert.ok(kinds.has('referral'), 'expected a referral fact')
  assert.ok(kinds.has('timeline'), 'expected a timeline fact')
  assert.ok(kinds.has('open_loop'), 'expected an open-loop fact')
})

test('rule fallback separates conjunctions into distinct clauses', () => {
  const facts = ruleFacts(turn('She needs a ride and she needs a refill'))
  assert.equal(facts.length, 2)
  assert.ok(facts.every(item => !item.detail.startsWith('and ')))
})

test('rule fallback labels a next step even when other widgets match', () => {
  const facts = ruleFacts(turn('I will call the office on Friday to confirm the referral'))
  assert.ok(facts.some(item => item.widget === 'next_step'), 'expected a next-step fact')
})

test('evidence check accepts an exact quote', () => {
  const haystack = 'the clinic faxed a referral to a cardiologist last tuesday'
  assert.equal(hasEvidence({ widget: 'timeline', title: 'x', detail: 'a referral to a cardiologist', quote: 'faxed a referral to a cardiologist', event_date: null }, haystack), true)
})

test('evidence check rejects a fabricated quote', () => {
  const haystack = 'the clinic faxed a referral to a cardiologist last tuesday'
  assert.equal(hasEvidence({ widget: 'timeline', title: 'x', detail: 'insurance approved the MRI', quote: 'the insurance approved the MRI', event_date: null }, haystack), false)
})

test('evidence check accepts a verbatim detail when the quote is missing', () => {
  const haystack = 'she can only do mornings'
  assert.equal(hasEvidence({ widget: 'transport', title: 'x', detail: 'only do mornings', quote: '', event_date: null }, haystack), true)
})

test('transcript pieces keep provider spacing at word boundaries', () => {
  assert.equal(joinTranscript('Hello', ' there'), 'Hello there')
  assert.equal(joinTranscript('Hel', 'lo'), 'Hello')
})

test('transcript pieces get a space after sentence punctuation', () => {
  assert.equal(joinTranscript('I see.', 'What happened'), 'I see. What happened')
})

test('a fuller transcript piece replaces a partial one', () => {
  assert.equal(joinTranscript('The clinic faxed', 'The clinic faxed a referral'), 'The clinic faxed a referral')
})
