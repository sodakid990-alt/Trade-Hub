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

import { parseYahooChart } from '../../../main/quote'

describe('quote parsing', () => {
  it('reads the last price from a Yahoo chart response', () => {
    expect(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 21012.5, regularMarketTime: 100 } }] } })).toEqual({ price: 21012.5, time: 100 })
    expect(parseYahooChart({ chart: { result: null } })).toBeNull()
  })
})

import { accountStatus } from './propAccounts'
import type { PropAccount } from './types'

describe('prop accounts', () => {
  const acct: PropAccount = {
    id: 'p', name: '50K eval', firm: 'Apex', stage: 'eval', status: 'active', startingBalance: 50000,
    profitTarget: 3000, maxDrawdown: 2500, drawdownType: 'trailing', drawdownLockBalance: 50100, updatedAt: ''
  }
  // $2/pt * 1 contract, no fees: +1000 then -400
  const t = (id: string, pts: number, day: string): Trade => ({
    ...base, id, qty: 1, fees: 0, entryPrice: 21000, exitPrice: 21000 + pts, stopPrice: undefined,
    entryTime: `${day}T14:00:00.000Z`, exitTime: `${day}T14:05:00.000Z`
  })

  it('trails drawdown off the balance high', () => {
    const s = accountStatus(acct, [t('1', 500, '2026-10-20'), t('2', -200, '2026-10-21')], '2026-10-21')
    expect(s.balance).toBe(50600)
    expect(s.threshold).toBe(48500)
    expect(s.room).toBe(2100)
    expect(s.targetProgress).toBeCloseTo(0.2)
    expect(s.todayPnl).toBe(-400)
    expect(s.tradingDays).toBe(2)
  })

  it('locks the trailing threshold and uses fixed threshold for static', () => {
    const big = accountStatus(acct, [t('1', 2000, '2026-10-20')])
    expect(big.threshold).toBe(50100)
    const st = accountStatus({ ...acct, drawdownType: 'static' }, [t('1', 2000, '2026-10-20')])
    expect(st.threshold).toBe(47500)
  })
})

import { toTradeDraft } from './screenshot'

describe('screenshot drafts', () => {
  it('turns an extracted trade into a journal draft', () => {
    const d = toTradeDraft({ symbol: 'mnqz6', side: 'short', qty: 2, entryPrice: 21010, exitPrice: 21000, stopPrice: null, entryTime: '2026-10-23T09:31:00', exitTime: null, fees: 1.24, pnl: 40 }, 'acct')
    expect(d.symbol).toBe('MNQZ6')
    expect(d.exitTime).toBe(d.entryTime)
    expect(d.stopPrice).toBeUndefined()
    expect(netPnl(d)).toBeCloseTo(38.76)
    expect(d.accountId).toBe('acct')
  })
})

import { pairsToTrades } from './tradovateSync'

describe('tradovate sync', () => {
  const snap = {
    accounts: [{ id: 7, name: 'LUCID50K1', balance: 50120 }],
    fills: [
      { id: 1, contractId: 99, timestamp: '2026-10-23T13:31:00Z', action: 'Buy' as const, qty: 1, price: 21000 },
      { id: 2, contractId: 99, timestamp: '2026-10-23T13:35:00Z', action: 'Sell' as const, qty: 1, price: 21020 },
      { id: 3, contractId: 99, timestamp: '2026-10-23T14:10:00Z', action: 'Buy' as const, qty: 2, price: 21030 },
      { id: 4, contractId: 99, timestamp: '2026-10-23T14:02:00Z', action: 'Sell' as const, qty: 2, price: 21040 }
    ],
    fillPairs: [
      { id: 10, positionId: 5, buyFillId: 1, sellFillId: 2, qty: 1, buyPrice: 21000, sellPrice: 21020 },
      { id: 11, positionId: 5, buyFillId: 3, sellFillId: 4, qty: 2, buyPrice: 21030, sellPrice: 21040 },
      { id: 12, positionId: 5, buyFillId: 3, sellFillId: 404, qty: 1, buyPrice: 1, sellPrice: 1 }
    ],
    contracts: { 99: 'MNQZ6' },
    positionAccounts: { 5: 7 }
  }

  it('pairs fills into long and short trades with CSV-compatible ids', () => {
    const [long, short, ...rest] = pairsToTrades(snap, 'now')
    expect(rest).toEqual([])
    expect(long).toMatchObject({ id: 'tv-1-2', symbol: 'MNQZ6', side: 'long', entryPrice: 21000, exitPrice: 21020, brokerAccountId: 7 })
    expect(short).toMatchObject({ id: 'tv-3-4', side: 'short', qty: 2, entryPrice: 21040, exitPrice: 21030 })
    expect(netPnl(short)).toBe(40)
  })

  it('uses the broker balance when an account is linked', () => {
    const acct = { id: 'p', name: '', firm: 'Lucid', stage: 'funded' as const, status: 'active' as const, startingBalance: 50000, maxDrawdown: 2000, drawdownType: 'static' as const, brokerBalance: 50120, updatedAt: '' }
    expect(accountStatus(acct, []).balance).toBe(50120)
    expect(accountStatus(acct, []).room).toBe(2120)
  })
})

import { guardrails } from './guardrails'
import { DEFAULT_PREFS, withDefaultFees } from './prefs'

describe('guardrails', () => {
  const acct = { id: 'g', name: 'Eval', firm: 'Lucid', stage: 'eval' as const, status: 'active' as const, startingBalance: 50000, maxDrawdown: 1000, drawdownType: 'static' as const, dailyLossLimit: 400, updatedAt: '' }
  const loss = (id: string, pts: number): Trade => ({ ...base, id, qty: 1, fees: 0, stopPrice: undefined, exitPrice: 21000 + pts, accountId: 'g', exitTime: '2026-10-23T15:00:00Z' })
  const day = () => '2026-10-23'

  it('warns near and stops at the limits', () => {
    const prefs = { ...DEFAULT_PREFS, dailyMaxLoss: 500 }
    const g = guardrails([loss('a', -160)], [acct], prefs, '2026-10-23', day) // -$320
    expect(g.map((x) => [x.key, x.level])).toEqual([['personal', 'ok'], ['g-daily', 'warn'], ['g-dd', 'ok']])
    const g2 = guardrails([loss('a', -200), loss('b', -100)], [acct], prefs, '2026-10-23', day) // -$600
    expect(g2.map((x) => x.level)).toEqual(['stop', 'stop', 'ok'])
  })

  it('fills default fees only where missing', () => {
    const [a, b] = withDefaultFees([{ ...base, qty: 2, fees: 0 }, { ...base, fees: 3 }], { commissionPerSide: 0.62 })
    expect(a.fees).toBe(2.48)
    expect(b.fees).toBe(3)
  })
})
