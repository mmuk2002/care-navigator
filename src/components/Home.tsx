import { useMemo } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, CircleDot, Mic, Settings2, Sparkles } from 'lucide-react'
import type { Bootstrap } from '../api'
import { agenda, careGoal, readinessChecklist } from '../../shared/cockpit.js'
import { widgetLabel, widgetTint } from '../widgets'

export function Home({ boot, busy, onStart, onOpen, onSettings }: { boot: Bootstrap; busy: boolean; onStart: () => void; onOpen: (id: string) => void; onSettings: () => void }) {
  const { profile, conversations, settings } = boot
  const patient = settings.context.subject === 'other' && settings.context.patient_name ? settings.context.patient_name : null
  const name = settings.context.speaker_name || 'there'
  const highlights = profile.facts.slice(0, 5)
  const upcoming = useMemo(() => {
    const appointment = profile.facts.find(fact => fact.widget === 'appointment' && fact.status !== 'corrected')
    if (!appointment) return null
    const remaining = readinessChecklist(profile.facts).filter(row => row.state !== 'done')
    return { appointment, remaining, top: agenda(profile.facts)?.items[0]?.detail || null, ride: profile.facts.find(f => f.widget === 'transport' && f.certainty === 'confirmed')?.detail || null, objective: careGoal(profile.facts) }
  }, [profile.facts])

  return <div className="space-y-7">
    <section className="grid gap-5 xl:grid-cols-[1.38fr_.62fr]">
      <div className="hero-panel rise p-7 sm:p-10 lg:p-12">
        <div className="relative z-10 flex h-full max-w-3xl flex-col">
          <div className="flex items-center gap-2 text-sm text-white/75"><span className="status-dot bg-white shadow-none" /> Ready when you are</div>
          <h1 className="mt-8 max-w-2xl text-[2.4rem] font-semibold leading-[1.05] tracking-[-.045em] sm:text-5xl lg:text-[3.35rem]">
            Hi, {name}. Let’s make care feel <em>a little more manageable.</em>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/74 sm:text-lg">
            Talk naturally about what’s happening. Harbor listens, remembers the details you approve, and turns them into a clear next step{patient ? ` for ${patient}` : ''}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={onStart} disabled={busy} className="primary-action disabled:opacity-60"><Mic size={18} /> {upcoming ? 'Continue the conversation' : 'Start talking'}</button>
            <button onClick={onSettings} className="secondary-action"><Settings2 size={16} /> Personalize Harbor</button>
          </div>
          <div className="mt-auto flex items-end justify-between gap-5 pt-10">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/66"><span className="flex items-center gap-1.5"><CheckCircle2 size={13}/> Non-clinical support</span><span className="flex items-center gap-1.5"><CheckCircle2 size={13}/> You control memory</span><span className="flex items-center gap-1.5"><CheckCircle2 size={13}/> Saved automatically</span></div>
            <div className="wave-bars hidden shrink-0 text-white/70 sm:flex" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>
          </div>
        </div>
      </div>

      <aside className="surface rise rounded-[30px] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-teal">Your care thread</p><h2 className="mt-2 text-xl font-semibold tracking-tight">What Harbor remembers</h2></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-soft text-amber"><Sparkles size={17}/></span></div>
        <p className="mt-2 text-sm leading-relaxed text-muted">A concise, editable picture carried across conversations.</p>
        {highlights.length ? <ul className="mt-5 space-y-2.5">{highlights.map((fact,index)=><li key={fact.id} className="group rounded-2xl border border-line/80 bg-white/65 p-3 transition hover:border-teal/25 hover:bg-white"><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${widgetTint(fact.widget)}`}>{widgetLabel(fact.widget)}</span>{index===0&&<span className="text-[10px] text-muted">Most recent</span>}</div><p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed">{fact.detail}</p></li>)}</ul> : <div className="mt-6 rounded-2xl border border-dashed border-line p-7 text-center"><p className="text-sm font-medium">A fresh start</p><p className="mt-1 text-xs leading-relaxed text-muted">Approved details from your conversations will gather here.</p></div>}
      </aside>
    </section>

    {upcoming && <section className="surface rounded-[28px] p-5 sm:p-6"><div className="flex flex-wrap items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-soft text-teal"><CalendarClock size={20}/></span><div className="min-w-0 flex-1"><p className="eyebrow">Coming up</p><h2 className="mt-1 text-lg font-semibold">{upcoming.appointment.detail}</h2></div>{upcoming.objective&&<p className="max-w-sm text-sm text-muted">Goal: {upcoming.objective}</p>}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Resume label="Transportation" value={upcoming.ride||'Still to confirm'}/><Resume label="Top discussion item" value={upcoming.top||'Not captured yet'}/><Resume label="Ready check" value={upcoming.remaining.length ? `${upcoming.remaining.length} item${upcoming.remaining.length===1?'':'s'} left`:'You’re ready'}/></div></section>}

    <section className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
      <div className="surface rounded-[28px] p-5"><p className="eyebrow">At a glance</p><dl className="mt-4 grid grid-cols-3 gap-2"><Stat label="Talks" value={String(profile.conversation_count)}/><Stat label="Details" value={String(profile.facts.length)}/><Stat label="Updated" value={profile.last_activity?new Date(profile.last_activity).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—'}/></dl></div>
      <div className="surface rounded-[28px] p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Recent conversations</p><h2 className="mt-1 text-lg font-semibold">Pick up where you left off</h2></div>{conversations.length>0&&<span className="text-xs text-muted">{conversations.length} saved</span>}</div>{conversations.length?<ul className="mt-3 grid gap-2 sm:grid-cols-2">{conversations.slice(0,4).map(c=><li key={c.id}><button onClick={()=>onOpen(c.id)} className="group flex w-full items-center gap-3 rounded-2xl border border-line/75 bg-white/55 p-3 text-left transition hover:border-teal/30 hover:bg-white"><CircleDot size={14} className="shrink-0 text-teal"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.title||'Untitled conversation'}</span><span className="block text-[11px] text-muted">{new Date(c.started_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {c.status}</span></span><ArrowRight size={14} className="text-muted transition group-hover:translate-x-1 group-hover:text-teal"/></button></li>)}</ul>:<p className="mt-4 text-sm text-muted">Your first conversation will appear here.</p>}</div>
    </section>
  </div>
}

function Resume({label,value}:{label:string;value:string}){return <div className="surface-soft rounded-2xl px-4 py-3"><p className="eyebrow">{label}</p><p className="mt-1.5 truncate text-sm font-medium" title={value}>{value}</p></div>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-paper/75 p-3 text-center"><dd className="text-xl font-semibold tracking-tight">{value}</dd><dt className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt></div>}
