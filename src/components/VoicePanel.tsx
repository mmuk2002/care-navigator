import { useEffect, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import type { useVoice } from '../useVoice'

type Voice = ReturnType<typeof useVoice>

const statusText: Record<Voice['status'], string> = {
  idle: 'Ready when you are',
  connecting: 'Connecting…',
  listening: 'Listening',
  speaking: 'Speaking',
  closed: 'Conversation closed',
  error: 'Something went wrong',
}

export function VoicePanel({ voice, disabled }: { voice: Voice; disabled: boolean }) {
  const captionsRef = useRef<HTMLDivElement>(null)
  const live = voice.status === 'listening' || voice.status === 'speaking' || voice.status === 'connecting'

  useEffect(() => {
    captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight, behavior: 'smooth' })
  }, [voice.captions])

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <span className={`relative grid h-12 w-12 place-items-center rounded-full transition ${live ? 'ring-pulse bg-teal text-panel' : 'bg-line/60 text-muted'}`}>
          {live ? <Mic size={20} /> : <MicOff size={20} />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{statusText[voice.status]}</p>
          <p className="text-xs text-muted">
            {voice.status === 'speaking' ? 'You can interrupt any time.' : 'Speak naturally; pauses are fine.'}
          </p>
        </div>
        <button
          onClick={live ? voice.stop : () => void voice.start()}
          disabled={disabled}
          className={`ml-auto rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${live ? 'border border-line hover:bg-line/50' : 'bg-teal text-panel hover:brightness-110'}`}
        >
          {live ? 'Stop' : 'Talk'}
        </button>
      </div>

      {voice.notice && <p className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber">{voice.notice}</p>}

      <div ref={captionsRef} className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-paper p-3">
        {voice.captions.length === 0 && <p className="py-6 text-center text-xs text-muted">Live captions will appear here.</p>}
        {voice.captions.map((caption, index) => (
          <p key={index} className={`text-sm ${caption.speaker === 'assistant' ? 'text-muted' : ''} ${caption.final ? '' : 'opacity-70'}`}>
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal">
              {caption.speaker === 'assistant' ? 'Harbor' : 'You'}
            </span>
            {caption.text}
          </p>
        ))}
      </div>
    </div>
  )
}
