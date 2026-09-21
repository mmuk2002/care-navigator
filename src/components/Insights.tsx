import { useMemo, useState } from 'react'
import { Check, ChevronDown, GitMerge, LayoutGrid, Loader2, Quote, ScanText, Sparkles } from 'lucide-react'
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
    <section className="surface rounded-[26px] p-5">
      <button onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2">
          <Sparkles size={15} className="text-amber" />
          <span>
            <span className="block text-sm font-semibold">Behind the scenes</span>
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
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Pipeline icon={<Quote size={13}/>} label="Evidence" detail="Source words linked" working={working}/>
            <Pipeline icon={<ScanText size={13}/>} label="Classify" detail="16 care categories" working={working}/>
            <Pipeline icon={<GitMerge size={13}/>} label="Reconcile" detail="Duplicates & conflicts" working={working}/>
            <Pipeline icon={<LayoutGrid size={13}/>} label="Project" detail="Live care views" working={working}/>
          </div>
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

function Pipeline({icon,label,detail,working}:{icon:React.ReactNode;label:string;detail:string;working:boolean}) {
  return <div className="rounded-2xl border border-line/80 bg-paper/65 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-ink"><span className="text-teal">{working?<Loader2 size={13} className="animate-spin"/>:<Check size={13}/>}</span>{icon}{label}</div><p className="mt-1 text-[10px] text-muted">{detail}</p></div>
}
