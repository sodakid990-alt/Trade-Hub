import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrade, importTrades, newId, saveTrade, stamp } from '../lib/db'
import { detectAndParse } from '../lib/importCsv'
import { netPnl, rMultiple } from '../lib/analytics'
import { isSupportedImage, readTradesFromScreenshot } from '../lib/screenshot'
import type { PropAccount, Trade } from '../lib/types'
import { pnlClass, usd } from '../components/format'
import { Icon } from '../components/Icon'

const blank = (accountId?: string): Trade => ({
  id: newId(), symbol: 'MNQ', side: 'long', qty: 1, entryPrice: 0, exitPrice: 0,
  entryTime: stamp(), exitTime: stamp(), fees: 0, accountId, tags: [], updatedAt: stamp()
})

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function JournalPage() {
  const trades = useLiveQuery(() => db.trades.orderBy('exitTime').reverse().filter((t) => !t.deleted).toArray(), [])
  const allAccounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), []) ?? []
  const activeAccounts = allAccounts.filter((a) => a.status === 'active')
  const [account, setAccount] = useState('')
  // Trades being edited: a manual entry, an existing trade, or drafts read from a screenshot.
  const [drafts, setDrafts] = useState<Trade[]>([])
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'busy'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const accountName = (id?: string) => allAccounts.find((a) => a.id === id)?.name ?? ''

  const onScreenshot = useCallback(
    async (file: File) => {
      setStatus({ kind: 'busy', text: 'Reading screenshot…' })
      try {
        const found = await readTradesFromScreenshot(file, account || undefined)
        if (!found.length) return setStatus({ kind: 'error', text: "Couldn't find a completed trade in that screenshot." })
        setDrafts(found)
        setStatus({ kind: 'info', text: `Found ${found.length} trade${found.length > 1 ? 's' : ''}. Check the details, then save.` })
      } catch (e) {
        setStatus({ kind: 'error', text: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
      }
    },
    [account]
  )

  const onCsv = async (file: File) => {
    try {
      const added = await importTrades(detectAndParse(await file.text()), account || undefined)
      setStatus({ kind: 'info', text: `Imported ${added} new trade${added === 1 ? '' : 's'}.` })
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message })
    }
  }

  // Paste a screenshot from the clipboard anywhere on this page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(isSupportedImage)
      if (file) {
        e.preventDefault()
        onScreenshot(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onScreenshot])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (file.name.toLowerCase().endsWith('.csv')) onCsv(file)
    else onScreenshot(file)
  }

  const closeDraft = (id: string) => setDrafts((ds) => ds.filter((d) => d.id !== id))

  return (
    <div className="page" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <header className="page-header">
        <div>
          <h1>Journal</h1>
          <p className="muted">{trades?.length ?? 0} trades logged</p>
        </div>
        <div className="row gap">
          <select value={account} onChange={(e) => setAccount(e.target.value)} title="Account for new trades">
            <option value="">No account</option>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.firm}</option>)}
          </select>
          <label className="button ghost">
            <Icon name="upload" size={16} /> Import CSV
            <input type="file" accept=".csv" hidden onChange={(e) => { if (e.target.files?.[0]) onCsv(e.target.files[0]); e.target.value = '' }} />
          </label>
          <button className="primary" onClick={() => setDrafts([blank(account || undefined)])}>
            <Icon name="plus" size={16} /> New trade
          </button>
        </div>
      </header>

      <label className={`dropzone ${dragging ? 'over' : ''} ${status?.kind === 'busy' ? 'busy' : ''}`}>
        <Icon name="image" size={22} />
        <div>
          <strong>{status?.kind === 'busy' ? 'Reading screenshot…' : 'Add a trade from a screenshot'}</strong>
          <div className="muted small">Drop an image here, paste with {navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}+V, or click to choose. Works with Tradovate, NinjaTrader, Rithmic and TradingView.</div>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { if (e.target.files?.[0]) onScreenshot(e.target.files[0]); e.target.value = '' }} />
      </label>

      {status && status.kind !== 'busy' && <div className={`notice ${status.kind}`}>{status.text}</div>}

      {drafts.map((d) => (
        <TradeForm key={d.id} trade={d} accounts={allAccounts} onClose={() => closeDraft(d.id)} />
      ))}

      <div className="card flush">
        <table>
          <thead>
            <tr><th>Closed</th><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th className="num">P&L</th><th className="num">R</th><th>Account</th><th>Setup</th><th>Tags</th><th /></tr>
          </thead>
          <tbody>
            {trades?.map((t) => {
              const pnl = netPnl(t)
              const r = rMultiple(t)
              return (
                <tr key={t.id} onClick={() => setDrafts([t])}>
                  <td>{new Date(t.exitTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td><strong>{t.symbol}</strong></td>
                  <td><span className={`side ${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span></td>
                  <td className="num">{t.qty}</td>
                  <td className="num">{t.entryPrice.toFixed(2)}</td>
                  <td className="num">{t.exitPrice.toFixed(2)}</td>
                  <td className={`num ${pnlClass(pnl)}`}><strong>{usd(pnl)}</strong></td>
                  <td className="num">{r === undefined ? '' : r.toFixed(2) + 'R'}</td>
                  <td className="muted">{accountName(t.accountId)}</td>
                  <td>{t.setup}</td>
                  <td>{t.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</td>
                  <td><button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); deleteTrade(t.id) }}><Icon name="trash" size={15} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {trades?.length === 0 && <div className="empty">No trades yet. Drop a screenshot above, import your broker's CSV, or add one by hand.</div>}
      </div>
    </div>
  )
}

function TradeForm({ trade, accounts, onClose }: { trade: Trade; accounts: PropAccount[]; onClose: () => void }) {
  const [t, setT] = useState(trade)
  const set = <K extends keyof Trade>(k: K, v: Trade[K]) => setT({ ...t, [k]: v })
  const num = (k: 'qty' | 'entryPrice' | 'exitPrice' | 'fees') => (
    <input type="number" step="0.25" value={t[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} />
  )
  const preview = netPnl(t)
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); await saveTrade(t); onClose() }}>
      <div className="form-head wide">
        <h3>{t.symbol || 'Trade'} <span className={`side ${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span></h3>
        <span className={`pnl-preview ${pnlClass(preview)}`}>{usd(preview)}</span>
      </div>
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
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save trade</button>
      </div>
    </form>
  )
}
