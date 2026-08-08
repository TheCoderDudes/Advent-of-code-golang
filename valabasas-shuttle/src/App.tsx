import { useEffect, useRef, useState } from 'react'
import { Toasts } from './components/ui'
import { NowScreen } from './screens/NowScreen'
import { DayScreen } from './screens/DayScreen'
import { AccountsScreen } from './screens/AccountsScreen'
import { ImportScreen } from './screens/ImportScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useStore } from './state/store'

export type Tab = 'now' | 'day' | 'accounts' | 'import' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'day', label: 'Day' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'import', label: 'Import' },
  { id: 'settings', label: 'Settings' },
]

const TITLES: Record<Tab, string> = {
  now: 'Now',
  day: 'Day timeline',
  accounts: 'Appointments',
  import: 'Import & export',
  settings: 'Settings',
}

export default function App() {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<Tab>('now')
  const mainRef = useRef<HTMLElement>(null)

  // Each screen opens at the top. Without this, coming back to Now after
  // scrolling elsewhere drops you into the middle of the run card.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [tab])

  // First open with nothing loaded lands on Import, not an empty dashboard.
  useEffect(() => {
    if (!state.hasOnboarded && state.appointments.length === 0) {
      setTab('import')
      dispatch({ type: 'setOnboarded' })
    }
    // Intentionally only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <header className="safe-top safe-x sticky top-0 z-30 border-b border-ink-700 bg-ink-900/95 pb-3 backdrop-blur">
        <h1 className="text-2xl font-black tracking-tight">
          <span className="text-brand-500">Valabasas</span> {TITLES[tab]}
        </h1>
      </header>

      <main
        ref={mainRef}
        className="safe-x flex-1 overflow-y-auto pb-6 pt-4"
        data-testid={`screen-${tab}`}
      >
        {tab === 'now' ? <NowScreen onNavigate={setTab} /> : null}
        {tab === 'day' ? <DayScreen onNavigate={setTab} /> : null}
        {tab === 'accounts' ? <AccountsScreen onNavigate={setTab} /> : null}
        {tab === 'import' ? <ImportScreen onNavigate={setTab} /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </main>

      <Toasts
        notices={state.notices}
        onDismiss={(index) => dispatch({ type: 'dismissNotice', index })}
      />

      <nav className="safe-bottom safe-x sticky bottom-0 z-30 grid grid-cols-5 gap-1 border-t border-ink-700 bg-ink-900/95 pt-2 backdrop-blur">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
            className={`min-h-tap truncate rounded-2xl px-0 text-xs font-bold ${
              tab === id ? 'bg-ink-600 text-brand-400' : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
