import { useEffect, useState } from 'react'
import { ArrowUpRight, MessageCircleMore, Plus, Search, Trash2 } from 'lucide-react'
import type { Conversation } from '../../shared/types.js'
import { api } from '../api'

export function Conversations({ onOpen, onStart, busy }: { onOpen: (id: string) => void; onStart: () => void; busy: boolean }) {
  const [items, setItems] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      api.conversations(query)
        .then(rows => { if (active) setItems(rows) })
        .finally(() => { if (active) setLoading(false) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [query])

  const remove = async (id: string) => {
    await api.deleteConversation(id)
    setItems(current => current.filter(item => item.id !== id))
  }

  return (
    <section className="rise mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end gap-3">
        <div><p className="eyebrow text-teal">Your history</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Conversations</h1><p className="mt-2 text-sm text-muted">Return to any conversation, transcript, or care detail.</p></div>
        <button onClick={onStart} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-full bg-teal px-4 py-2 text-sm font-medium text-panel transition hover:brightness-110 disabled:opacity-60">
          <Plus size={16} /> New conversation
        </button>
      </div>

      <label className="surface mt-6 flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search size={16} className="text-muted" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search what was said…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>

      <ul className="mt-4 space-y-2">
        {items.map(conversation => (
          <li key={conversation.id} className="surface group flex items-center gap-4 rounded-2xl px-4 py-4 transition hover:-translate-y-0.5 hover:border-teal/30">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal"><MessageCircleMore size={18}/></span>
            <button onClick={() => onOpen(conversation.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{conversation.title || 'Untitled conversation'}</span>
              <span className="block text-xs text-muted">
                {new Date(conversation.started_at).toLocaleString()} · {conversation.status}
              </span>
            </button>
            <ArrowUpRight size={16} className="text-muted transition group-hover:text-teal"/>
            <button onClick={() => void remove(conversation.id)} title="Delete" className="rounded-lg p-2 text-muted transition hover:bg-rose-soft hover:text-rose">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!items.length && !loading && (
          <li className="surface rounded-[28px] px-5 py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-soft text-teal"><MessageCircleMore size={25}/></span><h2 className="mt-4 text-lg font-semibold">{query?'No matching conversations':'Your conversations will live here'}</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">{query?'Try a different word or phrase.':'Start a voice conversation and Harbor will save the transcript, care views, and outcome automatically.'}</p></li>
        )}
      </ul>
    </section>
  )
}
