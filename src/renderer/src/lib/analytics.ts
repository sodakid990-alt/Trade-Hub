import { pointValue } from './contracts'
import type { Trade } from './types'

export function grossPnl(t: Trade): number {
  const dir = t.side === 'long' ? 1 : -1
  return (t.exitPrice - t.entryPrice) * dir * t.qty * pointValue(t.symbol)
}

export function netPnl(t: Trade): number {
  return t.pnlOverride !== undefined ? t.pnlOverride - t.fees : grossPnl(t) - t.fees
}

/** Dollars at risk, or undefined when no stop was logged. */
export function riskDollars(t: Trade): number | undefined {
  if (t.stopPrice === undefined) return undefined
  const risk = Math.abs(t.entryPrice - t.stopPrice) * t.qty * pointValue(t.symbol)
  return risk > 0 ? risk : undefined
}

export function rMultiple(t: Trade): number | undefined {
  const risk = riskDollars(t)
  return risk === undefined ? undefined : netPnl(t) / risk
}

export interface Summary {
  trades: number
  wins: number
  losses: number
  winRate: number
  netPnl: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  expectancy: number
  avgR?: number
  maxDrawdown: number
  largestWin: number
  largestLoss: number
}

export function summarize(trades: Trade[]): Summary {
  const pnls = trades.map(netPnl)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const grossWin = sum(wins)
  const grossLoss = Math.abs(sum(losses))
  const rs = trades.map(rMultiple).filter((r): r is number => r !== undefined)
  const curve = equityCurve(trades)
  let peak = 0
  let maxDrawdown = 0
  for (const p of curve) {
    peak = Math.max(peak, p.equity)
    maxDrawdown = Math.max(maxDrawdown, peak - p.equity)
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    netPnl: sum(pnls),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: trades.length ? sum(pnls) / trades.length : 0,
    avgR: rs.length ? sum(rs) / rs.length : undefined,
    maxDrawdown,
    largestWin: wins.length ? Math.max(...wins) : 0,
    largestLoss: losses.length ? Math.min(...losses) : 0
  }
}

export function equityCurve(trades: Trade[]): { time: string; equity: number }[] {
  let equity = 0
  return [...trades]
    .sort((a, b) => a.exitTime.localeCompare(b.exitTime))
    .map((t) => ({ time: t.exitTime, equity: (equity += netPnl(t)) }))
}

/** Groups trades by a key and summarizes each group, e.g. by setup or hour. */
export function breakdown(trades: Trade[], key: (t: Trade) => string): { key: string; summary: Summary }[] {
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const k = key(t)
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  return [...groups.entries()]
    .map(([k, ts]) => ({ key: k, summary: summarize(ts) }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Keys use New York time, since that is how CME index futures sessions are read. */
function nyParts(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: get('hour'), weekday: get('weekday') }
}

export const byHour = (t: Trade) => `${nyParts(t.entryTime).hour}:00 ET`
export const byWeekday = (t: Trade) => {
  const wd = nyParts(t.entryTime).weekday
  return `${DAYS.indexOf(wd)} ${wd}`
}
export const bySetup = (t: Trade) => t.setup || '(no setup)'
export const byDay = (t: Trade) => nyParts(t.exitTime).date

/** Net P&L per trading day, for the calendar view. */
export function dailyPnl(trades: Trade[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of trades) out.set(byDay(t), (out.get(byDay(t)) ?? 0) + netPnl(t))
  return out
}

/** Today's trading-day key (New York date), matching byDay. */
export const todayKey = () => byDay({ exitTime: new Date().toISOString() } as Trade)
