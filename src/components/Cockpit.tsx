import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Fact } from '../../shared/types.js'
import { careCards, type CareCard } from '../../shared/cockpit.js'
import { api } from '../api'
import { widgetLabel, widgetTint } from '../widgets'

const pinKey = 'harbor.pinned'

export function Cockpit({ facts, conversationId, onChanged }: {
  facts: Fact[]
  conversationId: string
  onChanged: () => void
}) {
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(pinKey) || '[]') as string[] } catch { return [] }
  })

  useEffect(() => { localStorage.setItem(pinKey, JSON.stringify(pinned)) }, [pinned])

  const cards = useMemo(() => careCards(facts, conversationId), [facts, conversationId])
  const ordered = useMemo(() => {
    const isPinned = (card: CareCard) => pinned.includes(card.kind)
    return [...cards.filter(isPinned), ...cards.filter(card => !isPinned(card))]
  }, [cards, pinned])

  const togglePin = (kind: string) => setPinned(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind])

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Live care view</h2>
        <span className="text-xs text-muted">{cards.length} views · patient-reported</span>
      </div>
      {ordered.length === 0 ? (
        <p className="mt-3 rounded-3xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
          As you talk, Harbor sorts what it hears into these views. Nothing is verified by Harbor.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {ordered.map(card => (
            <Card key={card.kind} card={card} pinned={pinned.includes(card.kind)} onPin={() => togglePin(card.kind)} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}

function Card({ card, pinned, onPin, onChanged }: { card: CareCard; pinned: boolean; onPin: () => void; onChanged: () => void }) {
  return (
    <article className={`rise rounded-3xl border bg-panel p-4 ${pinned ? 'border-teal/50' : 'border-line'}`}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{card.title}</h3>
          <p className="text-xs text-muted">{card.subtitle}</p>
        </div>
        <button onClick={onPin} title={pinned ? 'Unpin' : 'Pin'} className="text-muted transition hover:text-teal">
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      </header>
      <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${card.derived ? 'bg-ink/80 text-panel' : 'bg-line/70 text-muted'}`}>
        {card.status}
      </p>
      {card.note && <p className="mt-2 whitespace-pre-line text-xs text-muted">{card.note}</p>}
      <ul className="mt-3 space-y-2">
        {card.items.slice(0, 4).map(fact => (
          <FactRow key={fact.id} fact={fact} onChanged={onChanged} />
        ))}
      </ul>
    </article>
  )
}

function FactRow({ fact, onChanged }: { fact: Fact; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact.detail)
  const [showQuote, setShowQuote] = useState(false)

  const save = async () => {
    const detail = draft.trim()
    setEditing(false)
    if (!detail || detail === fact.detail) return
    await api.updateFact(fact.id, { detail })
    onChanged()
  }

  const act = async (patch: { status?: Fact['status'] }) => { await api.updateFact(fact.id, patch); onChanged() }

  return (
    <li className="rounded-2xl border border-line px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${widgetTint(fact.widget)}`}>
          {widgetLabel(fact.widget)}
        </span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={event => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') { setDraft(fact.detail); setEditing(false) } }}
            className="min-w-0 flex-1 rounded-lg border border-teal bg-paper px-2 py-1 text-sm outline-none"
          />
        ) : (
          <button onClick={() => setShowQuote(value => !value)} className="min-w-0 flex-1 text-left text-sm">
            {fact.detail}
          </button>
        )}
        <div className="flex shrink-0 gap-1 text-muted">
          {fact.status !== 'completed' && (
            <button onClick={() => void act({ status: 'completed' })} title="Mark done" className="transition hover:text-teal"><Check size={14} /></button>
          )}
          <button onClick={() => { setDraft(fact.detail); setEditing(true) }} title="Edit" className="transition hover:text-ink"><Pencil size={14} /></button>
          <button onClick={() => void act({ status: 'corrected' })} title="Delete" className="transition hover:text-rose"><Trash2 size={14} /></button>
        </div>
      </div>
      {showQuote && fact.source_quote && (
        <p className="mt-1.5 border-l-2 border-line pl-2 text-xs italic text-muted">“{fact.source_quote}”</p>
      )}
    </li>
  )
}
