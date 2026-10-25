import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { breakdown, byDay, byHour, bySetup, byWeekday, dailyPnl, equityCurve, summarize, todayKey } from '../lib/analytics'
import { usePrefs } from '../lib/prefs'
import type { Trade } from '../lib/types'
import { pct, pnlClass, usd } from '../components/format'

const RANGES = { '7D': 7, '30D': 30, '90D': 90, YTD: -1, All: 0 } as const
type Range = keyof typeof RANGES

function inRange(t: Trade, range: Range) {
  const days = RANGES[range]
  if (days === 0) return true
  if (days === -1) return byDay(t).slice(0, 4) === todayKey().slice(0, 4)
  return Date.now() - Date.parse(t.exitTime) <= days * 864e5
}

export function AnalysisPage() {
  const all = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), []) ?? []
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), []) ?? []
  const [range, setRange] = useState<Range>('30D')
  const [account, setAccount] = useState('')
  const [setup, setSetup] = useState('')
  const setups = [...new Set(all.map((t) => t.setup).filter((s): s is string => !!s))].sort()

  const trades = useMemo(
    () => all.filter((t) => inRange(t, range) && (!account || t.accountId === account) && (!setup || t.setup === setup)),
    [all, range, account, setup]
  )
  const s = useMemo(() => summarize(trades), [trades])
  const stats: [string, string, string, number?][] = [
    ['Net P&L', usd(s.netPnl), 'After fees', s.netPnl],
    ['Win rate', pct(s.winRate), `${s.wins} wins, ${s.losses} losses`],
    ['Profit factor', Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞', 'Gross wins ÷ gross losses. Above 1.5 is solid.'],
    ['Expectancy', usd(s.expectancy), 'Average result per trade', s.expectancy],
    ['Avg win', usd(s.avgWin), 'Average winning trade', 1],
    ['Avg loss', usd(s.avgLoss), 'Average losing trade', -1],
    ['Avg R', s.avgR === undefined ? '—' : s.avgR.toFixed(2) + 'R', 'Needs a stop on the trade'],
    ['Max drawdown', usd(-s.maxDrawdown), 'Biggest drop from a peak', -s.maxDrawdown]
  ]
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Analysis</h1>
          <p className="muted">{s.trades} trades in view</p>
        </div>
        <div className="row gap">
          <div className="segmented">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button key={r} className={r === range ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.firm}</option>)}
          </select>
          <select value={setup} onChange={(e) => setSetup(e.target.value)}>
            <option value="">All setups</option>
            {setups.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </header>
      {trades.length === 0 ? (
        <div className="card empty">No trades in this view yet. Try a longer date range or clear the filters.</div>
      ) : (
        <>
          <div className="stats">
            {stats.map(([label, value, hint, sign]) => (
              <div key={label} className="card stat" title={hint}>
                <div className="muted">{label}</div>
                <div className={`value ${sign === undefined ? '' : pnlClass(sign)}`}>{value}</div>
                <div className="muted small">{hint}</div>
              </div>
            ))}
          </div>
          <EquityCurve trades={trades} />
          <Calendar trades={trades} />
          <div className="grid3">
            <Breakdown title="By setup" trades={trades} keyFn={bySetup} />
            <Breakdown title="By hour (New York time)" trades={trades} keyFn={byHour} />
            <Breakdown title="By weekday" trades={trades} keyFn={byWeekday} strip />
          </div>
          <TagCost trades={trades} />
        </>
      )}
    </div>
  )
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const el = useRef<HTMLDivElement>(null)
  const prefs = usePrefs()
  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    const chart = createChart(el.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css.getPropertyValue('--muted').trim() || '#8a93a6', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css.getPropertyValue('--border').trim() || '#232a37' } }
    })
    const line = chart.addSeries(LineSeries, { color: prefs.accent, lineWidth: 2 })
    // One point per second at most; lightweight-charts needs strictly increasing times.
    const seen = new Map<number, number>()
    for (const p of equityCurve(trades)) seen.set(Math.floor(Date.parse(p.time) / 1000), p.equity)
    line.setData([...seen].map(([time, value]) => ({ time: time as UTCTimestamp, value })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [trades, prefs.accent, prefs.theme])
  return <div className="card"><h3>Equity curve</h3><div ref={el} className="equity" /></div>
}

/** The last six weeks as a Monday-first calendar, colored by each day's P&L. */
function Calendar({ trades }: { trades: Trade[] }) {
  const pnl = dailyPnl(trades)
  const today = new Date(todayKey() + 'T12:00:00')
  const start = new Date(today)
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - 35)
  const cells: string[] = []
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) cells.push(d.toLocaleDateString('en-CA'))
  const max = Math.max(1, ...[...pnl.values()].map(Math.abs))
  return (
    <div className="card">
      <h3>Daily P&L</h3>
      <div className="calendar">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-head">{d}</div>)}
        {cells.map((day) => {
          const v = pnl.get(day)
          const intensity = v === undefined ? 0 : 0.12 + 0.45 * (Math.abs(v) / max)
          return (
            <div key={day} className={`day ${v === undefined ? 'empty-day' : pnlClass(v)}`} style={v === undefined ? undefined : { background: `color-mix(in srgb, var(${v >= 0 ? '--pos' : '--neg'}) ${Math.round(intensity * 100)}%, transparent)` }}>
              <div className="muted">{Number(day.slice(8))}</div>
              {v !== undefined && <div className="day-pnl">{usd(v)}</div>}
            </div>
          )
        })}
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
        <thead><tr><th /><th className="num">Trades</th><th className="num">Win%</th><th className="num">P&L</th></tr></thead>
        <tbody>
          {rows.map(({ key, summary }) => (
            <tr key={key}>
              <td>{strip ? key.slice(2) : key}</td>
              <td className="num">{summary.trades}</td>
              <td className="num">{pct(summary.winRate)}</td>
              <td className={`num ${pnlClass(summary.netPnl)}`}>{usd(summary.netPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What each tag is worth: mistakes like FOMO usually show up here as red. */
function TagCost({ trades }: { trades: Trade[] }) {
  const tags = [...new Set(trades.flatMap((t) => t.tags))]
  if (!tags.length) return null
  const rows = tags
    .map((tag) => ({ tag, s: summarize(trades.filter((t) => t.tags.includes(tag))) }))
    .sort((a, b) => a.s.netPnl - b.s.netPnl)
  const untagged = summarize(trades.filter((t) => !t.tags.length))
  return (
    <div className="card">
      <h3>Tags and mistakes</h3>
      <p className="muted small">Total P&L of trades with each tag, worst first. A red mistake tag is money you can win back by not doing it.</p>
      <table>
        <thead><tr><th>Tag</th><th className="num">Trades</th><th className="num">Win%</th><th className="num">Avg</th><th className="num">Total</th></tr></thead>
        <tbody>
          {rows.map(({ tag, s }) => (
            <tr key={tag}>
              <td><span className="tag">{tag}</span></td>
              <td className="num">{s.trades}</td>
              <td className="num">{pct(s.winRate)}</td>
              <td className={`num ${pnlClass(s.expectancy)}`}>{usd(s.expectancy)}</td>
              <td className={`num ${pnlClass(s.netPnl)}`}><strong>{usd(s.netPnl)}</strong></td>
            </tr>
          ))}
          {untagged.trades > 0 && (
            <tr>
              <td className="muted">No tag</td>
              <td className="num">{untagged.trades}</td>
              <td className="num">{pct(untagged.winRate)}</td>
              <td className={`num ${pnlClass(untagged.expectancy)}`}>{usd(untagged.expectancy)}</td>
              <td className={`num ${pnlClass(untagged.netPnl)}`}>{usd(untagged.netPnl)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
