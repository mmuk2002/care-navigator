import { useState } from 'react'
import { Check, HeartHandshake, MessageCircle, SlidersHorizontal, UserRound } from 'lucide-react'
import type { CareContext, Settings } from '../../shared/types.js'
import { voiceOptions } from '../../shared/settings.js'
import { api } from '../api'

const modes: [Settings['preferences']['mode'], string][] = [
  ['get_things_done', 'Get things done'], ['just_listen', 'Just listen'], ['prepare_me', 'Prepare me'], ['caregiver', 'Caregiver'],
]
const tones: [Settings['preferences']['tone'], string][] = [['warm', 'Warm'], ['calm', 'Calm'], ['direct', 'Direct']]
const verbosities: [Settings['preferences']['verbosity'], string][] = [['brief', 'Brief'], ['balanced', 'Balanced'], ['detailed', 'Detailed']]
const paces: [Settings['preferences']['pace'], string][] = [['unhurried', 'Unhurried'], ['balanced', 'Balanced']]

export function SettingsPanel({ settings, onSave, onProfile }: {
  settings: Settings
  onSave: (settings: Settings) => Promise<void>
  onProfile: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [saved, setSaved] = useState(false)

  const setContext = (patch: Partial<CareContext>) => setDraft(current => ({ ...current, context: { ...current.context, ...patch } }))
  const setPreference = <K extends keyof Settings['preferences']>(key: K, value: Settings['preferences'][K]) =>
    setDraft(current => ({ ...current, preferences: { ...current.preferences, [key]: value } }))

  const save = async () => {
    await api.saveContext(draft.context)
    await onSave(draft)
    await onProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <section className="rise mx-auto max-w-5xl space-y-6">
      <div>
        <p className="eyebrow text-teal">Make it yours</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Make Harbor feel like yours</h1>
        <p className="mt-1 text-sm text-muted">Who this is for, and how the navigator should talk with you.</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
       <aside className="surface overflow-hidden rounded-[28px] lg:sticky lg:top-24">
        <div className="bg-gradient-to-br from-[#194a42] to-teal p-6 text-white"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><HeartHandshake size={21}/></span><p className="mt-5 text-xs font-semibold uppercase tracking-[.14em] text-white/60">Live preview</p><h2 className="mt-2 text-xl font-semibold">Hi{draft.context.speaker_name?`, ${draft.context.speaker_name}`:''}.</h2><p className="mt-2 text-sm leading-relaxed text-white/72">I’ll speak in a {draft.preferences.tone}, {draft.preferences.pace} way and keep my answers {draft.preferences.verbosity}.</p></div>
        <div className="space-y-3 p-5 text-xs text-muted"><p className="flex items-center gap-2"><UserRound size={14} className="text-plum"/>{draft.context.subject==='self'?'Navigating for you':`Navigating for ${draft.context.patient_name||'someone you care for'}`}</p><p className="flex items-center gap-2"><MessageCircle size={14} className="text-teal"/>{draft.preferences.language} · {draft.voice}</p><p className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-amber"/>{modes.find(([value])=>value===draft.preferences.mode)?.[1]}</p></div>
       </aside>
       <div className="space-y-5">
      <div className="surface rounded-[28px] p-5 sm:p-6">
        <h2 className="text-sm font-semibold">Who are we navigating for?</h2>
        <div className="mt-3 flex gap-2">
          {([['self', 'Myself'], ['other', 'Someone I care for']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setContext({ subject: value })}
              className={`rounded-full px-4 py-2 text-sm transition ${draft.context.subject === value ? 'bg-ink text-panel' : 'border border-line hover:bg-line/50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Your name" value={draft.context.speaker_name} onChange={value => setContext({ speaker_name: value })} placeholder="Alex" />
          {draft.context.subject === 'other' && (
            <>
              <Field label="Their name" value={draft.context.patient_name} onChange={value => setContext({ patient_name: value })} placeholder="Ruth" />
              <Field label="Your relationship" value={draft.context.relationship} onChange={value => setContext({ relationship: value })} placeholder="daughter" />
            </>
          )}
        </div>
      </div>

      <div className="surface rounded-[28px] p-5 sm:p-6">
        <h2 className="text-sm font-semibold">How should Harbor talk with you?</h2>
        <Choice label="Mode" options={modes} value={draft.preferences.mode} onChange={value => setPreference('mode', value)} />
        <Choice label="Tone" options={tones} value={draft.preferences.tone} onChange={value => setPreference('tone', value)} />
        <Choice label="Answer length" options={verbosities} value={draft.preferences.verbosity} onChange={value => setPreference('verbosity', value)} />
        <Choice label="Pace" options={paces} value={draft.preferences.pace} onChange={value => setPreference('pace', value)} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Navigator name" value={draft.preferences.agentName} onChange={value => setPreference('agentName', value)} placeholder="Harbor" />
          <Field label="Language" value={draft.preferences.language} onChange={value => setPreference('language', value)} placeholder="English" />
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Voice</span>
            <select
              value={draft.voice}
              onChange={event => setDraft(current => ({ ...current, voice: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            >
              {voiceOptions.map(voice => <option key={voice} value={voice}>{voice}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Toggle label="Live captions" checked={draft.preferences.captions} onChange={value => setPreference('captions', value)} />
          <Toggle label="Larger text" checked={draft.preferences.largeText} onChange={value => setPreference('largeText', value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void save()} className="inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2.5 text-sm font-medium text-panel transition hover:brightness-110">
          {saved ? <><Check size={16} /> Saved</> : 'Save settings'}
        </button>
        <p className="text-xs text-muted">Changing mode or tone mid-conversation applies to the rest of the call.</p>
      </div>
       </div>
      </div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
      />
    </label>
  )
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="mt-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(([option, text]) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${value === option ? 'bg-ink text-panel' : 'border border-line hover:bg-line/50'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-teal" />
      {label}
    </label>
  )
}
