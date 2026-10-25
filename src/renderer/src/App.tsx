import { useState } from 'react'
import { ChartPage } from './pages/ChartPage'
import { JournalPage } from './pages/JournalPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { AlertsPage } from './pages/AlertsPage'
import { SyncPage } from './pages/SyncPage'
import { AccountsPage } from './pages/AccountsPage'
import { useAutoSync } from './components/useAutoSync'
import { useQuote } from './components/useQuote'

const PAGES = { Chart: ChartPage, Journal: JournalPage, Analysis: AnalysisPage, Accounts: AccountsPage, Alerts: AlertsPage, Sync: SyncPage }
type PageName = keyof typeof PAGES

export function App() {
  const [page, setPage] = useState<PageName>('Chart')
  const status = useAutoSync()
  const { quote, error } = useQuote()
  const Page = PAGES[page]
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">Trading Hub</div>
        {(Object.keys(PAGES) as PageName[]).map((p) => (
          <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
            {p}
          </button>
        ))}
        <div className="quote">
          <div className="muted">MNQ (delayed)</div>
          <div className="price">{quote ? quote.price.toFixed(2) : error ? '—' : '…'}</div>
          {error && <div className="muted small">{error}</div>}
        </div>
        <div className="sync-status">{status}</div>
      </nav>
      <main className="content">
        <Page />
      </main>
    </div>
  )
}
