import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeSettings } from '../shared/settings.js'
import { openDatabase } from '../server/db.js'
import { Store } from '../server/store.js'

test('streaming partials update one turn in place and emit live events', async () => {
  process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'harbor-store-'))
  delete process.env.DATABASE_URL

  const events: { type: string }[] = []
  const db = await openDatabase()
  const store = new Store(db, event => events.push(event))
  const visitor = await store.visitor(undefined)
  const conversation = await store.createConversation(visitor.id, normalizeSettings(null))

  await store.upsertTurn(conversation.id, 'gemini:user:0', 'user', 'Hi')
  await store.upsertTurn(conversation.id, 'gemini:user:0', 'user', "Hi, I'm helping")
  await store.upsertTurn(conversation.id, 'gemini:user:0', 'user', "Hi, I'm helping my mom Maria")
  await store.finalizeUserTurn(conversation.id, 'gemini:user:0', "Hi, I'm helping my mom Maria")

  const turns = await store.turns(conversation.id)
  assert.equal(turns.length, 1, 'partials must not append new rows')
  assert.equal(turns[0].text, "Hi, I'm helping my mom Maria")
  assert.ok(events.filter(event => event.type === 'turn').length >= 3, 'each partial should emit a turn event')

  await store.upsertTurn(conversation.id, 'gemini:user:1', 'user', 'A second utterance')
  assert.equal((await store.turns(conversation.id)).length, 2)

  await db.close()
})

test('finalizing a user turn enqueues exactly one extraction job', async () => {
  process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'harbor-store-'))
  delete process.env.DATABASE_URL

  const db = await openDatabase()
  const store = new Store(db, () => undefined)
  const visitor = await store.visitor(undefined)
  const conversation = await store.createConversation(visitor.id, normalizeSettings(null))

  await store.upsertTurn(conversation.id, 'gemini:user:0', 'user', 'partial')
  await store.finalizeUserTurn(conversation.id, 'gemini:user:0', 'partial then complete')
  assert.equal((await store.pendingJobs()).length, 1)

  await db.close()
})
