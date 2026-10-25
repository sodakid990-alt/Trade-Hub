import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, createChart, createSeriesMarkers, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import { useLiveQuery } from 'dexie-react-hooks'
import { feed } from '../lib/marketData'
import { checkAlerts } from '../lib/alerts'
import { db } from '../lib/db'

const TIMEFRAMES = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }
type TF = keyof typeof TIMEFRAMES
const SYMBOL = 'MNQ'

export function ChartPage() {
  const el = useRef<HTMLDivElement>(null)
  const [tf, setTf] = useState<TF>('5m')
  const [last, setLast] = useState<number>()
  const alerts = useLiveQuery(() => db.alerts.filter((a) => a.active && !a.deleted).toArray(), [])
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), [])
  const chartRef = useRef<{ chart: IChartApi; series: ReturnType<IChartApi['addSeries']> }>(null)

  useEffect(() => {
    const chart = createChart(el.current!, {
      autoSize: true,
      layout: { background: { color: '#0e1117' }, textColor: '#c9d1d9' },
      grid: { vertLines: { color: '#1c2230' }, horzLines: { color: '#1c2230' } },
      timeScale: { timeVisible: true }
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false
    })
    chartRef.current = { chart, series }
    const sec = TIMEFRAMES[tf]
    let prev: number | undefined
    let unsub = () => {}
    feed.history(SYMBOL, sec, 300).then((bars) => {
      series.setData(bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })))
      unsub = feed.subscribe(SYMBOL, sec, (b) => {
        series.update({ ...b, time: b.time as UTCTimestamp })
        if (prev !== undefined) checkAlerts(SYMBOL, prev, b.close)
        prev = b.close
        setLast(b.close)
      })
    })
    return () => {
      unsub()
      chart.remove()
      chartRef.current = null
    }
  }, [tf])

  // Alert levels as horizontal lines.
  useEffect(() => {
    const s = chartRef.current?.series
    if (!s || !alerts) return
    const lines = alerts.map((a) =>
      s.createPriceLine({ price: a.price, color: '#f0b429', lineStyle: 2, axisLabelVisible: true, title: a.note ?? 'alert' })
    )
    return () => lines.forEach((l) => s.removePriceLine(l))
  }, [alerts, tf])

  // Journal trades as entry/exit markers.
  useEffect(() => {
    const s = chartRef.current?.series
    if (!s || !trades) return
    const sec = TIMEFRAMES[tf]
    const snap = (iso: string) => (Math.floor(Date.parse(iso) / 1000 / sec) * sec) as UTCTimestamp
    const markers = trades
      .flatMap((t) => [
        { time: snap(t.entryTime), position: t.side === 'long' ? 'belowBar' : 'aboveBar', color: '#58a6ff', shape: t.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${t.side} ${t.qty}` },
        { time: snap(t.exitTime), position: 'aboveBar', color: '#c9d1d9', shape: 'circle', text: 'exit' }
      ] as const)
      .sort((a, b) => a.time - b.time)
    const m = createSeriesMarkers(s, [...markers])
    return () => m.detach()
  }, [trades, tf])

  return (
    <div className="chart-page">
      <header className="toolbar">
        <strong>{SYMBOL}</strong>
        <span className="muted">{feed.name}</span>
        <span className="price">{last?.toFixed(2)}</span>
        <div className="spacer" />
        {(Object.keys(TIMEFRAMES) as TF[]).map((t) => (
          <button key={t} className={t === tf ? 'active' : ''} onClick={() => setTf(t)}>
            {t}
          </button>
        ))}
      </header>
      <div ref={el} className="chart" />
    </div>
  )
}
