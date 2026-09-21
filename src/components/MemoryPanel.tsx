import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Pencil, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import type { Fact, PatientProfile } from '../../shared/types.js'
import { api } from '../api'
import { widgetLabel, widgetTint } from '../widgets'

const certaintyLabel: Record<Fact['certainty'], string> = { reported: 'You told me', confirmed: 'Confirmed', needs_verification: 'Needs verification' }

export function MemoryPanel({ onChanged, onOpen }: { onChanged: () => Promise<void>; onOpen: (id: string, turnId?: string) => void }) {
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setProfile(await api.profile()); setLoading(false) }, [])
  useEffect(() => { void load() }, [load])
  const groups = useMemo(() => { if (!profile) return []; const map = new Map<string, Fact[]>(); for (const fact of profile.facts) map.set(fact.widget,[...(map.get(fact.widget)||[]),fact]); return [...map.entries()] }, [profile])
  const edit = async (fact:Fact,detail:string) => { await api.updateFact(fact.id,{detail}); await load(); await onChanged() }
  const remove = async (fact:Fact) => { await api.updateFact(fact.id,{status:'corrected'}); await load(); await onChanged() }

  return <section className="rise mx-auto max-w-5xl">
    <div className="grid items-end gap-5 lg:grid-cols-[1fr_auto]">
      <div><p className="eyebrow text-teal">Your care thread</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What my navigator knows</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">A living picture built only from what you share and approve. Edit or remove any detail at any time.</p></div>
      <div className="flex gap-2"><span className="surface-soft flex items-center gap-2 rounded-full px-3 py-2 text-xs text-muted"><ShieldCheck size={14} className="text-teal"/> Patient-reported</span>{profile&&<span className="surface-soft rounded-full px-3 py-2 text-xs font-semibold">{profile.facts.length} saved</span>}</div>
    </div>
    {loading&&<p className="mt-8 text-sm text-muted">Loading…</p>}
    {!loading&&!profile?.facts.length&&<div className="surface mt-7 rounded-[30px] px-6 py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-soft text-teal"><Brain size={25}/></span><h2 className="mt-5 text-xl font-semibold">Your care thread starts with a conversation</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">When you choose to remember something, it appears here with its source and date. Harbor never locks you out of your own story.</p><div className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-5 border-t border-line pt-5 text-xs text-muted"><span className="flex items-center gap-1.5"><Sparkles size={13} className="text-amber"/> Organized automatically</span><span className="flex items-center gap-1.5"><Pencil size={13}/> Always editable</span></div></div>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{groups.map(([widget,facts])=><div key={widget} className="surface rounded-[26px] p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${widgetTint(widget as never)}`}>{widgetLabel(widget as never)}</span><span className="text-muted">{facts.length}</span></h2><ul className="mt-3 space-y-2">{facts.map(fact=><MemoryRow key={fact.id} fact={fact} onEdit={detail=>edit(fact,detail)} onRemove={()=>remove(fact)} onOpen={()=>onOpen(fact.conversation_id, fact.source_turn_id)}/>)}</ul></div>)}</div>
  </section>
}

function MemoryRow({fact,onEdit,onRemove,onOpen}:{fact:Fact;onEdit:(detail:string)=>Promise<void>;onRemove:()=>Promise<void>;onOpen:()=>void}) {
  const [editing,setEditing]=useState(false); const [draft,setDraft]=useState(fact.detail)
  const save=async()=>{setEditing(false);const detail=draft.trim();if(detail&&detail!==fact.detail)await onEdit(detail)}
  return <li className="fact-row"><div className="flex items-start gap-2">{editing?<input autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>void save()} onKeyDown={e=>{if(e.key==='Enter')void save();if(e.key==='Escape'){setDraft(fact.detail);setEditing(false)}}} className="min-w-0 flex-1 rounded-lg border border-teal bg-white px-2 py-1 text-sm outline-none"/>:<p className="min-w-0 flex-1 text-sm leading-relaxed">{fact.detail}</p>}<div className="flex shrink-0 gap-1 text-muted"><button onClick={()=>{setDraft(fact.detail);setEditing(true)}} title="Edit" className="rounded-lg p-1.5 transition hover:bg-line/60 hover:text-ink"><Pencil size={13}/></button><button onClick={()=>void onRemove()} title="Delete" className="rounded-lg p-1.5 transition hover:bg-rose-soft hover:text-rose"><Trash2 size={13}/></button></div></div><p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted">{certaintyLabel[fact.certainty]} · {new Date(fact.created_at).toLocaleDateString()}{fact.level&&` · ${fact.level.replace('_',' ')}`}{fact.priority==='high'&&' · top priority'} · <button onClick={onOpen} className="font-semibold text-teal normal-case hover:underline">View source</button></p></li>
}
