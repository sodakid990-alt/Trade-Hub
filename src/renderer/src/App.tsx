import { useState } from 'react'
import { ChartPage } from './pages/ChartPage'
import { JournalPage } from './pages/JournalPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { AlertsPage } from './pages/AlertsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AccountsPage } from './pages/AccountsPage'
import { useAutoSync } from './components/useAutoSync'
import { useQuote } from './components/useQuote'
import { Icon, type IconName } from './components/Icon'

const PAGES = {
  Chart: { icon: 'chart', Page: ChartPage },
  Journal: { icon: 'journal', Page: JournalPage },
  Analysis: { icon: 'analysis', Page: AnalysisPage },
  Accounts: { icon: 'accounts', Page: AccountsPage },
  Alerts: { icon: 'alerts', Page: AlertsPage },
  Settings: { icon: 'settings', Page: SettingsPage }
} satisfies Record<string, { icon: IconName; Page: () => React.ReactNode }>
type PageName = keyof typeof PAGES

export function App() {
  const [page, setPage] = useState<PageName>('Chart')
  const status = useAutoSync()
  const { quote, error } = useQuote()
  const { Page } = PAGES[page]
  const syncState = status.startsWith('Synced') ? 'ok' : status.startsWith('Sync error') ? 'error' : 'idle'
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="logo">TH</div>
          <div>
            <div className="brand-name">Trading Hub</div>
            <div className="brand-sub">MNQ</div>
          </div>
        </div>
        <div className="nav">
          {(Object.keys(PAGES) as PageName[]).map((p) => (
            <button key={p} className={`nav-item ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
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
        <div className={`sync-pill ${syncState}`} title={status}>
          <span className="dot" />
          <span>{status}</span>
        </div>
      </nav>
      <main className="content">
        {/* The chart stays mounted so TradingView doesn't reload on every tab switch. */}
        <div className="page-host" hidden={page !== 'Chart'}>
          <ChartPage />
        </div>
        {page !== 'Chart' && <Page />}
      </main>
    </div>
  )
}
