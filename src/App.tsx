import { useCallback, useEffect, useState } from 'react'
import { HeartHandshake, MessageSquareText, Settings as SettingsIcon } from 'lucide-react'
import type { ConversationDetail, Settings } from '../shared/types.js'
import { api, type Bootstrap } from './api'
import { Home } from './components/Home'
import { Session } from './components/Session'
import { Conversations } from './components/Conversations'
import { SettingsPanel } from './components/SettingsPanel'

type View = 'home' | 'session' | 'conversations' | 'settings'

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [view, setView] = useState<View>('home')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.bootstrap().then(setBoot).catch(() => setError('Could not reach the server. Is it running?'))
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!boot) return
    const profile = await api.profile()
    setBoot({ ...boot, profile })
  }, [boot])

  const start = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const created = await api.createConversation()
      setDetail(created)
      setView('session')
    } catch { setError('Could not start a conversation.') } finally { setBusy(false) }
  }, [])

  const open = useCallback(async (id: string) => {
    setBusy(true); setError('')
    try {
      setDetail(await api.conversation(id))
      setView('session')
    } catch { setError('Could not open that conversation.') } finally { setBusy(false) }
  }, [])

  const refresh = useCallback(async () => {
    if (!detail) return
    try { setDetail(await api.conversation(detail.conversation.id)) } catch { /* keep last view */ }
  }, [detail])

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
    <div className={`min-h-full ${large ? 'large-text' : ''}`}>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <button onClick={() => setView('home')} className="flex items-center gap-2 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-teal text-panel"><HeartHandshake size={18} /></span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">Harbor</span>
              <span className="block text-xs text-muted">Care navigation</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('conversations')} className={tab(view === 'conversations')}>
              <MessageSquareText size={16} /> <span className="hidden sm:inline">Conversations</span>
            </button>
            <button onClick={() => setView('settings')} className={tab(view === 'settings')}>
              <SettingsIcon size={16} /> <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {error && <p className="mx-auto max-w-6xl px-5 pt-4 text-sm text-rose">{error}</p>}

      <main className="mx-auto max-w-6xl px-5 py-6">
        {view === 'home' && (
          <Home boot={boot} busy={busy} onStart={start} onOpen={open} onSettings={() => setView('settings')} />
        )}
        {view === 'conversations' && (
          <Conversations onOpen={open} onStart={start} busy={busy} />
        )}
        {view === 'settings' && (
          <SettingsPanel settings={boot.settings} onSave={saveSettings} onProfile={refreshProfile} />
        )}
        {view === 'session' && detail && (
          <Session detail={detail} onRefresh={refresh} onEnd={end} onExit={() => { setView('home'); void refreshProfile() }} />
        )}
      </main>
    </div>
  )
}

const tab = (active: boolean) =>
  `flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${active ? 'bg-ink text-panel' : 'text-muted hover:bg-line/60'}`

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
