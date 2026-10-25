import { describe, expect, it } from 'vitest'
import { netPnl, rMultiple, summarize, equityCurve } from './analytics'
import { rootSymbol } from './contracts'
import { parseTradovatePerformance } from './importCsv'
import { mergeRecords } from './sync'
import type { Trade } from './types'

const base: Trade = {
  id: '1',
  symbol: 'MNQZ6',
  side: 'long',
  qty: 2,
  entryPrice: 21000,
  exitPrice: 21010,
  stopPrice: 20995,
  entryTime: '2026-10-23T13:35:00.000Z',
  exitTime: '2026-10-23T13:40:00.000Z',
  fees: 1.5,
  tags: [],
  updatedAt: '2026-10-23T14:00:00.000Z'
}

describe('analytics', () => {
  it('computes MNQ P&L at $2/point', () => {
    expect(rootSymbol('MNQZ6')).toBe('MNQ')
    expect(netPnl(base)).toBe(10 * 2 * 2 - 1.5)
    expect(netPnl({ ...base, side: 'short' })).toBe(-40 - 1.5)
  })

  it('computes R multiple from stop', () => {
    expect(rMultiple({ ...base, fees: 0 })).toBe(2)
    expect(rMultiple({ ...base, stopPrice: undefined })).toBeUndefined()
  })

  it('summarizes win rate, profit factor and drawdown', () => {
    const trades: Trade[] = [
      { ...base, id: 'a', fees: 0, exitTime: '2026-10-23T14:00:00Z' }, // +40
      { ...base, id: 'b', fees: 0, exitPrice: 20990, exitTime: '2026-10-23T15:00:00Z' }, // -40
      { ...base, id: 'c', fees: 0, exitPrice: 20980, exitTime: '2026-10-23T16:00:00Z' }, // -80
      { ...base, id: 'd', fees: 0, exitPrice: 21050, exitTime: '2026-10-23T17:00:00Z' } // +200
    ]
    const s = summarize(trades)
    expect(s.winRate).toBe(0.5)
    expect(s.netPnl).toBe(120)
    expect(s.profitFactor).toBe(2)
    expect(s.maxDrawdown).toBe(120)
    expect(equityCurve(trades).map((p) => p.equity)).toEqual([40, 0, -80, 120])
  })
})

describe('tradovate import', () => {
  it('parses performance report rows into long and short trades', () => {
    const csv = [
      'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
      'MNQZ6,-2,0,0.25,111,222,1,21000.25,21010.25,$20.00,10/23/2026 09:31:00,10/23/2026 09:35:00,4min',
      'MNQZ6,-2,0,0.25,333,444,2,21020.00,21015.00,$(20.00),10/23/2026 10:05:00,10/23/2026 10:01:00,4min'
    ].join('\n')
    const [long, short] = parseTradovatePerformance(csv, 'now')
    expect(long.side).toBe('long')
    expect(long.pnlOverride).toBe(20)
    expect(short.side).toBe('short')
    expect(short.entryPrice).toBe(21015)
    expect(short.exitPrice).toBe(21020)
    expect(short.pnlOverride).toBe(-20)
  })
})

describe('sync merge', () => {
  it('keeps the newer side of each record', () => {
    const local = [{ id: 'x', updatedAt: '2' }, { id: 'y', updatedAt: '1' }, { id: 'z', updatedAt: '1' }]
    const remote = [{ id: 'x', updatedAt: '1' }, { id: 'y', updatedAt: '3' }, { id: 'w', updatedAt: '1' }]
    const { toLocal, toRemote } = mergeRecords(local, remote)
    expect(toLocal.map((r) => r.id)).toEqual(['y', 'w'])
    expect(toRemote.map((r) => r.id)).toEqual(['x', 'z'])
  })
})

import { crossed } from './alerts'

describe('alerts', () => {
  it('fires only when price crosses the level in the alert direction', () => {
    const a = { id: 'a', symbol: 'MNQ', price: 21000, direction: 'above' as const, active: true, updatedAt: '' }
    const b = { ...a, id: 'b', direction: 'below' as const }
    expect(crossed([a, b], 20999, 21000).map((x) => x.id)).toEqual(['a'])
    expect(crossed([a, b], 21001, 21000).map((x) => x.id)).toEqual(['b'])
    expect(crossed([a, b], 21001, 21002)).toEqual([])
  })
})
