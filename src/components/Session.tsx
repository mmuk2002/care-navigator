import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock3, Sparkles, Target, Undo2, X } from 'lucide-react'
import type { ConversationDetail, Fact, Settings } from '../../shared/types.js'
import { accomplishments, careGoal, nextStep } from '../../shared/cockpit.js'
import { api } from '../api'
import { useVoice } from '../useVoice'
import { CallBar } from './CallBar'
import { LiveTranscript } from './LiveTranscript'
import { Cockpit } from './Cockpit'
import { Insights } from './Insights'

export function Session({ detail, onRefresh, onEnd, onExit }: {
  detail: ConversationDetail
  onRefresh: () => Promise<void>
  onEnd: () => Promise<void>
  onExit: () => void
}) {
  const { conversation, turns, facts, widgets } = detail
  const [adjusting, setAdjusting] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [deleted, setDeleted] = useState<Fact | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Throttle, not debounce: partial transcripts arrive faster than any debounce
  // window, so a trailing timer would starve and only fire once speaking stopped.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      void onRefresh()
    }, 400)
  }, [onRefresh])

  useEffect(() => {
    const source = new EventSource(`/api/conversations/${conversation.id}/events`)
    source.onmessage = () => scheduleRefresh()
    return () => { source.close(); if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, [conversation.id, scheduleRefresh])

  const voice = useVoice(conversation.id, scheduleRefresh)
  const live = voice.status === 'listening' || voice.status === 'speaking' || voice.status === 'connecting'
  const autoStarted = useRef(false)

  // Starting a conversation starts the microphone. No second click needed.
  useEffect(() => {
    if (autoStarted.current) return
    if (conversation.status === 'ended' || conversation.status === 'incomplete') return
    autoStarted.current = true
    void voice.start()
  }, [conversation.id, conversation.status, voice.start])

  const goal = useMemo(() => careGoal(facts), [facts])
  const step = useMemo(() => nextStep(facts), [facts])
  const patient = conversation.settings.context
  const navigatorName = conversation.settings.preferences.agentName || 'Harbor'

  const changeGoal = async () => {
    const text = goalDraft.trim()
    if (!text) return setEditingGoal(false)
    await api.sendTurn(conversation.id, `My goal is: ${text}`)
    setGoalDraft(''); setEditingGoal(false); scheduleRefresh()
  }

  const sendTyped = async (text: string) => {
    await api.typedTurn(conversation.id, text)
    scheduleRefresh()
  }

  const removeFact = async (fact: Fact) => {
    await api.updateFact(fact.id, { status: 'corrected' })
    setDeleted(fact)
    scheduleRefresh()
    setTimeout(() => setDeleted(current => (current?.id === fact.id ? null : current)), 8000)
  }

  const undoDelete = async () => {
    if (!deleted) return
    await api.updateFact(deleted.id, { status: 'reported' })
    setDeleted(null)
    scheduleRefresh()
  }

  const adjust = async (patch: Partial<Settings['preferences']>) => {
    const settings = { ...conversation.settings, preferences: { ...conversation.settings.preferences, ...patch } }
    await api.saveSettings(settings)
    voice.steer(`Adjustment for the rest of this conversation: ${describe(patch)} Apply it from now on.`)
    await onRefresh()
  }

  if (conversation.status === 'ended' || conversation.status === 'incomplete') {
    return <div className="space-y-8">
      <button onClick={onExit} className="flex items-center gap-2 text-sm font-medium text-muted transition hover:text-teal"><ArrowLeft size={16}/> Back home</button>
      <Accomplishments detail={detail} onExit={onExit} />
      <section id="saved-details" className="border-t border-line pt-8">
        <div className="mb-5"><p className="eyebrow text-teal">Saved conversation</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Review the details and their source</h2><p className="mt-1 text-sm text-muted">Everything below remains editable after the conversation ends.</p></div>
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
          <Cockpit facts={facts} memory={detail.memory} conversationId={conversation.id} onChanged={scheduleRefresh} onDeleted={removeFact}/>
          <div className="space-y-4"><LiveTranscript turns={turns} live={false} navigatorName={navigatorName} /><Insights widgets={widgets} facts={facts}/></div>
        </div>
      </section>
    </div>
  }

  return (
   <>
    <header className="mb-7 flex flex-wrap items-end gap-5 border-b border-line pb-6">
      <button onClick={onExit} className="flex items-center gap-2 text-sm font-medium text-muted transition hover:text-teal"><ArrowLeft size={16}/> Back home</button>
      <div className="min-w-0 flex-1 sm:ml-4"><p className="eyebrow text-teal">{patient.subject === 'other' ? 'Family conversation' : 'Patient conversation'}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Take your time. I’m here.</h1><p className="mt-1 text-sm text-muted">We can take this one step at a time.</p></div>
      <button onClick={() => setAdjusting(value => !value)} className="outline-control">{adjusting ? 'Done adjusting' : 'Adjust navigator'}</button>
      <div className="hidden items-center gap-2 rounded-full border border-line bg-white/60 px-3 py-2 text-xs text-muted sm:flex"><Clock3 size={14}/> Started {new Date(conversation.started_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div>
    </header>
    {adjusting && <div className="mb-5"><AdjustPanel settings={conversation.settings} onChange={adjust} /></div>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr]">
      <div className="session-rail space-y-4">
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <p className="eyebrow">
              {patient.subject === 'other' ? `Navigating for ${patient.patient_name || 'a relative'}` : 'Navigating for yourself'}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{patient.speaker_name || 'This conversation'}</h2>
          </div>
          <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${live ? 'bg-teal-soft text-teal' : 'bg-line/70 text-muted'}`}>
            {live && <span className="status-dot" />}{live ? 'Live' : conversation.status}
          </span>
        </div>

        <CallBar voice={voice} conversation={conversation} navigatorName={navigatorName} onTyped={sendTyped} onEnd={onEnd} />

        <LiveTranscript turns={turns} live={live} navigatorName={navigatorName} liveUser={voice.liveUser} liveAssistant={voice.liveAssistant} />
      </div>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
          <span className="flex items-center gap-2"><span className="status-dot"/> Session workspace</span>
          <span className="flex items-center gap-1.5"><Clock3 size={13}/> Saved as you talk</span>
          <span className="flex items-center gap-1.5"><Sparkles size={13} className="text-amber"/> One extraction pass</span>
          <span className="ml-auto flex items-center gap-1.5"><CheckCircle2 size={13} className="text-teal"/> Every detail stays editable</span>
        </div>
        <section className="surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-soft text-teal"><Target size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Conversation goal</p>
              {editingGoal ? (
                <div className="mt-1 flex gap-2">
                  <input
                    autoFocus
                    value={goalDraft}
                    onChange={event => setGoalDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void changeGoal(); if (event.key === 'Escape') setEditingGoal(false) }}
                    placeholder="What are you trying to make happen?"
                    className="min-w-0 flex-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-teal"
                  />
                  <button onClick={() => void changeGoal()} className="rounded-full bg-teal px-3 py-1.5 text-xs font-medium text-panel">Save</button>
                </div>
              ) : (
                <p className="mt-1 text-lg font-medium leading-snug">{goal || 'Listening for what matters most…'}</p>
              )}
              {step && !editingGoal && (
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-ink">Next:</span> {step.text}
                </p>
              )}
            </div>
            {!editingGoal && (
              <button onClick={() => { setGoalDraft(goal || ''); setEditingGoal(true) }} className="shrink-0 text-xs font-medium text-teal hover:underline">
                Change goal
              </button>
            )}
          </div>
        </section>

        <Cockpit facts={facts} memory={detail.memory} conversationId={conversation.id} onChanged={scheduleRefresh} onDeleted={removeFact} />
        <Insights widgets={widgets} facts={facts} />
      </div>

      {deleted && (
        <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-ink px-4 py-2 text-sm text-panel shadow-lg">
          <span>Removed “{deleted.detail.slice(0, 40)}”</span>
          <button onClick={() => void undoDelete()} className="inline-flex items-center gap-1 font-medium text-teal-soft"><Undo2 size={13} /> Undo</button>
          <button onClick={() => setDeleted(null)} className="text-panel/70"><X size={13} /></button>
        </div>
      )}
    </div>
   </>
  )
}

function Accomplishments({ detail, onExit }: { detail: ConversationDetail; onExit: () => void }) {
  const done = useMemo(() => accomplishments(detail.facts), [detail.facts])
  return (
    <div className="rise mx-auto max-w-2xl">
      <div className="surface overflow-hidden rounded-[32px]">
       <div className="bg-gradient-to-br from-[#164b42] to-teal p-7 text-white sm:p-9">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><CheckCircle2 size={24}/></span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[.16em] text-white/65">Conversation saved</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">You moved care forward today.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/72">Review what was resolved and what still needs attention. These details remain editable in your care thread.</p>
       </div>
       <div className="p-7 sm:p-9">
        {done.objective && <p className="mt-2 text-muted">Current objective: <span className="font-medium text-ink">{done.objective}</span></p>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Group title="Resolved" items={done.resolved} tone="text-teal" />
          <Group title="Scheduled" items={done.scheduled} tone="text-plum" icon={<CalendarCheck size={14} />} />
          <Group title="Prepared" items={done.prepared} tone="text-amber" />
          <Group title="Still to do" items={done.stillToDo} tone="text-rose" open />
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <button onClick={onExit} className="rounded-full bg-teal px-5 py-2.5 text-sm font-medium text-panel transition hover:brightness-110">
            Back to today
          </button>
          <button onClick={() => document.querySelector('#saved-details')?.scrollIntoView({behavior:'smooth'})} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition hover:bg-line/50">
            Review source details
          </button>
        </div>
       </div>
      </div>
    </div>
  )
}

function Group({ title, items, tone, icon, open }: { title: string; items: string[]; tone: string; icon?: React.ReactNode; open?: boolean }) {
  if (!items.length) return null
  return (
    <section className="rounded-2xl bg-paper/70 p-4">
      <h2 className={`flex items-center gap-1.5 text-sm font-semibold ${tone}`}>{icon}{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 6).map((item, index) => (
          <li key={index} className="flex items-start gap-2 text-sm">
            <span className={tone}>{open ? '□' : '✓'}</span> <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const modeOptions: [Settings['preferences']['mode'], string][] = [
  ['get_things_done', 'Get things done'],
  ['just_listen', 'Just listen'],
  ['prepare_me', 'Prepare me'],
  ['caregiver', 'Caregiver'],
]
const toneOptions: [Settings['preferences']['tone'], string][] = [['warm', 'Warm'], ['calm', 'Calm'], ['direct', 'Direct']]
const lengthOptions: [Settings['preferences']['verbosity'], string][] = [['brief', 'Brief'], ['balanced', 'Balanced'], ['detailed', 'Detailed']]

function describe(patch: Partial<Settings['preferences']>): string {
  return Object.entries(patch).map(([key, value]) => `${key} is now ${value}`).join('; ')
}

function AdjustPanel({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings['preferences']>) => void }) {
  const rows: [string, [string, string][], string, 'mode' | 'tone' | 'verbosity'][] = [
    ['Mode', modeOptions as [string, string][], settings.preferences.mode, 'mode'],
    ['Tone', toneOptions as [string, string][], settings.preferences.tone, 'tone'],
    ['Length', lengthOptions as [string, string][], settings.preferences.verbosity, 'verbosity'],
  ]
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-paper p-3">
      {rows.map(([label, options, current, key]) => (
        <div key={label}>
          <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.map(([value, text]) => (
              <button
                key={value}
                onClick={() => onChange({ [key]: value } as Partial<Settings['preferences']>)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${current === value ? 'bg-ink text-panel' : 'border border-line hover:bg-line/50'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
