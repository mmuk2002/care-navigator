/**
 * End-to-end check of the voice pipeline without a microphone.
 *
 * Synthesizes speech, sends it to Harbor's /voice socket exactly as the browser
 * does, and reports whether partial transcripts arrive while the audio is still
 * streaming (real-time) or only once it ends.
 *
 *   node --import tsx scripts/voice-pipeline-probe.ts
 */
import WebSocket from 'ws'
import { GoogleGenAI } from '@google/genai'

try { process.loadEnvFile() } catch { /* ignore */ }

const base = process.env.PROBE_BASE || 'http://localhost:5199'
const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('GEMINI_API_KEY is not set')

const sentence = "Hi, I'm helping my mom Maria and we're trying to get her into neurology."

const ai = new GoogleGenAI({ apiKey: key })
const tts = await ai.models.generateContent({
  model: process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  contents: sentence,
  config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
})
const parts = (tts.candidates?.[0]?.content?.parts || []) as { inlineData?: { data?: string } }[]
const pcm24 = Buffer.from(parts.find(part => part.inlineData?.data)!.inlineData!.data!, 'base64')
const samples24 = new Int16Array(pcm24.buffer, pcm24.byteOffset, pcm24.length / 2)
const samples16 = new Int16Array(Math.floor(samples24.length * 16000 / 24000))
for (let index = 0; index < samples16.length; index += 1) samples16[index] = samples24[Math.floor(index * 24000 / 16000)] || 0
console.log(`synthesized ${(samples16.length / 16000).toFixed(1)}s of speech`)

// Bootstrap a visitor and a conversation, keeping the session cookie.
let cookie = ''
const call = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = response.headers.getSetCookie?.() || []
  if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ')
  return response.json() as Promise<Record<string, unknown>>
}
await call('/api/bootstrap', 'POST', {})
const created = await call('/api/conversations', 'POST') as { conversation: { id: string } }
const conversationId = created.conversation.id
console.log(`conversation ${conversationId}`)

const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/voice?conversation=${encodeURIComponent(conversationId)}`, { headers: { cookie } })
const started = Date.now()
const at = () => `${String(Date.now() - started).padStart(5)}ms`
let lastPartialAt = 0
let partials = 0
let finalAt = 0
let audioEndedAt = 0

socket.on('open', () => console.log(`${at()}  socket open`))
socket.on('message', (raw, binary) => {
  if (binary) return
  const message = JSON.parse(raw.toString()) as { type: string; speaker?: string; text?: string; final?: boolean; message?: string }
  if (message.type === 'transcript' && message.speaker === 'user') {
    if (message.final) { finalAt = Date.now() - started; console.log(`${at()}  FINAL user: ${JSON.stringify(message.text)}`) }
    else { partials += 1; lastPartialAt = Date.now() - started; console.log(`${at()}  partial(${partials}): ${JSON.stringify(message.text)}`) }
  } else if (message.type === 'ready') console.log(`${at()}  ready -> streaming audio`)
  else if (message.type === 'error') console.log(`${at()}  ERROR: ${message.message}`)
})

await new Promise<void>(resolve => socket.once('open', () => resolve()))

// Stream audio in 100 ms chunks once the server is ready.
const CHUNK = 1600
let offset = 0
const interval = setInterval(() => {
  if (socket.readyState !== WebSocket.OPEN) return
  const slice = samples16.subarray(offset, offset + CHUNK)
  if (!slice.length) {
    clearInterval(interval)
    audioEndedAt = Date.now() - started
    console.log(`${at()}  audio finished sending`)
    return
  }
  offset += slice.length
  socket.send(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength))
}, 100)

setTimeout(() => {
  console.log(`\npartials=${partials} lastPartialAt=${lastPartialAt}ms audioEndedAt=${audioEndedAt}ms finalAt=${finalAt}ms`)
  const realtime = partials > 0 && lastPartialAt > 0 && audioEndedAt > 0 && lastPartialAt < audioEndedAt
  console.log(realtime
    ? 'RESULT: partials arrive DURING speech (real-time)'
    : partials > 0
      ? 'RESULT: partials arrived but only at/after the end'
      : 'RESULT: no partial transcripts at all')
  socket.close()
  process.exit(0)
}, 20_000)
