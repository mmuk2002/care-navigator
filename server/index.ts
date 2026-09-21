import { createServer as createViteServer } from 'vite'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import middie from '@fastify/middie'
import { WebSocketServer, type WebSocket } from 'ws'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AppEvent, CareContext, Settings } from '../shared/types.js'
import { normalizeSettings } from '../shared/settings.js'
import { memoryBlock } from './persona.js'
import { openDatabase } from './db.js'
import { Store } from './store.js'
import { VoiceSession } from './gemini.js'
import { AnalysisWorker } from './analysis.js'

try { process.loadEnvFile() } catch { /* no .env file; rely on the environment */ }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 5173)
const production = process.env.NODE_ENV === 'production'

const listeners = new Map<string, Set<(event: AppEvent) => void>>()
const publish = (event: AppEvent) => {
  for (const listener of listeners.get(event.conversation_id) || []) listener(event)
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

const database = await openDatabase()
const store = new Store(database, publish)
await store.recoverJobs()
const worker = new AnalysisWorker(store)
worker.start()

const app = Fastify({ logger: false, bodyLimit: 1_000_000 })
await app.register(middie)

// Accept bodyless or loosely-typed POSTs (for example bootstrap) instead of rejecting them.
const lenientParser = (_request: unknown, body: string, done: (error: Error | null, value?: unknown) => void) => {
  const text = String(body).trim()
  if (!text) return done(null, {})
  try { done(null, JSON.parse(text)) } catch { done(null, {}) }
}
app.addContentTypeParser('application/json', { parseAs: 'string' }, lenientParser)
app.addContentTypeParser('*', { parseAs: 'string' }, lenientParser)

app.get('/api/health', async () => ({ ok: true, database: process.env.DATABASE_URL ? 'postgres' : 'pglite' }))

app.post('/api/bootstrap', async (request, reply) => {
  const token = readCookie(request.headers.cookie, 'visitor')
  const visitor = await store.visitor(token)
  if (!token) reply.header('set-cookie', `visitor=${encodeURIComponent(visitor.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`)
  const settings = normalizeSettings(await store.settings(visitor.id))
  const [profile, conversations] = await Promise.all([store.profile(visitor.id), store.list(visitor.id)])
  return { visitor: visitor.id, settings, profile, conversations }
})

app.get('/api/conversations', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const query = (request.query as { q?: string }).q || ''
  return store.search(visitor, query)
})

app.post('/api/conversations', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const settings = normalizeSettings(await store.settings(visitor))
  const conversation = await store.createConversation(visitor, settings)
  return store.detail(conversation.id, visitor)
})

app.get('/api/conversations/:id', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const detail = await store.detail((request.params as { id: string }).id, visitor)
  if (!detail) return reply.code(404).send({ error: 'not_found' })
  return detail
})

app.delete('/api/conversations/:id', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const removed = await store.deleteConversation((request.params as { id: string }).id, visitor)
  return { removed }
})

app.post('/api/conversations/:id/end', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const id = (request.params as { id: string }).id
  if (!(await store.conversation(id, visitor))) return reply.code(404).send({ error: 'not_found' })
  await store.setStatus(id, 'ended')
  return store.detail(id, visitor)
})

app.post('/api/conversations/:id/turns', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const id = (request.params as { id: string }).id
  if (!(await store.conversation(id, visitor))) return reply.code(404).send({ error: 'not_found' })
  const text = String((request.body as { text?: string })?.text || '').trim().slice(0, 4000)
  if (!text) return reply.code(400).send({ error: 'empty' })
  const turn = await store.addUserTurn(id, text)
  return { turn }
})

app.patch('/api/facts/:id', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const body = (request.body || {}) as { detail?: string; status?: string }
  const fact = await store.updateFact((request.params as { id: string }).id, visitor, {
    detail: body.detail, status: body.status as never,
  })
  if (!fact) return reply.code(404).send({ error: 'not_found' })
  return fact
})

app.get('/api/profile', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  return store.profile(visitor)
})

app.put('/api/context', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const context = (request.body || {}) as CareContext
  await store.setContext(visitor, { subject: context.subject === 'other' ? 'other' : 'self', patient_name: String(context.patient_name || '').slice(0, 120), relationship: String(context.relationship || '').slice(0, 80), speaker_name: String(context.speaker_name || '').slice(0, 120) })
  return store.profile(visitor)
})

app.put('/api/settings', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const settings = normalizeSettings(request.body as Settings)
  await store.saveSettings(visitor, settings)
  return settings
})

app.get('/api/conversations/:id/events', async (request, reply) => {
  const visitor = await requireVisitor(request.headers.cookie, reply)
  if (!visitor) return
  const id = (request.params as { id: string }).id
  if (!(await store.conversation(id, visitor))) return reply.code(404).send({ error: 'not_found' })
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
  reply.raw.write('retry: 2000\n\n')
  const listener = (event: AppEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  const set = listeners.get(id) || new Set()
  set.add(listener)
  listeners.set(id, set)
  const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 20_000)
  request.raw.on('close', () => { clearInterval(keepAlive); set.delete(listener); if (!set.size) listeners.delete(id) })
})

const voiceWss = new WebSocketServer({ noServer: true })
const sessions = new Map<WebSocket, VoiceSession>()

app.server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (url.pathname !== '/voice') return
  voiceWss.handleUpgrade(request, socket, head, client => voiceWss.emit('connection', client, request))
})

voiceWss.on('connection', async (client, request) => {
  const url = new URL(request.url || '/', 'http://localhost')
  const conversationId = url.searchParams.get('conversation') || ''
  const visitor = readCookie(request.headers.cookie, 'visitor')
  if (!visitor || !(await store.conversation(conversationId, visitor))) { client.close(4404, 'not found'); return }
  const detail = await store.detail(conversationId, visitor)
  if (!detail) { client.close(4404, 'not found'); return }
  const profile = await store.profile(visitor)
  const session = new VoiceSession(store, () => worker.start())
  sessions.set(client, session)
  client.on('close', () => { sessions.delete(client); void session.shutdown('client') })
  try {
    await session.connect(client, conversationId, detail.conversation.settings, memoryBlock(profile.facts))
  } catch (error) {
    console.error('voice connect failed', error)
    client.send(JSON.stringify({ type: 'error', message: (error as Error).message }))
    client.close(1011, 'voice failed')
  }
})

if (production) {
  await app.register(fastifyStatic, { root: join(root, 'dist') })
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'not_found' })
    return reply.sendFile('index.html')
  })
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

async function requireVisitor(cookie: string | undefined, reply: { code: (status: number) => { send: (body: unknown) => void } }): Promise<string | null> {
  const token = readCookie(cookie, 'visitor')
  if (token) {
    const found = await store.visitor(token)
    if (!found.created) return found.id
  }
  reply.code(401).send({ error: 'no_visitor' })
  return null
}

await app.listen({ port, host: '0.0.0.0' })
console.log(`Harbor listening on http://localhost:${port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    worker.stop()
    for (const session of sessions.values()) await session.shutdown('signal').catch(() => {})
    await app.close()
    await database.close()
    process.exit(0)
  })
}
