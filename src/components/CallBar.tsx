import { useEffect, useState } from 'react'
import { Keyboard, Mic, Pause, Play, Send, Square } from 'lucide-react'
import type { Conversation } from '../../shared/types.js'
import type { useVoice } from '../useVoice'

type Voice = ReturnType<typeof useVoice>

function elapsed(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** A slim call bar: state, timer, pause/resume, end, and a typed fallback. */
export function CallBar({ voice, conversation, navigatorName, onTyped, onEnd }: {
  voice: Voice
  conversation: Conversation
  navigatorName: string
  onTyped: (text: string) => Promise<void>
  onEnd: () => void
}) {
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const live = voice.status === 'listening' || voice.status === 'speaking' || voice.status === 'connecting'
  const paused = voice.muted
  const label = !live ? (voice.status === 'closed' ? 'Call ended' : voice.status === 'error' ? 'Microphone unavailable' : 'Ready')
    : paused ? 'Paused'
      : voice.status === 'speaking' ? `${navigatorName} is speaking`
        : voice.status === 'connecting' ? 'Connecting…'
          : 'Listening'

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await onTyped(text)
  }

  return (
    <div className="surface rounded-3xl p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`live-dot ${live && !paused ? 'pulse' : ''}`} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="tabular-nums">{elapsed(conversation.started_at)}</span>
        </span>
        {live ? (
          <>
            <button
              onClick={voice.toggleMute}
              className={`round-control ${paused ? 'muted' : ''}`}
              title={paused ? 'Resume' : 'Pause'}
              aria-label={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button onClick={() => { voice.stop(); onEnd() }} className="end-control" title="End call">
              <Square size={13} fill="currentColor" /> End
            </button>
          </>
        ) : (
          <button onClick={() => void voice.start()} className="outline-control" title="Start talking">
            <Mic size={15} /> {voice.status === 'closed' ? 'Resume call' : 'Start'}
          </button>
        )}
        <button
          onClick={() => setTyping(value => !value)}
          className={`round-control ${typing ? 'muted' : ''}`}
          title={typing ? 'Hide typing' : 'Type instead'}
          aria-label={typing ? 'Hide typing' : 'Type instead'}
        >
          <Keyboard size={16} />
        </button>
      </div>

      {voice.notice && <p className="mt-2 text-xs text-amber">{voice.notice}</p>}

      {typing && (
        <div className="mt-2.5 flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void send() }}
            placeholder="Type what you would say…"
            className="min-w-0 flex-1 rounded-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <button onClick={() => void send()} aria-label="Send typed turn" className="rounded-full bg-teal px-3 py-2 text-panel"><Send size={15} /></button>
        </div>
      )}
    </div>
  )
}
