import { useEffect, useRef } from 'react'
import { AudioLines, Users } from 'lucide-react'
import type { Turn } from '../../shared/types.js'

/**
 * The live transcript. Partial turns are persisted as they stream, so this list
 * grows while the person is still speaking, with a cursor on the active turn.
 */
export function LiveTranscript({ turns, live, navigatorName, snippets }: {
  turns: Turn[]
  live: boolean
  navigatorName: string
  snippets: string[]
}) {
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [turns, snippets])

  return (
    <section className="transcript-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow text-teal">Live session</span>
          <h2>Conversation transcript</h2>
        </div>
        <span className={`stream-tag ${live ? 'on' : ''}`}><span />{live ? 'Streaming' : 'Saved'}</span>
      </div>
      <p className="transcript-intro">Words appear here as they are spoken. Every detail on the right links back to something said.</p>

      {snippets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {snippets.slice(0, 4).map((snippet, index) => (
            <span key={index} className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] text-teal">{snippet}</span>
          ))}
        </div>
      )}

      <div className="transcript-list scroll-subtle" ref={list} role="log" aria-label="Conversation transcript" aria-live="off">
        {turns.length ? turns.map((turn, index) => {
          const active = live && index === turns.length - 1
          return (
            <article key={turn.id} className={`transcript-turn ${turn.speaker} ${active ? 'live' : ''}`}>
              <div className="turn-avatar">{turn.speaker === 'user' ? <Users size={15} /> : <AudioLines size={15} />}</div>
              <div className="turn-content">
                <div className="turn-meta">
                  <strong>{turn.speaker === 'user' ? 'You' : navigatorName}</strong>
                  <span>{active ? 'Now' : new Date(turn.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  {turn.interrupted && <span>Interrupted</span>}
                </div>
                <p>{turn.text}{active && <i className="live-cursor" aria-hidden="true" />}</p>
              </div>
            </article>
          )
        }) : (
          <div className="transcript-empty">
            <AudioLines size={26} className="mx-auto mb-2 opacity-60" />
            <p>The transcript will build here as you talk.</p>
          </div>
        )}
      </div>
    </section>
  )
}
