import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteAccount, newId, saveAccount, stamp } from '../lib/db'
import { todayKey } from '../lib/analytics'
import { useNav, useToast } from '../components/app'
import { accountStatus } from '../lib/propAccounts'
import type { Payout, PropAccount } from '../lib/types'
import { Icon } from '../components/Icon'
import { pnlClass, usd } from '../components/format'
import type { TradovateAccount } from '../../../preload'
import { accountFromPlan, FIRM_PLANS, SIZES } from '../lib/firmPresets'
import { updatePrefs, usePrefs } from '../lib/prefs'
import type { AccountStage } from '../lib/types'

const blank = (): PropAccount => ({
  id: newId(), name: '', firm: '', stage: 'eval', status: 'active', startingBalance: 50000,
  profitTarget: 3000, maxDrawdown: 2500, drawdownType: 'trailing', updatedAt: stamp()
})

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), [])
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted && !!t.accountId).toArray(), [])
  const [editing, setEditing] = useState<PropAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const { intent, clearIntent } = useNav()
  useEffect(() => {
    if (intent === 'add-account') {
      setAdding(true)
      clearIntent()
    }
  }, [intent, clearIntent])
  useEffect(() => {
    if (accounts?.length === 0) setAdding(true)
  }, [accounts?.length])

  const shown = (accounts ?? []).filter((a) => showClosed || a.status === 'active')
  const groups: [string, PropAccount[]][] = [
    ['Funded', shown.filter((a) => a.stage === 'funded')],
    ['Evaluations', shown.filter((a) => a.stage === 'eval')]
  ]
  const totals = (accounts ?? []).filter((a) => a.stage === 'funded' && a.status === 'active').reduce(
    (acc, a) => {
      const s = accountStatus(a, (trades ?? []).filter((t) => t.accountId === a.id))
      return { profit: acc.profit + s.profit, room: acc.room + s.room, paid: acc.paid + s.paidOut }
    },
    { profit: 0, room: 0, paid: 0 }
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Prop firm evaluations and funded accounts</p>
        </div>
        <div className="row gap">
        {(accounts ?? []).some((a) => a.status !== 'active') && (
          <label className="muted"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed</label>
        )}
        <button className="primary" onClick={() => { setEditing(null); setAdding(true) }}>Add account</button>
        </div>
      </header>
      {adding && !editing && <QuickAdd onClose={() => setAdding(false)} onCustom={() => { setAdding(false); setEditing(blank()) }} />}
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} />}
      {(accounts ?? []).some((a) => a.stage === 'funded') && <div className="stats">
        <div className="card stat"><div className="muted">Funded profit</div><div className={`value ${pnlClass(totals.profit)}`}>{usd(totals.profit)}</div></div>
        <div className="card stat"><div className="muted">Funded drawdown room</div><div className="value">{usd(totals.room)}</div></div>
        <div className="card stat"><div className="muted">Total paid out</div><div className={`value ${totals.paid > 0 ? 'pos' : ''}`}>{usd(totals.paid)}</div></div>
      </div>}
      {groups.map(([title, list]) =>
        list.length ? (
          <section key={title}>
            <h3 className="section-title">{title}</h3>
            <div className="accounts">
              {list.map((a) => (
                <AccountCard key={a.id} account={a} trades={(trades ?? []).filter((t) => t.accountId === a.id)} onEdit={() => setEditing(a)} />
              ))}
            </div>
          </section>
        ) : null
      )}
    </div>
  )
}

/** Add an account by picking the firm's plan and size; the rules fill in from the preset. */
function QuickAdd({ onClose, onCustom }: { onClose: () => void; onCustom: () => void }) {
  const prefs = usePrefs()
  const toast = useToast()
  const [planName, setPlanName] = useState(FIRM_PLANS[0].plan)
  const [size, setSize] = useState(50000)
  const [stage, setStage] = useState<AccountStage>('eval')
  const plan = FIRM_PLANS.find((p) => p.plan === planName)!
  const preview = accountFromPlan(plan, size, stage, { id: '', updatedAt: '' })
  const add = async () => {
    const account = accountFromPlan(plan, size, stage, { id: newId(), updatedAt: stamp() })
    await saveAccount(account)
    // The first account becomes where new trades go, so there's nothing to pick later.
    if (!prefs.defaultAccountId) await updatePrefs({ defaultAccountId: account.id })
    toast(`Added ${account.name}`)
    onClose()
  }
  const usd = (n: number) => '$' + n.toLocaleString()
  const rules = [
    preview.profitTarget && `${usd(preview.profitTarget)} profit target`,
    `${usd(preview.maxDrawdown)} ${preview.drawdownType === 'eod' ? 'end-of-day' : 'intraday'} drawdown`,
    preview.dailyLossLimit ? `${usd(preview.dailyLossLimit)} daily loss limit` : 'no daily loss limit'
  ].filter(Boolean)
  return (
    <section className="card quick-add">
      <h3>Add an account</h3>
      <div className="quick-row">
        <span className="field-label">Lucid plan</span>
        <div className="chips">
          {FIRM_PLANS.map((p) => (
            <button key={p.plan} className={`chip ${p.plan === planName ? 'active' : ''}`} onClick={() => setPlanName(p.plan)}>{p.plan}</button>
          ))}
        </div>
      </div>
      <div className="quick-row">
        <span className="field-label">Size</span>
        <div className="chips">
          {SIZES.map((s) => (
            <button key={s} className={`chip ${s === size ? 'active' : ''}`} onClick={() => setSize(s)}>{s / 1000}K</button>
          ))}
        </div>
      </div>
      {!plan.fundedOnly && (
        <div className="quick-row">
          <span className="field-label">Stage</span>
          <div className="segmented">
            <button className={stage === 'eval' ? 'active' : ''} onClick={() => setStage('eval')}>Evaluation</button>
            <button className={stage === 'funded' ? 'active' : ''} onClick={() => setStage('funded')}>Funded</button>
          </div>
        </div>
      )}
      <p className="muted small">Rules filled in for you: {rules.join(', ')}. You can change them later by clicking the account.</p>
      <div className="row gap">
        <button className="link" onClick={onCustom}>Different firm? Enter the rules yourself</button>
        <div className="spacer" />
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={add}>Add {preview.name}</button>
      </div>
    </section>
  )
}

function Bar({ value, danger }: { value: number; danger?: boolean }) {
  return <div className="bar"><div className={danger ? 'fill danger' : 'fill'} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>
}

function AccountCard({ account: a, trades, onEdit }: { account: PropAccount; trades: Parameters<typeof accountStatus>[1]; onEdit: () => void }) {
  const s = accountStatus(a, trades)
  const roomPct = s.room / a.maxDrawdown
  return (
    <div className={`card account ${s.breached ? 'breached' : ''}`} onClick={onEdit}>
      <div className="row">
        <strong>{a.name || `${a.firm} ${a.startingBalance / 1000}K`}</strong>
        <span className="muted">{a.firm}</span>
        {a.tradovateAccountId !== undefined && <span className="live" title={a.brokerSyncedAt ? `Balance from Tradovate, ${new Date(a.brokerSyncedAt).toLocaleString()}` : 'Linked to Tradovate'}>● Live</span>}
        <div className="spacer" />
        <span className={`badge ${a.status}`}>{s.breached && a.status === 'active' ? 'breached' : s.targetHit && a.stage === 'eval' && a.status === 'active' ? 'target hit' : a.status}</span>
      </div>
      <div className="row big">
        <span>{usd(s.balance)}</span>
        <span className={pnlClass(s.profit)}>{s.profit >= 0 ? '+' : ''}{usd(s.profit)}</span>
      </div>
      {s.targetProgress !== undefined && (
        <>
          <div className="row muted"><span>Profit target</span><div className="spacer" /><span>{usd(Math.max(0, s.profit))} / {usd(a.profitTarget!)}</span></div>
          <Bar value={s.targetProgress} />
        </>
      )}
      <div className="row muted"><span>Drawdown room ({a.drawdownType})</span><div className="spacer" /><span>{usd(s.room)} · breach at {usd(s.threshold)}</span></div>
      <Bar value={roomPct} danger={roomPct < 0.3} />
      {s.paidOut > 0 && <div className="row muted"><span>Paid out</span><div className="spacer" /><span className="pos">{usd(s.paidOut)}</span></div>}
      <div className="row muted">
        <span>Today {usd(s.todayPnl)}{s.dailyRoom !== undefined && ` · ${usd(s.dailyRoom)} left today`}</span>
        <div className="spacer" />
        <span>{s.tradingDays}{a.minTradingDays ? ` / ${a.minTradingDays}` : ''} days</span>
      </div>
    </div>
  )
}

function AccountForm({ account, onClose }: { account: PropAccount; onClose: () => void }) {
  const [a, setA] = useState(account)
  const [confirming, setConfirming] = useState(false)
  const toast = useToast()
  const isNew = !account.name && !account.firm
  const set = <K extends keyof PropAccount>(k: K, v: PropAccount[K]) => setA({ ...a, [k]: v })
  const money = (k: 'startingBalance' | 'maxDrawdown') => (
    <input type="number" value={a[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} />
  )
  const optional = (k: 'profitTarget' | 'dailyLossLimit' | 'drawdownLockBalance' | 'minTradingDays' | 'adjustments') => (
    <input type="number" value={a[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? undefined : parseFloat(e.target.value))} />
  )
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); await saveAccount(a); onClose(); toast(isNew ? 'Account added' : 'Account saved') }}>
      <label>Name<input value={a.name} placeholder="e.g. Apex 50K #3" onChange={(e) => set('name', e.target.value)} /></label>
      <label>Firm<input value={a.firm} placeholder="Apex, Topstep, MFFU..." onChange={(e) => set('firm', e.target.value)} /></label>
      <label>Type
        <select value={a.stage} onChange={(e) => set('stage', e.target.value as PropAccount['stage'])}>
          <option value="eval">Evaluation</option><option value="funded">Funded</option>
        </select>
      </label>
      <label>Status
        <select value={a.status} onChange={(e) => set('status', e.target.value as PropAccount['status'])}>
          <option value="active">Active</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="closed">Closed</option>
        </select>
      </label>
      <label>Starting balance{money('startingBalance')}</label>
      <label>Profit target{optional('profitTarget')}</label>
      <label>Max drawdown{money('maxDrawdown')}</label>
      <label>Drawdown type
        <select value={a.drawdownType} onChange={(e) => set('drawdownType', e.target.value as PropAccount['drawdownType'])}>
          <option value="trailing">Trailing</option><option value="eod">End of day</option><option value="static">Static</option>
        </select>
      </label>
      <label>Trailing stops at balance{optional('drawdownLockBalance')}</label>
      <label>Daily loss limit{optional('dailyLossLimit')}</label>
      <label>Min trading days{optional('minTradingDays')}</label>
      <label>Balance adjustment <span className="hint">resets etc.</span>{optional('adjustments')}</label>
      {a.stage === 'funded' && <PayoutEditor payouts={a.payouts ?? []} onChange={(payouts) => setA({ ...a, payouts })} />}
      <TradovateLink value={a.tradovateAccountId} onChange={(id) => setA({ ...a, tradovateAccountId: id, brokerBalance: id === undefined ? undefined : a.brokerBalance })} />
      <div className="wide actions">
        {!isNew && (confirming ? (
          <span className="row gap">
            <span className="muted small">Delete this account? Its trades stay in your journal.</span>
            <button type="button" className="danger-btn" onClick={async () => { await deleteAccount(a.id); onClose(); toast(`Deleted ${a.name || a.firm}`, { label: 'Undo', run: () => saveAccount({ ...a, deleted: false }) }) }}>Delete</button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>Delete account</button>
        ))}
        <div className="spacer" />
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save</button>
      </div>
    </form>
  )
}

/** Picks which Tradovate account feeds this card. Hidden until Tradovate is connected in Settings. */
function TradovateLink({ value, onChange }: { value?: number; onChange: (id?: number) => void }) {
  const [accounts, setAccounts] = useState<TradovateAccount[] | null>(null)
  useEffect(() => {
    window.hub?.tradovate.status().then((s) => {
      if (s.connected) window.hub!.tradovate.accounts().then(setAccounts).catch(() => setAccounts([]))
    })
  }, [])
  if (!accounts) return null
  return (
    <label>Tradovate account
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">Not linked</option>
        {accounts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  )
}

function PayoutEditor({ payouts, onChange }: { payouts: Payout[]; onChange: (p: Payout[]) => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey())
  const total = payouts.reduce((s, p) => s + p.amount, 0)
  return (
    <div className="wide payouts">
      <div className="row">
        <span className="field-label">Payouts</span>
        <div className="spacer" />
        {total > 0 && <span className="muted small">{payouts.length} payout{payouts.length === 1 ? '' : 's'} · <span className="pos">{usd(total)}</span> total</span>}
      </div>
      {payouts.map((p, i) => (
        <div key={i} className="row payout-row">
          <span>{new Date(p.date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <div className="spacer" />
          <span className="pos">{usd(p.amount)}</span>
          <button type="button" className="icon-btn" onClick={() => onChange(payouts.filter((_, j) => j !== i))} title="Remove"><Icon name="x" size={13} /></button>
        </div>
      ))}
      <div className="row gap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" min={0} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="ghost" disabled={!Number(amount)} onClick={() => { onChange([...payouts, { date, amount: Number(amount) }].sort((x, y) => x.date.localeCompare(y.date))); setAmount('') }}>Add payout</button>
      </div>
    </div>
  )
}
