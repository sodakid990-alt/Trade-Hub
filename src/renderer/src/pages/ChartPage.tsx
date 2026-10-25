import { useEffect, useRef, useState } from 'react'

const INTERVALS = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '1D': 'D' }
type Interval = keyof typeof INTERVALS

/** TradingView's free Advanced Chart widget. CME data in the free widget is delayed. */
export function ChartPage() {
  const el = useRef<HTMLDivElement>(null)
  const [interval, setChartInterval] = useState<Interval>('5m')

  useEffect(() => {
    const host = el.current!
    host.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>'
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: 'CME_MINI:MNQ1!',
      interval: INTERVALS[interval],
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      autosize: true,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      details: true,
      studies: ['STD;VWAP'],
      backgroundColor: '#0e1117'
    })
    host.appendChild(script)
    return () => {
      host.innerHTML = ''
    }
  }, [interval])

  return (
    <div className="chart-page">
      <header className="toolbar">
        <strong>MNQ</strong>
        <span className="muted">TradingView (delayed)</span>
        <div className="spacer" />
        {(Object.keys(INTERVALS) as Interval[]).map((i) => (
          <button key={i} className={i === interval ? 'active' : ''} onClick={() => setChartInterval(i)}>
            {i}
          </button>
        ))}
      </header>
      <div ref={el} className="tradingview-widget-container chart" />
    </div>
  )
}
