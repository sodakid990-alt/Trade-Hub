import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrade, importTrades, newId, saveTrade, stamp } from '../lib/db'
import { detectAndParse } from '../lib/importCsv'
import { netPnl, rMultiple } from '../lib/analytics'
import type { PropAccount, Trade } from '../lib/types'
import { pnlClass, usd } from '../components/format'

const blank = (): Trade => ({
  id: newId(), symbol: 'MNQ', side: 'long', qty: 1, entryPrice: 0, exitPrice: 0,
  entryTime: stamp(), exitTime: stamp(), fees: 0, tags: [], updatedAt: stamp()
})

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function JournalPage() {
  const trades = useLiveQuery(() => db.trades.orderBy('exitTime').reverse().filter((t) => !t.deleted).toArray(), [])
  const [editing, setEditing] = useState<Trade | null>(null)
  const [msg, setMsg] = useState('')
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted && a.status === 'active').toArray(), [])
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [])
  const [importAccount, setImportAccount] = useState('')
  const accountName = (id?: string) => allAccounts?.find((a) => a.id === id)?.name ?? ''

  const onImport = async (file: File) => {
    try {
      const added = await importTrades(detectAndParse(await file.text()), importAccount || undefined)
      setMsg(`Imported ${added} new trades`)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="page">
      <header className="toolbar">
        <h2>Journal</h2>
        <div className="spacer" />
        <span className="muted">{msg}</span>
        <select value={importAccount} onChange={(e) => setImportAccount(e.target.value)} title="Account for imported trades">
          <option value="">Import into: no account</option>
          {accounts?.map((a) => <option key={a.id} value={a.id}>Import into: {a.name || a.firm}</option>)}
        </select>
        <label className="button">
          Import CSV
          <input type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </label>
        <button onClick={() => setEditing(blank())}>New trade</button>
      </header>
      {editing && <TradeForm trade={editing} accounts={allAccounts?.filter((a) => !a.deleted) ?? []} onClose={() => setEditing(null)} />}
      <table>
        <thead>
          <tr><th>Exit</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&L</th><th>R</th><th>Account</th><th>Setup</th><th>Tags</th><th /></tr>
        </thead>
        <tbody>
          {trades?.map((t) => {
            const pnl = netPnl(t)
            const r = rMultiple(t)
            return (
              <tr key={t.id} onClick={() => setEditing(t)}>
                <td>{new Date(t.exitTime).toLocaleString()}</td>
                <td>{t.symbol}</td>
                <td>{t.side}</td>
                <td>{t.qty}</td>
                <td>{t.entryPrice}</td>
                <td>{t.exitPrice}</td>
                <td className={pnlClass(pnl)}>{usd(pnl)}</td>
                <td>{r === undefined ? '' : r.toFixed(2) + 'R'}</td>
                <td>{accountName(t.accountId)}</td>
                <td>{t.setup}</td>
                <td>{t.tags.join(', ')}</td>
                <td><button className="link" onClick={(e) => { e.stopPropagation(); deleteTrade(t.id) }}>Delete</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {trades?.length === 0 && <p className="muted">No trades yet. Import your broker's CSV or add one by hand.</p>}
    </div>
  )
}

function TradeForm({ trade, accounts, onClose }: { trade: Trade; accounts: PropAccount[]; onClose: () => void }) {
  const [t, setT] = useState(trade)
  const set = <K extends keyof Trade>(k: K, v: Trade[K]) => setT({ ...t, [k]: v })
  const num = (k: 'qty' | 'entryPrice' | 'exitPrice' | 'fees') => (
    <input type="number" step="0.25" value={t[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} />
  )
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); await saveTrade(t); onClose() }}>
      <label>Symbol<input value={t.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} /></label>
      <label>Side
        <select value={t.side} onChange={(e) => set('side', e.target.value as Trade['side'])}>
          <option value="long">Long</option><option value="short">Short</option>
        </select>
      </label>
      <label>Contracts{num('qty')}</label>
      <label>Entry{num('entryPrice')}</label>
      <label>Exit{num('exitPrice')}</label>
      <label>Stop
        <input type="number" step="0.25" value={t.stopPrice ?? ''} onChange={(e) => set('stopPrice', e.target.value ? parseFloat(e.target.value) : undefined)} />
      </label>
      <label>Fees{num('fees')}</label>
      <label>Entry time<input type="datetime-local" value={toLocalInput(t.entryTime)} onChange={(e) => set('entryTime', new Date(e.target.value).toISOString())} /></label>
      <label>Exit time<input type="datetime-local" value={toLocalInput(t.exitTime)} onChange={(e) => set('exitTime', new Date(e.target.value).toISOString())} /></label>
      <label>Account
        <select value={t.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || undefined)}>
          <option value="">None</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.firm}</option>)}
        </select>
      </label>
      <label>Setup<input value={t.setup ?? ''} placeholder="e.g. ORB, VWAP reclaim" onChange={(e) => set('setup', e.target.value)} /></label>
      <label>Tags<input value={t.tags.join(', ')} placeholder="FOMO, A+ setup" onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></label>
      <label className="wide">Notes<textarea rows={3} value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
      <div className="wide actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save</button>
      </div>
    </form>
  )
}
