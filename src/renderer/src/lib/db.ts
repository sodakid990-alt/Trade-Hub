import Dexie, { type EntityTable } from 'dexie'
import type { DayNote, Prefs, PriceAlert, PropAccount, Setup, Trade } from './types'

/** Local-first store. Every write bumps updatedAt so sync can push it. */
export const db = new Dexie('trading-hub') as Dexie & {
  trades: EntityTable<Trade, 'id'>
  alerts: EntityTable<PriceAlert, 'id'>
  meta: EntityTable<{ key: string; value: string }, 'key'>
  accounts: EntityTable<PropAccount, 'id'>
  days: EntityTable<DayNote, 'id'>
  setups: EntityTable<Setup, 'id'>
  prefs: EntityTable<Prefs, 'id'>
}

db.version(1).stores({
  trades: 'id, exitTime, updatedAt, setup',
  alerts: 'id, updatedAt, active',
  meta: 'key'
})

db.version(2).stores({
  trades: 'id, exitTime, updatedAt, setup, accountId',
  accounts: 'id, updatedAt'
})

db.version(3).stores({
  days: 'id, updatedAt',
  setups: 'id, updatedAt, name',
  prefs: 'id, updatedAt'
})

export const newId = () => crypto.randomUUID()
export const stamp = () => new Date().toISOString()

export async function saveTrade(t: Trade) {
  await db.trades.put({ ...t, updatedAt: stamp() })
}

export async function deleteTrade(id: string) {
  await db.trades.update(id, { deleted: true, updatedAt: stamp() })
}

export async function saveAccount(a: PropAccount) {
  await db.accounts.put({ ...a, updatedAt: stamp() })
}

export async function deleteAccount(id: string) {
  await db.accounts.update(id, { deleted: true, updatedAt: stamp() })
}

export async function saveDay(d: DayNote) {
  await db.days.put({ ...d, updatedAt: stamp() })
}

export async function saveSetup(s: Setup) {
  await db.setups.put({ ...s, updatedAt: stamp() })
}

export async function deleteSetup(id: string) {
  await db.setups.update(id, { deleted: true, updatedAt: stamp() })
}

export async function restoreTrade(id: string) {
  await db.trades.update(id, { deleted: false, updatedAt: stamp() })
}

export async function saveAlert(a: PriceAlert) {
  await db.alerts.put({ ...a, updatedAt: stamp() })
}

export async function deleteAlert(id: string) {
  await db.alerts.update(id, { deleted: true, updatedAt: stamp() })
}

/** Imports trades, keeping journal fields (setup, notes, tags, stop) on trades already imported. */
export async function importTrades(trades: Trade[], accountId?: string): Promise<number> {
  let added = 0
  await db.transaction('rw', db.trades, async () => {
    for (const t of trades) {
      const existing = await db.trades.get(t.id)
      if (!existing) added++
      await db.trades.put(
        existing
          ? { ...t, setup: existing.setup, notes: existing.notes, tags: existing.tags, stopPrice: existing.stopPrice, accountId: existing.accountId ?? accountId, updatedAt: stamp() }
          : { ...t, accountId, updatedAt: stamp() }
      )
    }
  })
  return added
}
