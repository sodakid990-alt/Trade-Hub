import { useEffect, useMemo, useState } from 'react'
import { ChartPage } from './pages/ChartPage'
import { HomePage } from './pages/HomePage'
import { JournalPage } from './pages/JournalPage'
import { DailyPage } from './pages/DailyPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { PlaybookPage } from './pages/PlaybookPage'
import { AlertsPage } from './pages/AlertsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AccountsPage } from './pages/AccountsPage'
import { useAutoSync } from './components/useAutoSync'
import { useQuote } from './components/useQuote'
import { useTradovateSync } from './components/useTradovateSync'
import { useGuardrailAlerts } from './components/useGuardrailAlerts'
import { Icon, type IconName } from './components/Icon'
import { NavContext, ToastProvider, type Intent } from './components/app'
import { PAGE_NAMES, usePrefs } from './lib/prefs'
import type { PageName } from './lib/types'

const PAGES: Record<PageName, { icon: IconName; Page: () => React.ReactNode; hint: string }> = {
  Home: { icon: 'home', Page: HomePage, hint: 'Today at a glance' },
  Chart: { icon: 'chart', Page: ChartPage, hint: 'TradingView chart' },
  Journal: { icon: 'journal', Page: JournalPage, hint: 'Every trade you take' },
  Daily: { icon: 'calendar', Page: DailyPage, hint: 'Pre-market plan and end-of-day review' },
  Analysis: { icon: 'analysis', Page: AnalysisPage, hint: 'Your stats and patterns' },
  Playbook: { icon: 'book', Page: PlaybookPage, hint: 'Your setups and their rules' },
  Accounts: { icon: 'accounts', Page: AccountsPage, hint: 'Prop firm evals and funded accounts' },
  Alerts: { icon: 'alerts', Page: AlertsPage, hint: 'Price alerts' },
  Settings: { icon: 'settings', Page: SettingsPage, hint: 'Make the app yours' }
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell() {
  const prefs = usePrefs()
  const [page, setPage] = useState<PageName | null>(null)
  const [intent, setIntent] = useState<Intent>(null)
  const status = useAutoSync()
  const { quote, error } = useQuote()
  const brokerStatus = useTradovateSync()
  useGuardrailAlerts()

  const current = page ?? prefs.startPage
  const visible = PAGE_NAMES.filter((p) => p === 'Settings' || !prefs.hiddenPages.includes(p))
  const nav = useMemo(
    () => ({ page: current, go: (p: PageName, i: Intent = null) => { setPage(p); setIntent(i) }, intent, clearIntent: () => setIntent(null) }),
    [current, intent]
  )

  // Theme, accent and density apply to the whole window.
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      root.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    root.style.setProperty('--accent', prefs.accent)
    root.dataset.density = prefs.compact ? 'compact' : 'comfortable'
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs.theme, prefs.accent, prefs.compact])

  // Ctrl/⌘ + 1-9 jumps between pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= visible.length) {
        e.preventDefault()
        nav.go(visible[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, nav])

  const { Page } = PAGES[current]
  const syncState = status.startsWith('Synced') ? 'ok' : status.startsWith('Sync error') ? 'error' : 'idle'
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <nav className="sidebar">
          <div className="brand">
            <div className="logo">TH</div>
            <div>
              <div className="brand-name">Trading Hub</div>
              <div className="brand-sub">{prefs.defaultSymbol}</div>
            </div>
          </div>
          <div className="nav">
            {visible.map((p, i) => (
              <button key={p} className={`nav-item ${p === current ? 'active' : ''}`} onClick={() => nav.go(p)} title={`${PAGES[p].hint} (${mod}${i + 1})`}>
                <Icon name={PAGES[p].icon} />
                <span>{p}</span>
              </button>
            ))}
          </div>
          <div className="quote-card">
            <div className="eyebrow">MNQ · delayed</div>
            <div className="quote-price">{quote ? quote.price.toFixed(2) : '—'}</div>
            {error && <div className="small muted">{error}</div>}
          </div>
          {brokerStatus && (
            <div className={`sync-pill ${/failed|not |error/i.test(brokerStatus) ? 'error' : 'ok'}`} title={brokerStatus}>
              <span className="dot" />
              <span>{brokerStatus}</span>
            </div>
          )}
          <button className={`sync-pill as-button ${syncState}`} title={status} onClick={() => nav.go('Settings')}>
            <span className="dot" />
            <span>{status}</span>
          </button>
        </nav>
        <main className="content">
          {/* The chart stays mounted so TradingView doesn't reload on every page switch. */}
          {visible.includes('Chart') && (
            <div className="page-host" hidden={current !== 'Chart'}>
              <ChartPage />
            </div>
          )}
          {current !== 'Chart' && <Page key={current} />}
        </main>
      </div>
    </NavContext.Provider>
  )
}
