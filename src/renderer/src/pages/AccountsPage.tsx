import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteAccount, newId, saveAccount, stamp } from '../lib/db'
import { accountStatus } from '../lib/propAccounts'
import type { PropAccount } from '../lib/types'
import { pnlClass, usd } from '../components/format'

const blank = (): PropAccount => ({
  id: newId(), name: '', firm: '', stage: 'eval', status: 'active', startingBalance: 50000,
  profitTarget: 3000, maxDrawdown: 2500, drawdownType: 'trailing', updatedAt: stamp()
})

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), [])
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted && !!t.accountId).toArray(), [])
  const [editing, setEditing] = useState<PropAccount | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const shown = (accounts ?? []).filter((a) => showClosed || a.status === 'active')
  const groups: [string, PropAccount[]][] = [
    ['Funded', shown.filter((a) => a.stage === 'funded')],
    ['Evaluations', shown.filter((a) => a.stage === 'eval')]
  ]
  const totals = (accounts ?? []).filter((a) => a.stage === 'funded' && a.status === 'active').reduce(
    (acc, a) => {
      const s = accountStatus(a, (trades ?? []).filter((t) => t.accountId === a.id))
      return { profit: acc.profit + s.profit, room: acc.room + s.room }
    },
    { profit: 0, room: 0 }
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Prop firm evaluations and funded accounts</p>
        </div>
        <div className="row gap">
        <label className="muted"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed</label>
        <button className="primary" onClick={() => setEditing(blank())}>Add account</button>
        </div>
      </header>
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} />}
      <div className="stats">
        <div className="card stat"><div className="muted">Active funded</div><div className="value">{(accounts ?? []).filter((a) => a.stage === 'funded' && a.status === 'active').length}</div></div>
        <div className="card stat"><div className="muted">Active evals</div><div className="value">{(accounts ?? []).filter((a) => a.stage === 'eval' && a.status === 'active').length}</div></div>
        <div className="card stat"><div className="muted">Funded profit</div><div className={`value ${pnlClass(totals.profit)}`}>{usd(totals.profit)}</div></div>
        <div className="card stat"><div className="muted">Funded drawdown room</div><div className="value">{usd(totals.room)}</div></div>
      </div>
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
      {accounts?.length === 0 && <p className="muted">Add your evals and funded accounts, then pick the account when you import or log trades.</p>}
    </div>
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
  const set = <K extends keyof PropAccount>(k: K, v: PropAccount[K]) => setA({ ...a, [k]: v })
  const money = (k: 'startingBalance' | 'maxDrawdown') => (
    <input type="number" value={a[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} />
  )
  const optional = (k: 'profitTarget' | 'dailyLossLimit' | 'drawdownLockBalance' | 'minTradingDays' | 'adjustments') => (
    <input type="number" value={a[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? undefined : parseFloat(e.target.value))} />
  )
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); await saveAccount(a); onClose() }}>
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
      <label>Payouts / adjustments{optional('adjustments')}</label>
      <div className="wide actions">
        <button type="button" className="link" onClick={async () => { await deleteAccount(a.id); onClose() }}>Delete</button>
        <div className="spacer" />
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save</button>
      </div>
    </form>
  )
}
