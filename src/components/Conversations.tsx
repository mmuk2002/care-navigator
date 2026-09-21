import { useEffect, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
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
    <section className="rise">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <button onClick={onStart} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-full bg-teal px-4 py-2 text-sm font-medium text-panel transition hover:brightness-110 disabled:opacity-60">
          <Plus size={16} /> New conversation
        </button>
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2">
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
          <li key={conversation.id} className="group flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
            <button onClick={() => onOpen(conversation.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{conversation.title || 'Untitled conversation'}</span>
              <span className="block text-xs text-muted">
                {new Date(conversation.started_at).toLocaleString()} · {conversation.status}
              </span>
            </button>
            <button onClick={() => void remove(conversation.id)} title="Delete" className="text-muted transition hover:text-rose">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!items.length && !loading && (
          <li className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-sm text-muted">
            {query ? 'Nothing matched that search.' : 'No conversations yet.'}
          </li>
        )}
      </ul>
    </section>
  )
}
