import type { AccountStage, PropAccount } from './types'

/**
 * Prop firm rules filled in when an account is added, so nothing has to be typed.
 * Lucid Trading rules as published in Sept 2026; firms change rules, so every
 * value can still be edited on the account.
 */
export interface FirmPlan {
  firm: string
  plan: string
  /** LucidDirect starts funded, with no evaluation. */
  fundedOnly?: boolean
  sizes: Record<number, { target?: number; drawdown: number; evalDaily?: number; fundedDaily?: number }>
  drawdownType: { eval: PropAccount['drawdownType']; funded: PropAccount['drawdownType'] }
  minDays?: { eval?: number; funded?: number }
}

export const SIZES = [25000, 50000, 100000, 150000]

const LUCID_TARGETS = { 25000: 1250, 50000: 3000, 100000: 6000, 150000: 9000 }
const LUCID_DRAWDOWN = { 25000: 1000, 50000: 2000, 100000: 3000, 150000: 4500 }

const lucid = (daily?: Partial<Record<number, number>>, fundedDaily?: Partial<Record<number, number>>) =>
  Object.fromEntries(
    SIZES.map((s) => [s, { target: LUCID_TARGETS[s as 25000], drawdown: LUCID_DRAWDOWN[s as 25000], evalDaily: daily?.[s], fundedDaily: fundedDaily?.[s] }])
  )

export const FIRM_PLANS: FirmPlan[] = [
  { firm: 'Lucid', plan: 'LucidFlex', sizes: lucid(), drawdownType: { eval: 'eod', funded: 'eod' } },
  { firm: 'Lucid', plan: 'LucidPro', sizes: lucid({ 50000: 1200, 100000: 1800, 150000: 2700 }), drawdownType: { eval: 'eod', funded: 'eod' } },
  {
    firm: 'Lucid',
    plan: 'LucidDirect',
    fundedOnly: true,
    sizes: {
      25000: { drawdown: 1000 },
      50000: { drawdown: 2000, fundedDaily: 1200 },
      100000: { drawdown: 3500, fundedDaily: 2100 },
      150000: { drawdown: 5000, fundedDaily: 3000 }
    },
    drawdownType: { eval: 'eod', funded: 'eod' },
    minDays: { funded: 5 }
  },
  { firm: 'Lucid', plan: 'LucidDaily', sizes: lucid(), drawdownType: { eval: 'eod', funded: 'trailing' } }
]

/** A ready-to-save account for a plan, size and stage. */
export function accountFromPlan(plan: FirmPlan, size: number, stage: AccountStage, base: Pick<PropAccount, 'id' | 'updatedAt'>): PropAccount {
  const rules = plan.sizes[size]
  const s = plan.fundedOnly ? 'funded' : stage
  return {
    ...base,
    name: `${plan.plan} ${size / 1000}K${s === 'eval' ? ' Eval' : ''}`,
    firm: plan.firm,
    stage: s,
    status: 'active',
    startingBalance: size,
    profitTarget: s === 'eval' ? rules.target : undefined,
    maxDrawdown: rules.drawdown,
    drawdownType: plan.drawdownType[s],
    // Lucid's trailing drawdown locks $100 above the starting balance.
    drawdownLockBalance: size + 100,
    dailyLossLimit: s === 'eval' ? rules.evalDaily : rules.fundedDaily,
    minTradingDays: plan.minDays?.[s]
  }
}
