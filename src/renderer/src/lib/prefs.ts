import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, stamp } from './db'
import { pointValue } from './contracts'
import type { PageName, Prefs, Trade } from './types'

export const PAGE_NAMES: PageName[] = ['Home', 'Chart', 'Journal', 'Daily', 'Analysis', 'Playbook', 'Accounts', 'Alerts', 'Settings']

/** Pages that are off until turned on in Settings, to keep the sidebar short. */
export const OPTIONAL_PAGES: PageName[] = ['Daily', 'Playbook', 'Alerts']

export const visiblePages = (prefs: Pick<Prefs, 'extraPages'>) =>
  PAGE_NAMES.filter((p) => !OPTIONAL_PAGES.includes(p) || prefs.extraPages.includes(p))

export const ACCENTS = ['#5b8cff', '#8b5cf6', '#14b8a6', '#22c55e', '#f59e0b', '#ec4899']

export const DEFAULT_TAGS = ['A+ setup', 'Followed plan', 'FOMO', 'Revenge', 'Moved stop', 'Early exit', 'Oversized']

export const DEFAULT_PREFS: Prefs = {
  id: 'prefs',
  theme: 'dark',
  accent: ACCENTS[0],
  compact: false,
  startPage: 'Home',
  extraPages: [],
  defaultSymbol: 'MNQ',
  commissionPerSide: 0,
  tags: DEFAULT_TAGS,
  dailyMaxLoss: 0,
  warnAt: 0.75,
  updatedAt: '1970-01-01T00:00:00.000Z'
}

/** Current preferences, filled in with defaults for anything not set yet. */
export function usePrefs(): Prefs {
  return usePrefsLoaded()[0]
}

/** Preferences plus whether they've been read from the database yet. */
export function usePrefsLoaded(): [Prefs, boolean] {
  // null once loaded with nothing saved; undefined while loading.
  const stored = useLiveQuery(() => db.prefs.get('prefs').then((p) => p ?? null), [])
  const prefs = useMemo(() => ({ ...DEFAULT_PREFS, ...stored }), [stored])
  return [prefs, stored !== undefined]
}

export async function updatePrefs(patch: Partial<Prefs>) {
  const current = (await db.prefs.get('prefs')) ?? DEFAULT_PREFS
  await db.prefs.put({ ...DEFAULT_PREFS, ...current, ...patch, id: 'prefs', updatedAt: stamp() })
}

/** Round-trip commissions for a trade from the per-side rate. */
export function defaultFees(qty: number, prefs: Pick<Prefs, 'commissionPerSide'>) {
  return Math.round(qty * 2 * prefs.commissionPerSide * 100) / 100
}

/** Fills in fees on imported trades that came without any. */
export function withDefaultFees<T extends Trade>(trades: T[], prefs: Pick<Prefs, 'commissionPerSide'>): T[] {
  return prefs.commissionPerSide ? trades.map((t) => (t.fees ? t : { ...t, fees: defaultFees(t.qty, prefs) })) : trades
}

/** Dollar value of one tick (0.25 points) for a symbol, for friendly hints. */
export const tickValue = (symbol: string) => pointValue(symbol) * 0.25
