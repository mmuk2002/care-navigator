import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, HeartHandshake, LayoutGrid, MessageSquareText, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import type { ConversationDetail, Settings } from '../shared/types.js'
import { api, type Bootstrap } from './api'
import { Home } from './components/Home'
import { Session } from './components/Session'
import { Conversations } from './components/Conversations'
import { SettingsPanel } from './components/SettingsPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { CareViews } from './components/CareViews'

type View = 'home' | 'session' | 'conversations' | 'settings' | 'memory' | 'tasks' | 'timeline' | 'plan'

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [view, setView] = useState<View>('home')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sourceTurn, setSourceTurn] = useState<string | null>(null)
  const detailRef = useRef<ConversationDetail | null>(null)
  const refreshSequence = useRef(0)
  detailRef.current = detail

  useEffect(() => {
    api.bootstrap().then(setBoot).catch(() => setError('Could not reach the server. Is it running?'))
  }, [])

  // Use a functional update: this runs right after a settings save, and spreading
  // a captured `boot` would write back the pre-save settings.
  const refreshProfile = useCallback(async () => {
    const profile = await api.profile()
    setBoot(current => (current ? { ...current, profile } : current))
  }, [])

  const start = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const created = await api.createConversation()
      setDetail(created)
      setSourceTurn(null)
      setView('session')
    } catch { setError('Could not start a conversation.') } finally { setBusy(false) }
  }, [])

  // `turnId` jumps straight to the line a fact came from, instead of the top of the thread.
  const open = useCallback(async (id: string, turnId?: string) => {
    setBusy(true); setError('')
    try {
      setDetail(await api.conversation(id))
      setSourceTurn(turnId || null)
      setView('session')
    } catch { setError('Could not open that conversation.') } finally { setBusy(false) }
  }, [])

  const refresh = useCallback(async () => {
    const id = detailRef.current?.conversation.id
    if (!id) return
    const sequence = ++refreshSequence.current
    try {
      const next = await api.conversation(id)
      // Rapid SSE events can overlap. Never let an older response overwrite a
      // newer transcript, or update a conversation the user has since left.
      if (sequence === refreshSequence.current && detailRef.current?.conversation.id === id) setDetail(next)
    } catch { /* keep last view */ }
  }, [])

  const saveSettings = useCallback(async (settings: Settings) => {
    const saved = await api.saveSettings(settings)
    setBoot(current => (current ? { ...current, settings: saved } : current))
    setDetail(current => (current ? { ...current, conversation: { ...current.conversation, settings: saved } } : current))
  }, [])

  const end = useCallback(async () => {
    if (!detail) return
    const ended = await api.endConversation(detail.conversation.id)
    setDetail(ended)
    void refreshProfile()
  }, [detail, refreshProfile])

  if (error && !boot) return <Splash message={error} />
  if (!boot) return <Splash message="Warming up…" />

  const large = boot.settings.preferences.largeText

  return (
    <div className={`app-shell ${large ? 'large-text' : ''}`}>
      <header className="app-header">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-7">
          <button onClick={() => setView('home')} className="flex items-center gap-3 text-left">
            <span className="brand-mark"><HeartHandshake size={20} strokeWidth={1.8} /></span>
            <span>
              <span className="block text-[15px] font-bold tracking-tight">Harbor</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-muted">Care navigator</span>
            </span>
          </button>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-line/80 bg-white/55 px-3 py-1.5 text-xs text-muted lg:flex">
            <ShieldCheck size={14} className="text-teal" /> Your details stay reviewable
          </div>
          <nav className="ml-auto flex items-center gap-1 lg:ml-2" aria-label="Main navigation">
            <button onClick={() => setView('home')} className={tab(view === 'home')}>
              <span className="hidden lg:inline">Today</span>
            </button>
            <button onClick={() => setView('memory')} className={tab(view === 'memory')}>
              <HeartHandshake size={16} /> <span className="hidden lg:inline">My care</span>
            </button>
            <button onClick={() => setView('tasks')} className={tab(view === 'tasks')}>
              <CheckCircle2 size={16} /> <span className="hidden lg:inline">Tasks</span>
            </button>
            <button onClick={() => setView('timeline')} className={tab(view === 'timeline')}>
              <CalendarDays size={16} /> <span className="hidden lg:inline">Timeline</span>
            </button>
            <button onClick={() => setView('plan')} className={tab(view === 'plan')}>
              <LayoutGrid size={16} /> <span className="hidden lg:inline">Plan</span>
            </button>
            <button onClick={() => setView('conversations')} className={tab(view === 'conversations')}>
              <MessageSquareText size={16} /> <span className="hidden sm:inline">Conversations</span>
            </button>
            <button onClick={() => setView('settings')} className={tab(view === 'settings')}>
              <SettingsIcon size={16} /> <span className="hidden sm:inline">Settings</span>
            </button>
          </nav>
        </div>
      </header>

      {error && <p className="mx-auto max-w-6xl px-5 pt-4 text-sm text-rose">{error}</p>}

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
        {view === 'home' && (
          <Home boot={boot} busy={busy} onStart={start} onOpen={open} onSettings={() => setView('settings')} />
        )}
        {view === 'conversations' && (
          <Conversations onOpen={open} onStart={start} busy={busy} />
        )}
        {view === 'memory' && (
          <MemoryPanel onChanged={refreshProfile} onOpen={open} />
        )}
        {view === 'settings' && (
          <SettingsPanel settings={boot.settings} onSave={saveSettings} onProfile={refreshProfile} />
        )}
        {(view === 'tasks' || view === 'timeline' || view === 'plan') && (
          <CareViews view={view} profile={boot.profile} onChanged={refreshProfile} onOpen={open} />
        )}
        {view === 'session' && detail && (
          <Session detail={detail} highlightTurnId={sourceTurn} onRefresh={refresh} onEnd={end} onExit={() => { setView('home'); void refreshProfile() }} />
        )}
      </main>
    </div>
  )
}

const tab = (active: boolean) =>
  `nav-pill ${active ? 'active' : ''}`

function Splash({ message }: { message: string }) {
  return (
    <div className="grid min-h-full place-items-center">
      <div className="text-center">
        <div className="ring-pulse relative mx-auto mb-4 h-14 w-14 rounded-full bg-teal-soft" />
        <p className="text-sm text-muted">{message}</p>
      </div>
    </div>
  )
}
