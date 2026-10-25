import Dexie, { type EntityTable } from 'dexie'
import type { PriceAlert, Trade } from './types'

/** Local-first store. Every write bumps updatedAt so sync can push it. */
export const db = new Dexie('trading-hub') as Dexie & {
  trades: EntityTable<Trade, 'id'>
  alerts: EntityTable<PriceAlert, 'id'>
  meta: EntityTable<{ key: string; value: string }, 'key'>
}

db.version(1).stores({
  trades: 'id, exitTime, updatedAt, setup',
  alerts: 'id, updatedAt, active',
  meta: 'key'
})

export const newId = () => crypto.randomUUID()
export const stamp = () => new Date().toISOString()

export async function saveTrade(t: Trade) {
  await db.trades.put({ ...t, updatedAt: stamp() })
}

export async function deleteTrade(id: string) {
  await db.trades.update(id, { deleted: true, updatedAt: stamp() })
}

export async function saveAlert(a: PriceAlert) {
  await db.alerts.put({ ...a, updatedAt: stamp() })
}

export async function deleteAlert(id: string) {
  await db.alerts.update(id, { deleted: true, updatedAt: stamp() })
}

/** Imports trades, keeping journal fields (setup, notes, tags, stop) on trades already imported. */
export async function importTrades(trades: Trade[]): Promise<number> {
  let added = 0
  await db.transaction('rw', db.trades, async () => {
    for (const t of trades) {
      const existing = await db.trades.get(t.id)
      if (!existing) added++
      await db.trades.put(
        existing
          ? { ...t, setup: existing.setup, notes: existing.notes, tags: existing.tags, stopPrice: existing.stopPrice, updatedAt: stamp() }
          : { ...t, updatedAt: stamp() }
      )
    }
  })
  return added
}
