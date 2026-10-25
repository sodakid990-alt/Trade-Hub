export type Side = 'long' | 'short'

export interface Trade {
  id: string
  symbol: string
  side: Side
  qty: number
  entryPrice: number
  exitPrice: number
  stopPrice?: number
  entryTime: string // ISO
  exitTime: string // ISO
  fees: number
  /** Broker-reported P&L, when imported. Otherwise computed from prices. */
  pnlOverride?: number
  setup?: string
  /** Prop firm or personal account this trade was taken on. */
  accountId?: string
  tags: string[]
  notes?: string
  updatedAt: string
  deleted?: boolean
}

export interface PriceAlert {
  id: string
  symbol: string
  price: number
  direction: 'above' | 'below'
  note?: string
  active: boolean
  triggeredAt?: string
  updatedAt: string
  deleted?: boolean
}

export interface Bar {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type AccountStage = 'eval' | 'funded'
export type AccountStatus = 'active' | 'passed' | 'failed' | 'closed'
/** trailing: follows the highest balance; eod: follows end-of-day highs; static: fixed. */
export type DrawdownType = 'trailing' | 'eod' | 'static'

export interface PropAccount {
  id: string
  name: string
  firm: string
  stage: AccountStage
  status: AccountStatus
  startingBalance: number
  profitTarget?: number
  maxDrawdown: number
  drawdownType: DrawdownType
  /** Trailing drawdown stops moving once the threshold reaches this balance (often the starting balance). */
  drawdownLockBalance?: number
  dailyLossLimit?: number
  minTradingDays?: number
  /** One-off adjustments such as payouts (negative) or resets. */
  adjustments?: number
  updatedAt: string
  deleted?: boolean
}
