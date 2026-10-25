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
