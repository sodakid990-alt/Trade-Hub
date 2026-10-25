import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type Dexie from 'dexie'
import { db } from './db'
import type { DayNote, Prefs, PriceAlert, PropAccount, Setup, Trade } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

type Row = { id: string; user_id: string; data: Synced; updated_at: string }

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

type Synced = Trade | PriceAlert | PropAccount | DayNote | Setup | Prefs
const TABLES = ['trades', 'alerts', 'accounts', 'days', 'setups', 'prefs'] as const

async function syncTable(table: (typeof TABLES)[number], userId: string, since: string) {
  const client = supabase!
  const { data, error } = await client.from(table).select('data').gt('updated_at', since)
  if (error) throw error
  const remote = (data as Pick<Row, 'data'>[]).map((r) => r.data)
  const localChanged = await (db[table] as unknown as Dexie.Table<Synced, string>).where('updatedAt').above(since).toArray()
  // Compare remote changes against the full local copy, not only records changed locally.
  const localForRemote = (await (db[table] as unknown as Dexie.Table<Synced, string>).bulkGet(remote.map((r) => r.id))).filter((r) => r !== undefined)
  const { toLocal } = mergeRecords(localForRemote, remote)
  const { toRemote } = mergeRecords(localChanged, remote)
  await (db[table] as unknown as Dexie.Table<Synced, string>).bulkPut(toLocal)
  if (toRemote.length) {
    const rows = toRemote.map((r) => ({ id: r.id, user_id: userId, data: r, updated_at: r.updatedAt }))
    const { error: upErr } = await client.from(table).upsert(rows, { onConflict: 'user_id,id' })
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
  const missing: string[] = []
  for (const table of TABLES) {
    try {
      await syncTable(table, data.user.id, since)
    } catch (e) {
      // A table added in a newer version that the database doesn't have yet.
      if ((e as { code?: string }).code === 'PGRST205' || (e as { code?: string }).code === '42P01') missing.push(table)
      else throw e
    }
  }
  if (missing.length) return { ok: false, message: 'Sync error: re-run schema.sql in Supabase' }
  await db.meta.put({ key: 'lastSync', value: startedAt })
  return { ok: true, message: `Synced ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` }
}
