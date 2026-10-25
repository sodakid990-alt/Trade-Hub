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
  /** One-off adjustments such as resets. */
  adjustments?: number
  /** Withdrawals from a funded account; they reduce the balance. */
  payouts?: Payout[]
  /** Linked Tradovate account; its fills and balance sync automatically. */
  tradovateAccountId?: number
  /** Last cash balance reported by the broker. */
  brokerBalance?: number
  brokerSyncedAt?: string
  updatedAt: string
  deleted?: boolean
}

export interface Payout {
  date: string // YYYY-MM-DD
  amount: number
}

/** A trading day's plan and review, keyed by date (YYYY-MM-DD in New York time). */
export interface DayNote {
  id: string
  bias?: 'bullish' | 'bearish' | 'neutral'
  levels?: string
  maxLoss?: number
  plan?: string
  grade?: 'A' | 'B' | 'C' | 'D' | 'F'
  wentWell?: string
  improve?: string
  updatedAt: string
  deleted?: boolean
}

/** A playbook setup: what it is and the rules for taking it. */
export interface Setup {
  id: string
  name: string
  description?: string
  rules: string[]
  color: string
  updatedAt: string
  deleted?: boolean
}

export type PageName = 'Home' | 'Chart' | 'Journal' | 'Daily' | 'Analysis' | 'Playbook' | 'Accounts' | 'Alerts' | 'Settings'

/** User preferences. One record (id "prefs"), synced so both computers match. */
export interface Prefs {
  id: 'prefs'
  theme: 'dark' | 'light' | 'system'
  accent: string
  compact: boolean
  startPage: PageName
  hiddenPages: PageName[]
  defaultSymbol: string
  defaultAccountId?: string
  /** Commission + fees per contract per side, added to new trades automatically. */
  commissionPerSide: number
  tags: string[]
  /** Personal max loss for a day across all accounts; 0 = off. */
  dailyMaxLoss: number
  /** Warn when this share of a loss limit or drawdown is used, e.g. 0.75. */
  warnAt: number
  onboardingDone: boolean
  updatedAt: string
}
