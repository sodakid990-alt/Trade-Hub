import { netPnl } from './analytics'
import { accountStatus } from './propAccounts'
import type { Prefs, PropAccount, Trade } from './types'

export type Level = 'ok' | 'warn' | 'stop'

export interface Guardrail {
  key: string
  label: string
  /** Share of the limit used so far, 0..1+ */
  used: number
  level: Level
  detail: string
}

const level = (used: number, warnAt: number): Level => (used >= 1 ? 'stop' : used >= warnAt ? 'warn' : 'ok')
const money = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * Rule checks for today: the personal daily max loss across everything, and
 * each active prop account's daily loss limit and drawdown.
 */
export function guardrails(trades: Trade[], accounts: PropAccount[], prefs: Prefs, today: string, dayOf: (t: Trade) => string): Guardrail[] {
  const out: Guardrail[] = []
  const todays = trades.filter((t) => !t.deleted && dayOf(t) === today)
  if (prefs.dailyMaxLoss > 0) {
    const pnl = todays.reduce((s, t) => s + netPnl(t), 0)
    const used = Math.max(0, -pnl) / prefs.dailyMaxLoss
    out.push({ key: 'personal', label: 'Your daily max loss', used, level: level(used, prefs.warnAt), detail: `${money(Math.min(0, pnl))} of ${money(prefs.dailyMaxLoss)}` })
  }
  for (const a of accounts.filter((x) => !x.deleted && x.status === 'active')) {
    const s = accountStatus(a, trades.filter((t) => t.accountId === a.id), today)
    const name = a.name || a.firm
    if (a.dailyLossLimit) {
      const used = Math.max(0, -s.todayPnl) / a.dailyLossLimit
      out.push({ key: `${a.id}-daily`, label: `${name} · daily loss limit`, used, level: level(used, prefs.warnAt), detail: `${money(Math.min(0, s.todayPnl))} of ${money(a.dailyLossLimit)}` })
    }
    const used = 1 - s.room / a.maxDrawdown
    out.push({ key: `${a.id}-dd`, label: `${name} · drawdown`, used: Math.max(0, used), level: level(used, prefs.warnAt), detail: `${money(s.room)} left before ${money(s.threshold)}` })
  }
  return out
}
