import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'closed' | 'error'

interface Caption { speaker: 'user' | 'assistant'; text: string; final: boolean }

function base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(bytes.length / 2)
  for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768
  return samples
}

/** Resample to 16 kHz and convert to signed 16-bit PCM, which Gemini Live expects. */
function toPcm16(input: Float32Array, sourceRate: number): ArrayBuffer {
  const ratio = sourceRate / 16000
  const length = Math.max(1, Math.floor(input.length / ratio))
  const buffer = new ArrayBuffer(length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < length; i += 1) {
    const sample = input[Math.min(input.length - 1, Math.floor(i * ratio))] || 0
    view.setInt16(i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  }
  return buffer
}

export function useVoice(conversationId: string | null, onSavedTurn: () => void) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [notice, setNotice] = useState('')
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const socket = useRef<WebSocket | null>(null)
  const audioReady = useRef(false)
  const closeFallback = useRef<ReturnType<typeof setTimeout> | null>(null)
  const input = useRef<AudioContext | null>(null)
  const output = useRef<AudioContext | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const node = useRef<ScriptProcessorNode | null>(null)
  const playhead = useRef(0)
  const sources = useRef<AudioBufferSourceNode[]>([])
  const saved = useRef(onSavedTurn)
  saved.current = onSavedTurn

  const stopAudio = useCallback(() => {
    for (const source of sources.current) { try { source.stop() } catch { /* already stopped */ } }
    sources.current = []
    playhead.current = output.current?.currentTime || 0
  }, [])

  const teardown = useCallback(() => {
    audioReady.current = false
    if (closeFallback.current) clearTimeout(closeFallback.current)
    closeFallback.current = null
    node.current?.disconnect()
    node.current = null
    mic.current?.getTracks().forEach(track => track.stop())
    mic.current = null
    void input.current?.close().catch(() => {})
    input.current = null
    void output.current?.close().catch(() => {})
    output.current = null
  }, [])

  const stop = useCallback(() => {
    const ws = socket.current
    audioReady.current = false
    stopAudio()
    teardown()
    setStatus('closed')
    if (ws?.readyState === WebSocket.OPEN) {
      // Let Gemini finish the active transcript before the server closes the session.
      ws.send(JSON.stringify({ type: 'stop' }))
      closeFallback.current = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
      }, 2500)
    } else ws?.close()
  }, [stopAudio, teardown])

  const steer = useCallback((directive: string) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'steer', directive }))
  }, [])

  const start = useCallback(async () => {
    if (!conversationId) return
    setStatus('connecting')
    setNotice('')
    setCaptions([])
    mutedRef.current = false
    setMuted(false)
    audioReady.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      mic.current = stream
      const inputCtx = new AudioContext()
      input.current = inputCtx
      const source = inputCtx.createMediaStreamSource(stream)
      const processor = inputCtx.createScriptProcessor(4096, 1, 1)
      node.current = processor
      const sink = inputCtx.createGain()
      sink.gain.value = 0
      source.connect(processor)
      processor.connect(sink)
      sink.connect(inputCtx.destination)

      const outputCtx = new AudioContext()
      output.current = outputCtx
      playhead.current = outputCtx.currentTime

      // Browsers can hand back a suspended context; resume both so capture and
      // playback work immediately after the user starts the session.
      if (inputCtx.state === 'suspended') await inputCtx.resume().catch(() => undefined)
      if (outputCtx.state === 'suspended') await outputCtx.resume().catch(() => undefined)

      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/voice?conversation=${encodeURIComponent(conversationId)}`)
      ws.binaryType = 'arraybuffer'
      socket.current = ws

      processor.onaudioprocess = event => {
        if (ws.readyState !== WebSocket.OPEN || !audioReady.current || mutedRef.current) return
        ws.send(toPcm16(event.inputBuffer.getChannelData(0), inputCtx.sampleRate))
      }

      ws.onmessage = event => {
        if (typeof event.data !== 'string') return
        let message: { type: string; speaker?: 'user' | 'assistant'; text?: string; final?: boolean; data?: string; message?: string; reason?: string }
        try { message = JSON.parse(event.data) } catch { return }
        switch (message.type) {
          case 'ready': audioReady.current = true; setStatus('listening'); break
          case 'listening': setStatus('listening'); break
          case 'speaking': setStatus('speaking'); break
          case 'interrupted': stopAudio(); setStatus('listening'); break
          case 'transcript': {
            const caption: Caption = { speaker: message.speaker || 'user', text: message.text || '', final: Boolean(message.final) }
            setCaptions(current => {
              const next = [...current]
              const index = next.findIndex(item => item.speaker === caption.speaker && !item.final)
              if (index >= 0) next[index] = caption
              else next.push(caption)
              return next.slice(-60)
            })
            if (caption.final && caption.speaker === 'user') saved.current()
            break
          }
          case 'audio': {
            const outputCtx = output.current
            if (!outputCtx || !message.data) break
            const samples = base64ToFloat32(message.data)
            const buffer = outputCtx.createBuffer(1, samples.length, 24000)
            buffer.copyToChannel(samples, 0)
            const source = outputCtx.createBufferSource()
            source.buffer = buffer
            source.connect(outputCtx.destination)
            playhead.current = Math.max(playhead.current, outputCtx.currentTime)
            source.start(playhead.current)
            playhead.current += buffer.duration
            sources.current.push(source)
            source.onended = () => { sources.current = sources.current.filter(item => item !== source) }
            break
          }
          case 'notice': setNotice(message.message || ''); break
          case 'error': audioReady.current = false; setStatus('error'); setNotice(message.message || 'Voice failed'); break
          case 'closed': audioReady.current = false; setStatus('closed'); break
        }
      }
      ws.onerror = () => { audioReady.current = false; setStatus('error'); setNotice('The voice connection dropped.') }
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null
        teardown()
        setStatus(current => (current === 'error' ? current : 'closed'))
      }
    } catch (error) {
      teardown()
      setStatus('error')
      setNotice(error instanceof Error ? error.message : 'Microphone unavailable')
    }
  }, [conversationId, stopAudio, teardown])

  const toggleMute = useCallback(() => setMuted(current => {
    mutedRef.current = !current
    return !current
  }), [])

  // The in-progress utterance, straight from the socket, so the transcript can
  // show words as they are spoken without waiting for a database round-trip.
  // Keep the newest socket caption visible even after it becomes final. The
  // transcript component removes it only after the matching persisted turn
  // arrives, avoiding a flash back to an older database snapshot.
  const liveUser = useMemo(() => [...captions].reverse().find(caption => caption.speaker === 'user')?.text || '', [captions])
  const liveAssistant = useMemo(() => [...captions].reverse().find(caption => caption.speaker === 'assistant')?.text || '', [captions])

  useEffect(() => () => { socket.current?.close(); teardown() }, [teardown])

  return { status, captions, notice, muted, toggleMute, liveUser, liveAssistant, start, stop, steer }
}
