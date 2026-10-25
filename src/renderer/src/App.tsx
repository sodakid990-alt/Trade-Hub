import { useState } from 'react'
import { ChartPage } from './pages/ChartPage'
import { JournalPage } from './pages/JournalPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { AlertsPage } from './pages/AlertsPage'
import { SyncPage } from './pages/SyncPage'
import { useAutoSync } from './components/useAutoSync'

const PAGES = { Chart: ChartPage, Journal: JournalPage, Analysis: AnalysisPage, Alerts: AlertsPage, Sync: SyncPage }
type PageName = keyof typeof PAGES

export function App() {
  const [page, setPage] = useState<PageName>('Chart')
  const status = useAutoSync()
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
        <div className="sync-status">{status}</div>
      </nav>
      <main className="content">
        <Page />
      </main>
    </div>
  )
}
