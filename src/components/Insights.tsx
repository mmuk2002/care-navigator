import { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import type { Fact, WidgetState } from '../../shared/types.js'
import { snippetFor } from '../../shared/cockpit.js'
import { widgetDot, widgetLabel } from '../widgets'

/**
 * The widgets are projections of one shared extraction. This panel shows that
 * single pass: its status, what it produced, and the latest captured facts.
 */
export function Insights({ widgets: states, facts }: { widgets: WidgetState[]; facts: Fact[] }) {
  const [open, setOpen] = useState(true)
  const saved = useMemo(() => facts.filter(fact => fact.status !== 'corrected'), [facts])
  const working = states.some(state => state.status === 'working')
  const failed = states.some(state => state.status === 'failed')

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const fact of saved) map.set(fact.widget, (map.get(fact.widget) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [saved])

  const feed = useMemo(
    () => [...saved].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8),
    [saved],
  )

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <button onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2">
          <Sparkles size={15} className="text-amber" />
          <span>
            <span className="block text-sm font-semibold">One extraction pass</span>
            <span className="block text-xs text-muted">
              Each turn becomes one evidence-backed set of facts. The widgets read from it.
            </span>
          </span>
        </span>
        <ChevronDown size={16} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <p className="mt-3 flex items-center gap-2 text-xs">
        {working
          ? <><Loader2 size={12} className="animate-spin text-teal" /> <span className="text-teal">Extracting from the latest turn…</span></>
          : failed
            ? <span className="text-amber">Model unavailable — using the rule-based reader</span>
            : <span className="text-muted">Up to date · {saved.length} fact{saved.length === 1 ? '' : 's'} saved</span>}
      </p>

      {open && (
        <>
          {counts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {counts.map(([widget, count]) => (
                <span key={widget} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${widgetDot(widget as never)}`} />
                  {widgetLabel(widget as never)} · {count}
                </span>
              ))}
            </div>
          )}

          <ul className="mt-3 space-y-1.5">
            {feed.map(fact => (
              <li key={fact.id} className="rise truncate text-xs text-muted" title={fact.detail}>
                {snippetFor(fact)}
              </li>
            ))}
            {!feed.length && <li className="py-4 text-center text-xs text-muted">Nothing captured yet.</li>}
          </ul>
        </>
      )}
    </section>
  )
}
