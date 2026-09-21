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
    <div className="mt-5">
      <div className="voice-stage">
       <div className="flex items-center gap-4">
        <span className={`voice-orb ${live ? 'live' : 'opacity-75 grayscale-[.25]'}`}>
          {live ? <Mic size={26} /> : <MicOff size={25} />}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight">{statusText[voice.status]}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {voice.status === 'speaking' ? 'You can interrupt any time.' : 'Speak naturally; pauses are fine.'}
          </p>
        </div>
        <button
          onClick={live ? voice.stop : () => void voice.start()}
          disabled={disabled}
          className={`ml-auto rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${live ? 'border border-teal/20 bg-white/70 text-teal hover:bg-white' : 'bg-teal text-panel shadow-md shadow-teal/15 hover:brightness-110'}`}
        >
          {live ? 'Stop' : 'Talk'}
        </button>
       </div>

       {voice.notice && <p className="mt-3 rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber">{voice.notice}</p>}

      <div ref={captionsRef} className="scroll-subtle mt-4 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-white/60 bg-white/55 p-3.5">
        {voice.captions.length === 0 && <div className="py-7 text-center"><div className="wave-bars mx-auto justify-center text-teal/40" aria-hidden="true">{Array.from({length:9},(_,i)=><i key={i}/>)}</div><p className="mt-2 text-xs text-muted">Live captions will appear here.</p></div>}
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
    </div>
  )
}
