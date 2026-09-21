import { ArrowRight, CircleDot, Mic, Sparkles } from 'lucide-react'
import type { Bootstrap } from '../api'
import { widgetLabel, widgetTint } from '../widgets'

export function Home({ boot, busy, onStart, onOpen, onSettings }: {
  boot: Bootstrap
  busy: boolean
  onStart: () => void
  onOpen: (id: string) => void
  onSettings: () => void
}) {
  const { profile, conversations, settings } = boot
  const patient = settings.context.subject === 'other' && settings.context.patient_name
    ? `for ${settings.context.patient_name}`
    : ''
  const highlights = profile.facts.slice(0, 6)

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rise">
        <p className="text-sm font-medium text-teal">Talk it through, out loud</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {settings.context.speaker_name ? `Hello, ${settings.context.speaker_name}. ` : 'Hello. '}
          Let&apos;s find the next step {patient || 'together'}.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Harbor is a non-clinical care navigator. Speak naturally about referrals, appointments, insurance,
          rides, or what to ask a doctor. Everything you say is written down, and the live views organize it as you go.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onStart}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-teal px-5 py-3 font-medium text-panel shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            <Mic size={18} /> Start a conversation
          </button>
          <button onClick={onSettings} className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-medium transition hover:bg-line/50">
            Set up who this is for
          </button>
        </div>

        <dl className="mt-8 grid grid-cols-3 gap-3">
          <Stat label="Conversations" value={String(profile.conversation_count)} />
          <Stat label="Saved details" value={String(profile.facts.length)} />
          <Stat label="Last activity" value={profile.last_activity ? new Date(profile.last_activity).toLocaleDateString() : '—'} />
        </dl>

        {conversations.length > 0 && (
          <div className="mt-9">
            <h2 className="text-sm font-semibold text-muted">Pick up where you left off</h2>
            <ul className="mt-3 space-y-2">
              {conversations.slice(0, 4).map(conversation => (
                <li key={conversation.id}>
                  <button
                    onClick={() => onOpen(conversation.id)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left transition hover:border-teal/40"
                  >
                    <CircleDot size={16} className="text-teal" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{conversation.title || 'Untitled conversation'}</span>
                      <span className="block text-xs text-muted">
                        {new Date(conversation.started_at).toLocaleString()} · {conversation.status}
                      </span>
                    </span>
                    <ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-teal" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="rise rounded-3xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber" />
          <h2 className="text-sm font-semibold">What Harbor already knows</h2>
        </div>
        <p className="mt-1 text-xs text-muted">Carried forward from earlier conversations, in your own words.</p>
        {highlights.length ? (
          <ul className="mt-4 space-y-2">
            {highlights.map(fact => (
              <li key={fact.id} className="rounded-2xl border border-line px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${widgetTint(fact.widget)}`}>
                  {widgetLabel(fact.widget)}
                </span>
                <p className="mt-1 text-sm">{fact.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Nothing yet. Start talking and details will appear here.
          </p>
        )}
      </aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-3 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  )
}
