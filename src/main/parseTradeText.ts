/**
 * Turns OCR text from a trading platform screenshot into trades. OCR output is
 * noisy, so this looks for three shapes in order and returns whatever it can
 * read; the user reviews every field before saving.
 *   1. Performance rows (Tradovate): symbol, qty, buy price, sell price, P&L, two timestamps
 *   2. Fill rows: a Buy/Sell word with a price (and usually qty and time), paired into round trips
 *   3. Anything else: first side word, first two prices, times and a dollar P&L
 */
export interface ExtractedTrade {
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  exitPrice: number
  stopPrice: number | null
  /** Local time as YYYY-MM-DDTHH:MM:SS (no zone), or null */
  entryTime: string | null
  exitTime: string | null
  fees: number | null
  pnl: number | null
}

const SYMBOL = /\b(MNQ|MES|M2K|MYM|NQ|ES|RTY|YM|MGC|GC|MCL|CL)([FGHJKMNQUVXZ]\d{1,2})?\b/i
// Index futures prices: 4-5 digits with an optional quarter-tick decimal. OCR sometimes reads "," as "."
const PRICE = /\b\d{1,2},?\d{3}(?:\.\d{1,2})?\b/g
const TIME = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\b/gi
const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g
const MONEY = /(-|\()?\s?\$\s?(-|\()?([\d,]+\.\d{2})\)?/g
const BUY = /\b(buy|bought|long)\b/i
const SELL = /\b(sell|sold|short)\b/i

const pad = (n: number) => String(n).padStart(2, '0')

function prices(line: string): number[] {
  return [...line.matchAll(PRICE)].map((m) => parseFloat(m[0].replace(',', ''))).filter((p) => p >= 1000)
}

function dollars(line: string): number[] {
  return [...line.matchAll(MONEY)].map((m) => {
    const value = parseFloat(m[3].replace(/,/g, ''))
    return m[1] || m[2] ? -value : value
  })
}

/** Every timestamp in the line as local "YYYY-MM-DDTHH:MM:SS", using the nearest preceding date or `today`. */
function times(line: string, today: string): string[] {
  const dates = [...line.matchAll(DATE)].map((m) => ({
    index: m.index!,
    date: `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(+m[1])}-${pad(+m[2])}`
  }))
  return [...line.matchAll(TIME)].map((m) => {
    let h = +m[1]
    if (m[4]?.toUpperCase() === 'PM' && h < 12) h += 12
    if (m[4]?.toUpperCase() === 'AM' && h === 12) h = 0
    const date = dates.filter((d) => d.index < m.index!).at(-1)?.date ?? dates[0]?.date ?? today
    return `${date}T${pad(h)}:${m[2]}:${m[3] ?? '00'}`
  })
}

function quantity(line: string, exclude: number[]): number {
  // A small whole number that isn't part of a price, date or time.
  const cleaned = line.replace(PRICE, ' ').replace(TIME, ' ').replace(DATE, ' ').replace(MONEY, ' ')
  const q = cleaned.match(/(?:^|\s)(\d{1,2})(?=\s|$)/)
  const n = q ? parseInt(q[1], 10) : 1
  return n > 0 && !exclude.includes(n) ? n : 1
}

function performanceRow(line: string, symbol: string, today: string): ExtractedTrade | null {
  const p = prices(line)
  const t = times(line, today)
  if (p.length < 2 || t.length < 2) return null
  // Tradovate column order: Buy Price, Sell Price, P&L, Bought Timestamp, Sold Timestamp.
  const [buy, sell] = p
  const [bought, sold] = t
  const long = bought <= sold
  return {
    symbol,
    side: long ? 'long' : 'short',
    qty: quantity(line, []),
    entryPrice: long ? buy : sell,
    exitPrice: long ? sell : buy,
    stopPrice: null,
    entryTime: long ? bought : sold,
    exitTime: long ? sold : bought,
    fees: null,
    pnl: dollars(line)[0] ?? null
  }
}

interface Fill {
  side: 'buy' | 'sell'
  qty: number
  price: number
  time: string | null
}

function pairFills(fills: Fill[], symbol: string): ExtractedTrade[] {
  const sorted = fills.every((f) => f.time) ? [...fills].sort((a, b) => a.time!.localeCompare(b.time!)) : fills
  const trades: ExtractedTrade[] = []
  let open: Fill | null = null
  for (const f of sorted) {
    if (!open) {
      open = f
      continue
    }
    if (f.side === open.side) continue // scaling in; keep the first entry
    trades.push({
      symbol,
      side: open.side === 'buy' ? 'long' : 'short',
      qty: Math.min(open.qty, f.qty),
      entryPrice: open.price,
      exitPrice: f.price,
      stopPrice: null,
      entryTime: open.time,
      exitTime: f.time,
      fees: null,
      pnl: null
    })
    open = null
  }
  return trades
}

export function parseTradeText(text: string, today: string): ExtractedTrade[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const symbolMatch = text.match(SYMBOL)
  const symbol = symbolMatch ? symbolMatch[0].toUpperCase() : 'MNQ'

  const perf = lines
    .filter((l) => SYMBOL.test(l))
    .map((l) => performanceRow(l, l.match(SYMBOL)![0].toUpperCase(), today))
    .filter((t) => t !== null)
  if (perf.length) return perf

  const fills: Fill[] = []
  for (const line of lines) {
    const buy = BUY.test(line)
    const sell = SELL.test(line)
    const p = prices(line)
    if (buy === sell || !p.length) continue
    fills.push({ side: buy ? 'buy' : 'sell', qty: quantity(line, []), price: p[0], time: times(line, today)[0] ?? null })
  }
  if (fills.length >= 2) {
    const paired = pairFills(fills, symbol)
    if (paired.length) return paired
  }

  // Last resort: one trade from whatever is on screen.
  const allPrices = prices(text)
  if (allPrices.length < 2) return []
  const allTimes = times(text.replace(/\n/g, ' '), today)
  const sideWord = text.match(/\b(buy|bought|long|sell|sold|short)\b/i)?.[0].toLowerCase()
  const long = !sideWord || ['buy', 'bought', 'long'].includes(sideWord)
  return [
    {
      symbol,
      side: long ? 'long' : 'short',
      qty: 1,
      entryPrice: allPrices[0],
      exitPrice: allPrices[1],
      stopPrice: null,
      entryTime: allTimes[0] ?? null,
      exitTime: allTimes[1] ?? allTimes[0] ?? null,
      fees: null,
      pnl: dollars(text)[0] ?? null
    }
  ]
}
