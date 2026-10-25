import type { TradovateSnapshot } from '../../../main/tradovate'
import { db, importTrades, stamp } from './db'
import type { PropAccount, Trade } from './types'

/**
 * Turns Tradovate's matched round trips into journal trades. Ids match the
 * Performance CSV import ("tv-<buyFillId>-<sellFillId>") so the two never duplicate.
 */
export function pairsToTrades(snap: TradovateSnapshot, now = stamp()): (Trade & { brokerAccountId?: number })[] {
  const fills = new Map(snap.fills.map((f) => [f.id, f]))
  const out: (Trade & { brokerAccountId?: number })[] = []
  for (const p of snap.fillPairs) {
    const buy = fills.get(p.buyFillId)
    const sell = fills.get(p.sellFillId)
    if (!buy || !sell) continue
    const long = buy.timestamp <= sell.timestamp
    out.push({
      id: `tv-${p.buyFillId}-${p.sellFillId}`,
      symbol: snap.contracts[buy.contractId] ?? 'MNQ',
      side: long ? 'long' : 'short',
      qty: p.qty,
      entryPrice: long ? p.buyPrice : p.sellPrice,
      exitPrice: long ? p.sellPrice : p.buyPrice,
      entryTime: new Date(long ? buy.timestamp : sell.timestamp).toISOString(),
      exitTime: new Date(long ? sell.timestamp : buy.timestamp).toISOString(),
      fees: 0,
      tags: [],
      updatedAt: now,
      brokerAccountId: snap.positionAccounts[p.positionId]
    })
  }
  return out
}

/** Pulls the latest fills and balances into every account linked to Tradovate. */
export async function syncTradovate(): Promise<string> {
  if (!window.hub) return ''
  const snap = await window.hub.tradovate.snapshot()
  const linked = (await db.accounts.filter((a) => !a.deleted && a.tradovateAccountId !== undefined).toArray()) as PropAccount[]
  const trades = pairsToTrades(snap)
  let added = 0
  for (const account of linked) {
    const mine = trades.filter((t) => t.brokerAccountId === account.tradovateAccountId).map(({ brokerAccountId: _, ...t }) => t)
    added += await importTrades(mine, account.id)
    const broker = snap.accounts.find((a) => a.id === account.tradovateAccountId)
    if (broker?.balance !== undefined && broker.balance !== account.brokerBalance)
      await db.accounts.put({ ...account, brokerBalance: broker.balance, brokerSyncedAt: stamp(), updatedAt: stamp() })
  }
  return added ? `Tradovate: ${added} new trade${added === 1 ? '' : 's'}` : `Tradovate synced ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
