import WebSocket from 'ws'
import { ActivityHandling, EndSensitivity, type RealtimeInputConfig } from '@google/genai'
import type { Settings } from '../shared/types.js'
import { navigatorInstructions } from './persona.js'
import type { Store } from './store.js'

interface ServerContent {
  interimInputTranscription?: { text?: string }
  inputTranscription?: { text?: string; finished?: boolean }
  outputTranscription?: { text?: string }
  modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] }
  interrupted?: boolean
  turnComplete?: boolean
}

interface UpstreamEvent {
  setupComplete?: unknown
  serverContent?: ServerContent
  goAway?: { timeLeft?: string }
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
}

/**
 * Gemini streams transcripts as small pieces and includes its own spacing at
 * word boundaries, so we trust it rather than inserting spaces ourselves.
 * We only add a space when a finished sentence meets a new word.
 */
export function joinTranscript(current: string, piece: string): string {
  if (!piece) return current
  if (!current) return piece
  if (piece.startsWith(current)) return piece
  if (current.endsWith(piece)) return current
  return /[.!?]$/.test(current) && !/^[\s.,!?;:]/.test(piece) ? `${current} ${piece}` : current + piece
}

export function realtimeConfig(settings: Settings): RealtimeInputConfig {
  return {
    activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    automaticActivityDetection: {
      disabled: false,
      endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
      silenceDurationMs: settings.preferences.pace === 'unhurried' ? 900 : 700,
    },
  }
}

export class VoiceSession {
  private upstream: WebSocket | null = null
  private client: WebSocket | null = null
  private lifetime: ReturnType<typeof setTimeout> | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null
  private stopRequested = false
  private queue: Promise<void> = Promise.resolve()
  private closing = false
  private userText = ''
  private interimUserText = ''
  private assistantText = ''
  private userIndex = 0
  private assistantIndex = 0
  private assistantInterrupted = false
  private resumeHandle: string | null = null
  private resumeAttempts = 0
  private conversationId = ''
  private settings: Settings | null = null
  private memory = ''
  private url = ''

  constructor(private store: Store, private onUserTurn: () => void) {}

  async connect(client: WebSocket, conversationId: string, settings: Settings, memory: string): Promise<void> {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    this.client = client
    this.conversationId = conversationId
    this.settings = settings
    this.memory = memory
    this.url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`
    await this.openUpstream()
    await this.store.setStatus(conversationId, 'live')
    this.send({ type: 'ready' })

    client.on('message', (raw, binary) => {
      const upstream = this.upstream
      if (upstream?.readyState !== WebSocket.OPEN) return
      if (binary) {
        const audio = Buffer.from(raw as Buffer)
        if (audio.length > 64_000) return
        upstream.send(JSON.stringify({ realtimeInput: { audio: { data: audio.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }))
        return
      }
      try {
        const control = JSON.parse(raw.toString()) as { type?: string; directive?: string }
        if (control.type === 'audioStreamEnd') upstream.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
        if (control.type === 'steer' && typeof control.directive === 'string') this.steer(control.directive.slice(0, 600))
        if (control.type === 'stop') this.requestStop()
      } catch { /* ignore unknown control frames */ }
    })
    client.on('close', () => { if (!this.closing) void this.shutdown('client') })
    this.lifetime = setTimeout(() => void this.shutdown('expired'), 10 * 60 * 1000)
  }

  /** Open or resume the upstream socket. `sessionResumption` must be an empty object on first connect. */
  private async openUpstream(): Promise<void> {
    const settings = this.settings
    if (!settings) throw new Error('Voice session is not configured')
    const upstream = new WebSocket(this.url, { maxPayload: 2_000_000 })
    this.upstream = upstream
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gemini Live setup timed out')), 12_000)
      upstream.once('open', () => upstream.send(JSON.stringify({ setup: {
        model: `models/${process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest'}`,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } } } },
        systemInstruction: { parts: [{ text: navigatorInstructions(settings, this.memory) }] },
        inputAudioTranscription: {}, outputAudioTranscription: {},
        realtimeInputConfig: realtimeConfig(settings),
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
      } })))
      upstream.on('message', data => {
        let event: UpstreamEvent
        try { event = JSON.parse(data.toString()) } catch { return }
        if (event.setupComplete) { clearTimeout(timer); resolve(); return }
        if (event.sessionResumptionUpdate?.resumable && event.sessionResumptionUpdate.newHandle) this.resumeHandle = event.sessionResumptionUpdate.newHandle
        if (event.serverContent) this.queue = this.queue.then(() => this.handleContent(event.serverContent!)).catch(error => console.error('voice event failed', error))
        if (event.goAway) this.send({ type: 'notice', message: 'Holding the line…' })
      })
      upstream.once('error', error => { clearTimeout(timer); reject(error) })
      upstream.once('close', (code, reason) => { clearTimeout(timer); reject(new Error(`Gemini Live closed during setup (${code}) ${reason.toString().slice(0, 120)}`)) })
    })
    upstream.on('close', () => void this.handleUpstreamClose().catch(error => console.error('resume failed', error)))
  }

  private async handleUpstreamClose(): Promise<void> {
    if (this.closing) return
    if (this.client?.readyState !== WebSocket.OPEN) return void this.shutdown('client')
    if (this.resumeHandle && this.resumeAttempts < 5) {
      this.resumeAttempts += 1
      await new Promise(resolve => setTimeout(resolve, 500))
      try { await this.openUpstream(); this.resumeAttempts = 0; this.send({ type: 'listening' }); return }
      catch (error) { console.error('resume attempt failed', error) }
    }
    await this.shutdown('upstream')
  }

  private async handleContent(content: ServerContent): Promise<void> {
    // Gemini 3.8 sends fast, replaceable hypotheses while the person is still
    // speaking. Stream these straight to the browser, but never persist or
    // analyze speculative words.
    if (content.interimInputTranscription?.text) {
      this.interimUserText = content.interimInputTranscription.text
      this.send({ type: 'transcript', speaker: 'user', text: this.interimUserText, final: false })
      this.send({ type: 'listening' })
    }
    // Keep the authoritative text buffered until the speech turn closes. Database
    // writes and extraction must never delay the model's first response audio.
    if (content.inputTranscription?.text) {
      this.userText = joinTranscript(this.userText, content.inputTranscription.text)
      this.interimUserText = ''
      const final = Boolean(content.inputTranscription.finished)
      this.send({ type: 'transcript', speaker: 'user', text: this.userText, final })
      this.send({ type: 'listening' })
    }
    if (content.outputTranscription?.text) {
      this.assistantText = joinTranscript(this.assistantText, content.outputTranscription.text)
      this.send({ type: 'transcript', speaker: 'assistant', text: this.assistantText, final: false })
      this.send({ type: 'speaking' })
    }
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data) this.send({ type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000' })
    }
    if (content.interrupted) {
      this.assistantInterrupted = true
      this.send({ type: 'interrupted' })
      await this.commitAssistant()
    }
    if (content.turnComplete) {
      if (this.userText.trim()) this.send({ type: 'transcript', speaker: 'user', text: this.userText, final: true })
      await this.commitUser()
      await this.commitAssistant()
      if (this.stopRequested) setTimeout(() => void this.shutdown('client'), 0)
      else this.send({ type: 'listening' })
    }
  }

  /** End input first, allowing Gemini to deliver final transcripts before closing sockets. */
  private requestStop(): void {
    if (this.stopRequested) return
    this.stopRequested = true
    if (this.upstream?.readyState === WebSocket.OPEN) {
      this.upstream.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
    }
    this.stopTimer = setTimeout(() => void this.shutdown('client'), 1800)
  }

  private async commitUser(): Promise<void> {
    const text = this.userText.trim()
    this.userText = ''
    this.interimUserText = ''
    if (!text) return
    await this.store.finalizeUserTurn(this.conversationId, `gemini:user:${this.userIndex}`, text)
    this.userIndex += 1
    this.onUserTurn()
  }

  private async commitAssistant(): Promise<void> {
    const text = this.assistantText.trim()
    const interrupted = this.assistantInterrupted
    this.assistantText = ''
    this.assistantInterrupted = false
    if (!text) return
    this.send({ type: 'transcript', speaker: 'assistant', text, final: true })
    await this.store.upsertTurn(this.conversationId, `gemini:assistant:${this.assistantIndex}`, 'assistant', text, interrupted)
    this.assistantIndex += 1
  }

  /** Apply a behavior change mid-session; Gemini Live accepts this as a non-turning user note. */
  steer(directive: string): void {
    if (!directive || this.upstream?.readyState !== WebSocket.OPEN) return
    this.upstream.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: directive }] }], turnComplete: false } }))
  }

  private send(message: unknown): void {
    if (this.client?.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(message))
  }

  async shutdown(reason: string): Promise<void> {
    if (this.closing) return
    this.closing = true
    if (this.lifetime) clearTimeout(this.lifetime)
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.lifetime = null
    this.stopTimer = null
    await this.queue.catch(() => {})
    if (this.conversationId) {
      await this.commitUser().catch(() => {})
      await this.commitAssistant().catch(() => {})
      await this.store.setStatus(this.conversationId, reason === 'expired' ? 'incomplete' : 'ended').catch(() => {})
    }
    this.send({ type: 'closed', reason })
    this.upstream?.close()
    this.client?.close()
    this.upstream = null
    this.client = null
  }
}
