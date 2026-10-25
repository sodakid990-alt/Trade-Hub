const CHART_URL = 'https://www.tradingview.com/chart/?symbol=CME_MINI%3AMNQ1%21'

/**
 * The full TradingView site in an embedded browser. Signing in here uses the
 * user's own TradingView account, so their data subscriptions, layouts,
 * indicators and alerts all carry over. The session persists between launches.
 */
export function ChartPage() {
  return (
    <div className="chart-page">
      <webview className="webview" src={CHART_URL} partition="persist:tradingview" />
    </div>
  )
}
