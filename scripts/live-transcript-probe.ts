/**
 * Headless check of live input transcription.
 *
 * Synthesizes a sentence with the TTS model, streams it into a real Gemini Live
 * session exactly as the browser would, and reports which transcription fields
 * arrive and when. Proves whether interim transcription streams during speech.
 *
 *   node --import tsx scripts/live-transcript-probe.ts
 */
import WebSocket from 'ws'
import { GoogleGenAI } from '@google/genai'

try { process.loadEnvFile() } catch { /* ignore */ }

const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('GEMINI_API_KEY is not set')
const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live'
const ai = new GoogleGenAI({ apiKey: key })

const sentence = "Hi, I'm helping my mom Maria and we're trying to get her into neurology."

// 1. Synthesize speech so the probe needs no microphone.
const tts = await ai.models.generateContent({
  model: process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  contents: sentence,
  config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
})
const parts = (tts.candidates?.[0]?.content?.parts || []) as { inlineData?: { data?: string; mimeType?: string } }[]
const audioPart = parts.find(part => part.inlineData?.data)
if (!audioPart?.inlineData?.data) throw new Error('TTS returned no audio')
const pcm24 = Buffer.from(audioPart.inlineData.data, 'base64')
console.log(`synthesized ${pcm24.length} bytes, mimeType=${audioPart.inlineData.mimeType}`)

// 2. Downsample 24 kHz -> 16 kHz mono PCM16 for Live input.
const samples24 = new Int16Array(pcm24.buffer, pcm24.byteOffset, pcm24.length / 2)
const samples16 = new Int16Array(Math.floor(samples24.length * 16000 / 24000))
for (let index = 0; index < samples16.length; index += 1) samples16[index] = samples24[Math.floor(index * 24000 / 16000)] || 0
let peak = 0
let energy = 0
for (const sample of samples16) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample }
console.log(`16 kHz samples=${samples16.length} peak=${peak} rms=${Math.round(Math.sqrt(energy / samples16.length))}`)

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`
const socket = new WebSocket(url, { maxPayload: 4_000_000 })
const started = Date.now()
const at = () => `${String(Date.now() - started).padStart(5)}ms`

const observed: string[] = []
socket.on('open', () => {
  socket.send(JSON.stringify({ setup: {
    model: `models/${liveModel}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } } },
    systemInstruction: { parts: [{ text: 'You are a test navigator. Reply with one short sentence.' }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { activityHandling: 'START_OF_ACTIVITY_INTERRUPTS', automaticActivityDetection: { disabled: false } },
    sessionResumption: {},
  } }))
})

let streaming: ReturnType<typeof setInterval> | null = null
let offset = 0
const CHUNK = 1600 // 100 ms at 16 kHz

function startStreaming() {
  streaming = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) return
    const slice = samples16.subarray(offset, offset + CHUNK)
    if (!slice.length) {
      if (streaming) clearInterval(streaming)
      streaming = null
      socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
      console.log(`${at()}  audio stream ended (${samples16.length} samples sent)`)
      // Also check the session responds to text at all.
      socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Say the single word hello.' }] }], turnComplete: true } }))
      console.log(`${at()}  sent a text turn to test the session`)
      return
    }
    offset += slice.length
    const data = Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('base64')
    const mimeType = 'audio/pcm;rate=16000'
    socket.send(JSON.stringify(process.env.PROBE_MEDIA_CHUNKS === '1'
      ? { realtimeInput: { mediaChunks: [{ data, mimeType }] } }
      : { realtimeInput: { audio: { data, mimeType } } }))
  }, 100)
}

socket.on('message', raw => {
  const text = raw.toString()
  let event: {
    setupComplete?: unknown
    error?: unknown
    serverContent?: { interimInputTranscription?: { text?: string }; inputTranscription?: { text?: string; finished?: boolean }; outputTranscription?: { text?: string }; turnComplete?: boolean; modelTurn?: unknown }
    goAway?: unknown
  }
  try { event = JSON.parse(text) } catch { console.log(`${at()}  <-- non-JSON ${text.slice(0, 120)}`); return }
  console.log(`${at()}  <-- keys: ${Object.keys(event).join(',')}${text.length > 400 ? ` (${text.length} bytes)` : ''}`)
  if (event.error) { console.log('   ERROR:', JSON.stringify(event.error)); return }
  if (event.setupComplete) {
    console.log(`${at()}  setupComplete -> streaming audio`)
    startStreaming()
    return
  }
  const content = event.serverContent
  if (!content) return
  if (content.modelTurn) console.log(`${at()}  modelTurn (audio response)`)
  if (content.interimInputTranscription?.text) { observed.push('interimInputTranscription'); console.log(`${at()}  INTERIM input: ${JSON.stringify(content.interimInputTranscription.text)}`) }
  if (content.inputTranscription?.text) { observed.push('inputTranscription'); console.log(`${at()}  input (finished=${Boolean(content.inputTranscription.finished)}): ${JSON.stringify(content.inputTranscription.text)}`) }
  if (content.outputTranscription?.text) { observed.push('outputTranscription'); console.log(`${at()}  output: ${JSON.stringify(content.outputTranscription.text)}`) }
  if (content.turnComplete) console.log(`${at()}  turnComplete`)
})

socket.on('error', error => { console.error('socket error', error); process.exit(1) })

setTimeout(() => {
  console.log(`\nfields seen: ${[...new Set(observed)].join(', ') || 'none'}`)
  console.log(observed.includes('interimInputTranscription')
    ? 'RESULT: interim transcription streams during speech'
    : observed.includes('inputTranscription')
      ? 'RESULT: only final inputTranscription arrived (no interim stream)'
      : 'RESULT: no input transcription at all')
  process.exit(0)
}, 25_000)
