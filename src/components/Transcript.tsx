import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Turn } from '../../shared/types.js'

export function Transcript({ turns }: { turns: Turn[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <button onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between">
        <span>
          <span className="block text-sm font-semibold">Full transcript</span>
          <span className="block text-xs text-muted">{turns.length} turns · saved automatically</span>
        </span>
        <ChevronDown size={16} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {turns.map(turn => (
            <div key={turn.id} className={turn.speaker === 'assistant' ? 'text-muted' : ''}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal">
                {turn.speaker === 'assistant' ? 'Harbor' : 'You'}
                {turn.interrupted && <span className="ml-2 font-normal normal-case text-muted">(interrupted)</span>}
              </p>
              <p className="text-sm">{turn.text}</p>
            </div>
          ))}
          {!turns.length && <p className="py-6 text-center text-sm text-muted">No turns yet.</p>}
        </div>
      )}
    </section>
  )
}
