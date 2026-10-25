import { describe, expect, it } from 'vitest'
import { parseTradeText } from './parseTradeText'

const today = '2026-10-25'

describe('parseTradeText', () => {
  it('reads Tradovate Performance rows', () => {
    const text = `Symbol Qty Buy Price Sell Price P&L Bought Timestamp Sold Timestamp
MNQZ6 1 21,000.25 21,010.25 $20.00 10/23/2026 09:31:00 10/23/2026 09:35:00
MNQZ6 2 21,020.00 21,015.00 $(20.00) 10/23/2026 10:05:00 10/23/2026 10:01:00`
    const [a, b] = parseTradeText(text, today)
    expect(a).toMatchObject({ symbol: 'MNQZ6', side: 'long', qty: 1, entryPrice: 21000.25, exitPrice: 21010.25, pnl: 20, entryTime: '2026-10-23T09:31:00', exitTime: '2026-10-23T09:35:00' })
    expect(b).toMatchObject({ side: 'short', qty: 2, entryPrice: 21015, exitPrice: 21020, pnl: -20, entryTime: '2026-10-23T10:01:00' })
  })

  it('pairs Buy/Sell fill rows into round trips', () => {
    const text = `Fills
09:42:13 AM MNQZ6 Sell 2 21118.50
09:31:05 AM MNQZ6 Buy 2 21102.75
10:15:40 AM MNQZ6 Sell 1 21090.00
10:21:02 AM MNQZ6 Buy 1 21081.25`
    const trades = parseTradeText(text, today)
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ side: 'long', qty: 2, entryPrice: 21102.75, exitPrice: 21118.5, entryTime: '2026-10-25T09:31:05', exitTime: '2026-10-25T09:42:13' })
    expect(trades[1]).toMatchObject({ side: 'short', qty: 1, entryPrice: 21090, exitPrice: 21081.25, exitTime: '2026-10-25T10:21:02' })
  })

  it('falls back to the first side word and prices', () => {
    const text = `MNQ Dec 26
Short 1 @ 21,250.50
Closed 21,240.00  P&L +$21.00
1:05 PM - 1:12 PM`
    expect(parseTradeText(text, today)).toEqual([
      { symbol: 'MNQ', side: 'short', qty: 1, entryPrice: 21250.5, exitPrice: 21240, stopPrice: null, entryTime: '2026-10-25T13:05:00', exitTime: '2026-10-25T13:12:00', fees: null, pnl: 21 }
    ])
  })

  it('returns nothing when no prices are visible', () => {
    expect(parseTradeText('Account Balance\nNo positions', today)).toEqual([])
  })
})
