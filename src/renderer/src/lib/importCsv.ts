import Papa from 'papaparse'
import type { Trade } from './types'

/** "$1,234.50" -> 1234.5, "$(12.00)" -> -12 */
function money(s: string | undefined): number {
  if (!s) return 0
  const neg = /\(.*\)|-/.test(s)
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : neg ? -n : n
}

/** Tradovate timestamps look like "10/24/2026 09:31:05". They are in the account's local time. */
function parseTime(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (m) {
    const [, mo, d, y, h, mi, se] = m.map(Number)
    return new Date(y, mo - 1, d, h, mi, se).toISOString()
  }
  return new Date(s).toISOString()
}

/**
 * Parses Tradovate's "Performance" report export: one row per round-trip with
 * buyPrice/sellPrice and bought/sold timestamps. Side is whichever leg came first.
 */
export function parseTradovatePerformance(csv: string, now = new Date().toISOString()): Trade[] {
  const { data } = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true })
  return data.map((r) => {
    const bought = parseTime(r.boughtTimestamp)
    const sold = parseTime(r.soldTimestamp)
    const long = bought <= sold
    const buy = parseFloat(r.buyPrice)
    const sell = parseFloat(r.sellPrice)
    return {
      id: `tv-${r.buyFillId}-${r.sellFillId}`,
      symbol: r.symbol,
      side: long ? 'long' : 'short',
      qty: parseInt(r.qty, 10),
      entryPrice: long ? buy : sell,
      exitPrice: long ? sell : buy,
      entryTime: long ? bought : sold,
      exitTime: long ? sold : bought,
      fees: 0,
      pnlOverride: money(r.pnl),
      tags: [],
      updatedAt: now
    }
  })
}

export function detectAndParse(csv: string): Trade[] {
  const header = csv.slice(0, csv.indexOf('\n'))
  if (header.includes('buyFillId') && header.includes('soldTimestamp')) return parseTradovatePerformance(csv)
  throw new Error('Unrecognized CSV. Export the Performance report from Tradovate (Reports > Performance).')
}
