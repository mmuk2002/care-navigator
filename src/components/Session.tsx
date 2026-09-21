import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, PhoneOff, Target } from 'lucide-react'
import type { ConversationDetail, Settings } from '../../shared/types.js'
import { careGoal, nextStep } from '../../shared/cockpit.js'
import { api } from '../api'
import { useVoice } from '../useVoice'
import { VoicePanel } from './VoicePanel'
import { Cockpit } from './Cockpit'
import { Insights } from './Insights'
import { Transcript } from './Transcript'

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
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => void onRefresh(), 250)
  }, [onRefresh])

  useEffect(() => {
    const source = new EventSource(`/api/conversations/${conversation.id}/events`)
    source.onmessage = () => scheduleRefresh()
    return () => { source.close(); if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, [conversation.id, scheduleRefresh])

  const voice = useVoice(conversation.id, scheduleRefresh)
  const live = voice.status === 'listening' || voice.status === 'speaking' || voice.status === 'connecting'

  const goal = useMemo(() => careGoal(facts), [facts])
  const step = useMemo(() => nextStep(facts), [facts])
  const patient = conversation.settings.context

  const changeGoal = async () => {
    const text = goalDraft.trim()
    if (!text) return setEditingGoal(false)
    await api.sendTurn(conversation.id, `My goal is: ${text}`)
    setGoalDraft(''); setEditingGoal(false); scheduleRefresh()
  }

  const adjust = async (patch: Partial<Settings['preferences']>) => {
    const settings = { ...conversation.settings, preferences: { ...conversation.settings.preferences, ...patch } }
    await api.saveSettings(settings)
    voice.steer(`Adjustment for the rest of this conversation: ${describe(patch)} Apply it from now on.`)
    await onRefresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-line bg-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                {patient.subject === 'other' ? `Navigating for ${patient.patient_name || 'a relative'}` : 'Navigating for yourself'}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{patient.speaker_name || 'This conversation'}</h2>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${live ? 'bg-teal-soft text-teal' : 'bg-line/70 text-muted'}`}>
              {conversation.status}
            </span>
          </div>
          <VoicePanel voice={voice} disabled={conversation.status === 'ended'} />
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setAdjusting(value => !value)}
              className="flex-1 rounded-full border border-line px-3 py-2 text-xs font-medium transition hover:bg-line/50"
            >
              {adjusting ? 'Done adjusting' : 'Adjust the navigator'}
            </button>
            <button onClick={onExit} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium transition hover:bg-line/50">
              <LogOut size={13} /> Home
            </button>
          </div>
          {adjusting && <AdjustPanel settings={conversation.settings} onChange={adjust} />}
        </div>

        {conversation.status !== 'ended' && (
          <button
            onClick={() => { voice.stop(); void onEnd() }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-rose/40 bg-rose-soft px-4 py-3 text-sm font-medium text-rose transition hover:brightness-95"
          >
            <PhoneOff size={16} /> End and summarize
          </button>
        )}
      </div>

      <div className="space-y-5">
        <section className="rounded-3xl border border-line bg-panel p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-soft text-teal"><Target size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Goal anchor</p>
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

        <Cockpit facts={facts} conversationId={conversation.id} onChanged={scheduleRefresh} />
        <Insights widgets={widgets} facts={facts} />
        <Transcript turns={turns} />
      </div>
    </div>
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
  const rows: [string, [string, string][], string][] = [
    ['Mode', modeOptions as [string, string][], settings.preferences.mode],
    ['Tone', toneOptions as [string, string][], settings.preferences.tone],
    ['Length', lengthOptions as [string, string][], settings.preferences.verbosity],
  ]
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-paper p-3">
      {rows.map(([label, options, current]) => (
        <div key={label}>
          <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.map(([value, text]) => (
              <button
                key={value}
                onClick={() => onChange({ [label === 'Mode' ? 'mode' : label === 'Tone' ? 'tone' : 'verbosity']: value } as Partial<Settings['preferences']>)}
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
