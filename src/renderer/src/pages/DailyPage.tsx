import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveDay, stamp } from '../lib/db'
import { byDay, netPnl, summarize, todayKey } from '../lib/analytics'
import type { DayNote } from '../lib/types'
import { pct, pnlClass, usd } from '../components/format'
import { useNav } from '../components/app'

const GRADES: NonNullable<DayNote['grade']>[] = ['A', 'B', 'C', 'D', 'F']
const label = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

export function DailyPage() {
  const { intent, clearIntent } = useNav()
  const [date, setDate] = useState(todayKey())
  useEffect(() => {
    if (intent === 'today') {
      setDate(todayKey())
      clearIntent()
    }
  }, [intent, clearIntent])

  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), []) ?? []
  const notes = useLiveQuery(() => db.days.filter((d) => !d.deleted).toArray(), []) ?? []
  const days = [...new Set([todayKey(), ...trades.map(byDay), ...notes.map((n) => n.id)])].sort().reverse().slice(0, 60)

  return (
    <div className="page daily">
      <header className="page-header">
        <div>
          <h1>Daily</h1>
          <p className="muted">Plan before the open, review after the close.</p>
        </div>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </header>
      <div className="daily-layout">
        <aside className="card flush day-list">
          {days.map((d) => {
            const dayTrades = trades.filter((t) => byDay(t) === d)
            const pnl = dayTrades.reduce((s, t) => s + netPnl(t), 0)
            const note = notes.find((n) => n.id === d)
            return (
              <button key={d} className={`day-item ${d === date ? 'active' : ''}`} onClick={() => setDate(d)}>
                <span>{d === todayKey() ? 'Today' : label(d)}</span>
                {note?.grade && <span className="grade">{note.grade}</span>}
                <span className="spacer" />
                {dayTrades.length > 0 && <span className={pnlClass(pnl)}>{usd(pnl)}</span>}
              </button>
            )
          })}
        </aside>
        <DayEditor key={date} date={date} />
      </div>
    </div>
  )
}

function DayEditor({ date }: { date: string }) {
  // null once loaded with nothing saved yet; undefined while loading.
  const stored = useLiveQuery(() => db.days.get(date).then((d) => d ?? null), [date])
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted && byDay(t) === date).toArray(), [date]) ?? []
  const [note, setNote] = useState<DayNote | null>(null)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (stored !== undefined) setNote((n) => n ?? stored ?? { id: date, updatedAt: stamp() })
  }, [stored, date])

  // Saves a moment after you stop typing.
  const update = (patch: Partial<DayNote>) => {
    const next = { ...note!, ...patch }
    setNote(next)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      await saveDay(next)
      setSaved(true)
    }, 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!note) return null
  const s = summarize(trades)
  const overMax = note.maxLoss && s.netPnl < -note.maxLoss
  return (
    <div className="day-editor">
      <div className="row">
        <h2>{date === todayKey() ? 'Today' : label(date)}</h2>
        <div className="spacer" />
        <span className="muted small">{saved ? 'Saved' : 'Saving…'}</span>
      </div>

      <div className="stats">
        <div className="card stat"><div className="muted">P&L</div><div className={`value ${pnlClass(s.netPnl)}`}>{usd(s.netPnl)}</div></div>
        <div className="card stat"><div className="muted">Trades</div><div className="value">{s.trades}</div></div>
        <div className="card stat"><div className="muted">Win rate</div><div className="value">{s.trades ? pct(s.winRate) : '—'}</div></div>
      </div>
      {overMax && <div className="notice error">You went past your planned max loss of {usd(note.maxLoss!)} on this day.</div>}

      <section className="card form">
        <h3 className="wide">Game plan</h3>
        <label>Bias
          <div className="segmented">
            {(['bullish', 'neutral', 'bearish'] as const).map((b) => (
              <button type="button" key={b} className={note.bias === b ? `active bias-${b}` : ''} onClick={() => update({ bias: note.bias === b ? undefined : b })}>{b}</button>
            ))}
          </div>
        </label>
        <label>Max loss today ($)
          <input type="number" min={0} value={note.maxLoss ?? ''} placeholder="e.g. 300" onChange={(e) => update({ maxLoss: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <label className="wide">Key levels
          <input value={note.levels ?? ''} placeholder="e.g. PDH 21,150 · ON low 21,020 · VWAP" onChange={(e) => update({ levels: e.target.value })} />
        </label>
        <label className="wide">Plan
          <textarea rows={3} value={note.plan ?? ''} placeholder="What am I looking for? What would make me sit out?" onChange={(e) => update({ plan: e.target.value })} />
        </label>
      </section>

      <section className="card form">
        <h3 className="wide">Review</h3>
        <label className="wide">How did I trade? (grade my execution, not the P&L)
          <div className="segmented">
            {GRADES.map((g) => (
              <button type="button" key={g} className={note.grade === g ? 'active' : ''} onClick={() => update({ grade: note.grade === g ? undefined : g })}>{g}</button>
            ))}
          </div>
        </label>
        <label className="wide">What went well
          <textarea rows={2} value={note.wentWell ?? ''} onChange={(e) => update({ wentWell: e.target.value })} />
        </label>
        <label className="wide">What to do better tomorrow
          <textarea rows={2} value={note.improve ?? ''} onChange={(e) => update({ improve: e.target.value })} />
        </label>
      </section>

      {trades.length > 0 && (
        <section className="card flush">
          <table>
            <tbody>
              {trades.sort((a, b) => a.exitTime.localeCompare(b.exitTime)).map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.exitTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                  <td><span className={`side ${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span> {t.qty} {t.symbol}</td>
                  <td className="muted">{t.setup}</td>
                  <td>{t.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</td>
                  <td className={`num ${pnlClass(netPnl(t))}`}><strong>{usd(netPnl(t))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
