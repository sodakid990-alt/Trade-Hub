import { useRef } from 'react'
import { Icon } from '../components/Icon'

const CHART_URL = 'https://www.tradingview.com/chart/?symbol=CME_MINI%3AMNQ1%21'

type WebviewElement = HTMLElement & { reload(): void; loadURL(url: string): Promise<void> }

/**
 * The full TradingView site in an embedded browser. Signing in uses the user's
 * own TradingView account, so their data subscriptions, layouts, indicators and
 * alerts carry over. The session persists between launches.
 */
export function ChartPage() {
  const view = useRef<WebviewElement>(null)

  const signIn = async () => {
    await window.hub?.tradingViewLogin()
    view.current?.loadURL(CHART_URL)
  }

  return (
    <div className="chart-page">
      <header className="chart-bar">
        <div className="title">
          <strong>MNQ</strong>
          <span className="muted">Micro E-mini Nasdaq-100 · TradingView</span>
        </div>
        <div className="spacer" />
        <button className="ghost" onClick={() => view.current?.reload()} title="Reload chart">
          <Icon name="refresh" size={16} /> Reload
        </button>
        <button className="ghost" onClick={signIn} title="Sign in with Google, Apple or email">
          <Icon name="login" size={16} /> Sign in to TradingView
        </button>
      </header>
      <webview ref={view as React.Ref<never>} className="webview" src={CHART_URL} partition="persist:tradingview" />
    </div>
  )
}
