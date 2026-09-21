import { useEffect, useRef } from 'react'
import { AudioLines, Users } from 'lucide-react'
import type { Turn } from '../../shared/types.js'
import { lastTurnText, pendingLive } from '../../shared/transcript.js'

/**
 * The live transcript. Saved turns come from the store, and the in-progress
 * utterance is rendered straight from the socket so words appear as they are
 * spoken. `pendingLive` drops the overlap with the turn already saved.
 */
export function LiveTranscript({ turns, live, navigatorName, liveUser = '', liveAssistant = '' }: {
  turns: Turn[]
  live: boolean
  navigatorName: string
  liveUser?: string
  liveAssistant?: string
}) {
  const list = useRef<HTMLDivElement>(null)

  const pendingUser = pendingLive(liveUser, lastTurnText(turns, 'user'))
  const pendingAssistant = pendingLive(liveAssistant, lastTurnText(turns, 'assistant'))
  const hasPending = Boolean(pendingUser || pendingAssistant)

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [turns, pendingUser, pendingAssistant])

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

      <div className="transcript-list scroll-subtle" ref={list} role="log" aria-label="Conversation transcript" aria-live="off">
        {turns.length ? turns.map((turn, index) => {
          const active = live && !hasPending && index === turns.length - 1
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
        }) : (!pendingUser && !pendingAssistant) && (
          <div className="transcript-empty">
            <AudioLines size={26} className="mx-auto mb-2 opacity-60" />
            <p>The transcript will build here as you talk.</p>
          </div>
        )}

        {pendingUser && <PendingTurn speaker="user" text={pendingUser} navigatorName={navigatorName} />}
        {pendingAssistant && <PendingTurn speaker="assistant" text={pendingAssistant} navigatorName={navigatorName} />}
      </div>
    </section>
  )
}

function PendingTurn({ speaker, text, navigatorName }: { speaker: 'user' | 'assistant'; text: string; navigatorName: string }) {
  return (
    <article className={`transcript-turn ${speaker} live`}>
      <div className="turn-avatar">{speaker === 'user' ? <Users size={15} /> : <AudioLines size={15} />}</div>
      <div className="turn-content">
        <div className="turn-meta">
          <strong>{speaker === 'user' ? 'You' : navigatorName}</strong>
          <span>Now</span>
        </div>
        <p>{text}<i className="live-cursor" aria-hidden="true" /></p>
      </div>
    </article>
  )
}
