import { useEffect, useMemo, useRef } from 'react'
import { createChart, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { breakdown, byHour, bySetup, byWeekday, dailyPnl, equityCurve, summarize } from '../lib/analytics'
import type { Trade } from '../lib/types'
import { pct, pnlClass, usd } from '../components/format'

export function AnalysisPage() {
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), []) ?? []
  const s = useMemo(() => summarize(trades), [trades])
  const stats: [string, string, number?][] = [
    ['Net P&L', usd(s.netPnl), s.netPnl],
    ['Trades', String(s.trades)],
    ['Win rate', pct(s.winRate)],
    ['Profit factor', Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'],
    ['Expectancy', usd(s.expectancy), s.expectancy],
    ['Avg R', s.avgR === undefined ? 'n/a' : s.avgR.toFixed(2) + 'R'],
    ['Avg win', usd(s.avgWin), 1],
    ['Avg loss', usd(s.avgLoss), -1],
    ['Max drawdown', usd(-s.maxDrawdown), -s.maxDrawdown]
  ]
  return (
    <div className="page">
      <header className="page-header"><div><h1>Analysis</h1><p className="muted">Performance across {s.trades} trades</p></div></header>
      <div className="stats">
        {stats.map(([label, value, sign]) => (
          <div key={label} className="card stat">
            <div className="muted">{label}</div>
            <div className={`value ${sign === undefined ? '' : pnlClass(sign)}`}>{value}</div>
          </div>
        ))}
      </div>
      <EquityCurve trades={trades} />
      <Calendar trades={trades} />
      <div className="grid3">
        <Breakdown title="By setup" trades={trades} keyFn={bySetup} />
        <Breakdown title="By hour (ET)" trades={trades} keyFn={byHour} />
        <Breakdown title="By weekday" trades={trades} keyFn={byWeekday} strip />
      </div>
    </div>
  )
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const chart = createChart(el.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#8b949e' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#1c2230' } }
    })
    const line = chart.addSeries(LineSeries, { color: '#58a6ff', lineWidth: 2 })
    // One point per second at most; lightweight-charts needs strictly increasing times.
    const seen = new Map<number, number>()
    for (const p of equityCurve(trades)) seen.set(Math.floor(Date.parse(p.time) / 1000), p.equity)
    line.setData([...seen].map(([time, value]) => ({ time: time as UTCTimestamp, value })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [trades])
  return <div className="card"><h3>Equity curve</h3><div ref={el} className="equity" /></div>
}

function Calendar({ trades }: { trades: Trade[] }) {
  const days = [...dailyPnl(trades)].sort(([a], [b]) => b.localeCompare(a)).slice(0, 42)
  return (
    <div className="card">
      <h3>Daily P&L</h3>
      <div className="calendar">
        {days.map(([day, pnl]) => (
          <div key={day} className={`day ${pnlClass(pnl)}`}>
            <div className="muted">{day.slice(5)}</div>
            <div>{usd(pnl)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Breakdown({ title, trades, keyFn, strip }: { title: string; trades: Trade[]; keyFn: (t: Trade) => string; strip?: boolean }) {
  const rows = breakdown(trades, keyFn)
  return (
    <div className="card">
      <h3>{title}</h3>
      <table>
        <thead><tr><th /><th>Trades</th><th>Win%</th><th>P&L</th></tr></thead>
        <tbody>
          {rows.map(({ key, summary }) => (
            <tr key={key}>
              <td>{strip ? key.slice(2) : key}</td>
              <td>{summary.trades}</td>
              <td>{pct(summary.winRate)}</td>
              <td className={pnlClass(summary.netPnl)}>{usd(summary.netPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
