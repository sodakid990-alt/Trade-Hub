import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { byDay, todayKey } from '../lib/analytics'
import { guardrails, type Level } from '../lib/guardrails'
import { usePrefs } from '../lib/prefs'

const RANK: Record<Level, number> = { ok: 0, warn: 1, stop: 2 }

/** Sends a desktop notification the first time each rule reaches warn or stop today. */
export function useGuardrailAlerts() {
  const prefs = usePrefs()
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  useEffect(() => {
    if (!trades || !accounts) return
    ;(async () => {
      const today = todayKey()
      const saved = JSON.parse((await db.meta.get('guardrails-notified'))?.value ?? '{}') as { day?: string; levels?: Record<string, Level> }
      const levels = saved.day === today ? saved.levels ?? {} : {}
      let changed = false
      for (const g of guardrails(trades, accounts, prefs, today, byDay)) {
        if (RANK[g.level] > RANK[levels[g.key] ?? 'ok']) {
          levels[g.key] = g.level
          changed = true
          const title = g.level === 'stop' ? `Limit reached: ${g.label}` : `Getting close: ${g.label}`
          const body = g.level === 'stop' ? `${g.detail}. Time to stop for the day.` : `${g.detail}. Slow down and stick to your plan.`
          window.hub?.notify(title, body)
        }
      }
      if (changed) await db.meta.put({ key: 'guardrails-notified', value: JSON.stringify({ day: today, levels }) })
    })()
  }, [trades, accounts, prefs])
}
