import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lastTurnText, pendingLive } from '../shared/transcript.js'

test('a live line with nothing saved yet is shown in full', () => {
  assert.equal(pendingLive('Hello there', ''), 'Hello there')
})

test('an empty live line shows nothing', () => {
  assert.equal(pendingLive('', 'Hello there'), '')
})

test('a live line equal to the saved turn is not repeated', () => {
  assert.equal(pendingLive('Hello there', 'Hello there'), '')
})

test('whitespace and case differences do not duplicate the line', () => {
  assert.equal(pendingLive('Hello   there', 'Hello there'), '')
})

test('a live line shorter than the saved turn is not repeated', () => {
  assert.equal(pendingLive('Hello', 'Hello there'), '')
})

test('only the words not yet saved are shown', () => {
  assert.equal(pendingLive('Hello there friend', 'Hello there'), 'friend')
})

test('a live line that diverges from the saved turn is shown in full', () => {
  assert.equal(pendingLive('Completely different', 'Hello there'), 'Completely different')
})

test('the last saved turn for a speaker is found', () => {
  const turns = [
    { speaker: 'user', text: 'one' },
    { speaker: 'assistant', text: 'two' },
    { speaker: 'user', text: 'three' },
  ]
  assert.equal(lastTurnText(turns, 'user'), 'three')
  assert.equal(lastTurnText(turns, 'assistant'), 'two')
  assert.equal(lastTurnText([], 'user'), '')
})
