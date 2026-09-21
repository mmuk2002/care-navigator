import { useEffect, useState, type ReactNode } from 'react'
import { AudioLines, Clock3, Mic, MicOff, Send, Square } from 'lucide-react'
import type { Conversation } from '../../shared/types.js'
import type { useVoice } from '../useVoice'

type Voice = ReturnType<typeof useVoice>

function elapsed(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** The live call surface: orb, state, timer, controls, and a typed fallback. */
export function CallSurface({ voice, conversation, navigatorName, onTyped, onEnd, onAdjust, adjusting, children }: {
  voice: Voice
  conversation: Conversation
  navigatorName: string
  onTyped: (text: string) => Promise<void>
  onEnd: () => void
  onAdjust: () => void
  adjusting: boolean
  children?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const live = voice.status === 'listening' || voice.status === 'speaking' || voice.status === 'connecting'
  const heading = voice.status === 'speaking' ? `${navigatorName} is speaking`
    : voice.status === 'connecting' ? 'Finding a connection…'
      : voice.status === 'listening' ? "I'm listening."
        : voice.status === 'error' ? 'Something went wrong'
          : voice.status === 'closed' ? 'Conversation saved'
            : 'Ready when you are'
  const guidance = voice.notice
    || (voice.status === 'speaking' ? 'You can interrupt any time.' : 'Talk naturally. There is no rush.')

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await onTyped(text)
  }

  return (
    <section className="call-surface">
      <div className="call-top">
        <div className="live-state">
          <span className={`live-dot ${live ? 'pulse' : ''}`} />
          {live ? 'Live conversation' : conversation.status === 'ended' ? 'Conversation saved' : 'Ready to talk'}
        </div>
        <span className="call-timer"><Clock3 size={15} /> {elapsed(conversation.started_at)}</span>
      </div>

      <div className={`call-orb ${voice.status}`}>
        <div className="orb-wave a" />
        <div className="orb-wave b" />
        <span className="orb-center"><AudioLines size={44} strokeWidth={1.35} /></span>
      </div>

      <h2>{heading}</h2>
      <p className="call-guidance">{guidance}</p>

      <div className="call-controls">
        <button
          onClick={live ? voice.stop : () => void voice.start()}
          className="round-control"
          title={live ? 'Stop listening' : 'Start talking'}
          aria-label={live ? 'Stop listening' : 'Start talking'}
        >
          {live ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
        </button>
        {live && (
          <button
            onClick={voice.toggleMute}
            className={`round-control ${voice.muted ? 'muted' : ''}`}
            title={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}
        <button onClick={onAdjust} className="outline-control">{adjusting ? 'Done adjusting' : 'Adjust navigator'}</button>
        {conversation.status !== 'ended' && (
          <button onClick={() => { voice.stop(); onEnd() }} className="end-control"><Square size={14} fill="currentColor" /> End conversation</button>
        )}
      </div>

      <div className="sandbox-entry">
        <label htmlFor="typed-turn">Prefer to type?</label>
        <div>
          <input
            id="typed-turn"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void send() }}
            placeholder="Type what you would say…"
          />
          <button onClick={() => void send()} aria-label="Send typed turn"><Send size={15} /></button>
        </div>
      </div>

      {adjusting && children}
    </section>
  )
}
