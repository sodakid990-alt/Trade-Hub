import { byDay, netPnl } from './analytics'
import type { PropAccount, Trade } from './types'

export interface AccountStatusView {
  balance: number
  profit: number
  /** Balance at which the account is breached. */
  threshold: number
  /** Dollars left before the drawdown is hit. */
  room: number
  targetProgress?: number
  todayPnl: number
  dailyRoom?: number
  tradingDays: number
  breached: boolean
  targetHit: boolean
}

/**
 * Computes balance and rule status from closed trades. Trailing drawdown is
 * tracked off closed-trade balance highs, which is looser than firms that
 * trail intraday open equity, so treat "room" as an upper bound.
 */
export function accountStatus(account: PropAccount, trades: Trade[], today = byDay({ exitTime: new Date().toISOString() } as Trade)): AccountStatusView {
  const sorted = trades.filter((t) => !t.deleted).sort((a, b) => a.exitTime.localeCompare(b.exitTime))
  const start = account.startingBalance + (account.adjustments ?? 0)
  let balance = start
  let peak = start
  const daily = new Map<string, number>()
  for (const t of sorted) {
    const pnl = netPnl(t)
    const day = byDay(t)
    daily.set(day, (daily.get(day) ?? 0) + pnl)
    balance += pnl
    if (account.drawdownType === 'trailing') peak = Math.max(peak, balance)
  }
  if (account.drawdownType === 'eod') {
    let eod = start
    for (const [, pnl] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
      eod += pnl
      peak = Math.max(peak, eod)
    }
  }
  let threshold = (account.drawdownType === 'static' ? start : peak) - account.maxDrawdown
  if (account.drawdownType !== 'static' && account.drawdownLockBalance !== undefined)
    threshold = Math.min(threshold, account.drawdownLockBalance)
  const profit = balance - account.startingBalance
  const todayPnl = daily.get(today) ?? 0
  return {
    balance,
    profit,
    threshold,
    room: balance - threshold,
    targetProgress: account.profitTarget ? Math.max(0, profit) / account.profitTarget : undefined,
    todayPnl,
    dailyRoom: account.dailyLossLimit !== undefined ? account.dailyLossLimit + todayPnl : undefined,
    tradingDays: daily.size,
    breached: balance <= threshold,
    targetHit: account.profitTarget !== undefined && profit >= account.profitTarget
  }
}
