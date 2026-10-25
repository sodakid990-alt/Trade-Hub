import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type Dexie from 'dexie'
import { db } from './db'
import type { PriceAlert, Trade } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

type Row = { id: string; user_id: string; data: Trade | PriceAlert; updated_at: string }

/** Last-writer-wins per record. Picks newer of local vs remote by updatedAt. */
export function mergeRecords<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]) {
  const localById = new Map(local.map((r) => [r.id, r]))
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const toLocal = remote.filter((r) => {
    const l = localById.get(r.id)
    return !l || r.updatedAt > l.updatedAt
  })
  const toRemote = local.filter((l) => {
    const r = remoteById.get(l.id)
    return !r || l.updatedAt > r.updatedAt
  })
  return { toLocal, toRemote }
}

async function syncTable(table: 'trades' | 'alerts', userId: string, since: string) {
  const client = supabase!
  const { data, error } = await client.from(table).select('data').gt('updated_at', since)
  if (error) throw error
  const remote = (data as Pick<Row, 'data'>[]).map((r) => r.data)
  const localChanged = await db[table].where('updatedAt').above(since).toArray()
  // Compare remote changes against the full local copy, not only records changed locally.
  const localForRemote = (await db[table].bulkGet(remote.map((r) => r.id))).filter((r) => r !== undefined)
  const { toLocal } = mergeRecords(localForRemote, remote)
  const { toRemote } = mergeRecords(localChanged, remote)
  await (db[table] as Dexie.Table<Trade | PriceAlert, string>).bulkPut(toLocal)
  if (toRemote.length) {
    const rows = toRemote.map((r) => ({ id: r.id, user_id: userId, data: r, updated_at: r.updatedAt }))
    const { error: upErr } = await client.from(table).upsert(rows)
    if (upErr) throw upErr
  }
}

/** Pushes local changes and pulls remote ones since the last successful sync. */
export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: 'Sync not configured' }
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { ok: false, message: 'Signed out' }
  const startedAt = new Date().toISOString()
  const since = (await db.meta.get('lastSync'))?.value ?? '1970-01-01T00:00:00.000Z'
  await syncTable('trades', data.user.id, since)
  await syncTable('alerts', data.user.id, since)
  await db.meta.put({ key: 'lastSync', value: startedAt })
  return { ok: true, message: `Synced ${new Date().toLocaleTimeString()}` }
}
