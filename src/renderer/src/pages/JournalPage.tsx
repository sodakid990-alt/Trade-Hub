import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrade, importTrades, newId, restoreTrade, saveTrade, stamp } from '../lib/db'
import { detectAndParse } from '../lib/importCsv'
import { netPnl, rMultiple } from '../lib/analytics'
import { isSupportedImage, readTradesFromScreenshot } from '../lib/screenshot'
import { defaultFees, tickValue, updatePrefs, usePrefsLoaded, withDefaultFees } from '../lib/prefs'
import type { Prefs, PropAccount, Setup, Trade } from '../lib/types'
import { pnlClass, usd } from '../components/format'
import { Icon } from '../components/Icon'
import { useNav, useToast } from '../components/app'

const blank = (prefs: Prefs, accountId?: string): Trade => ({
  id: newId(), symbol: prefs.defaultSymbol, side: 'long', qty: 1, entryPrice: 0, exitPrice: 0,
  entryTime: stamp(), exitTime: stamp(), fees: defaultFees(1, prefs), accountId, tags: [], updatedAt: stamp()
})

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const clean = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function JournalPage() {
  const [prefs, prefsLoaded] = usePrefsLoaded()
  const toast = useToast()
  const { intent, clearIntent } = useNav()
  const trades = useLiveQuery(() => db.trades.orderBy('exitTime').reverse().filter((t) => !t.deleted).toArray(), [])
  const allAccounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), []) ?? []
  const setups = useLiveQuery(() => db.setups.filter((s) => !s.deleted).sortBy('name'), []) ?? []
  const activeAccounts = allAccounts.filter((a) => a.status === 'active')
  const [account, setAccount] = useState<string | null>(null)
  const currentAccount = account ?? prefs.defaultAccountId ?? ''
  // Trades being edited: a manual entry, an existing trade, or drafts read from a screenshot.
  const [drafts, setDrafts] = useState<Trade[]>([])
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'busy'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const accountName = (id?: string) => allAccounts.find((a) => a.id === id)?.name ?? ''

  useEffect(() => {
    if (!prefsLoaded) return
    if (intent === 'new-trade') setDrafts([blank(prefs, currentAccount || undefined)])
    if (intent === 'screenshot') picker.current?.click()
    if (intent) clearIntent()
  }, [intent, clearIntent, prefs, prefsLoaded, currentAccount])

  const onScreenshot = useCallback(
    async (file: File) => {
      setStatus({ kind: 'busy', text: 'Reading screenshot…' })
      try {
        const found = withDefaultFees(await readTradesFromScreenshot(file, currentAccount || undefined), prefs)
        if (!found.length) return setStatus({ kind: 'error', text: "Couldn't read a trade from that screenshot. Try a tighter crop of the fills or Performance tab, or add it by hand." })
        setDrafts(found)
        setStatus({ kind: 'info', text: `Found ${found.length} trade${found.length > 1 ? 's' : ''}. Double-check the numbers, then save.` })
      } catch (e) {
        setStatus({ kind: 'error', text: clean(e) })
      }
    },
    [currentAccount, prefs]
  )

  const onCsv = async (file: File) => {
    try {
      const added = await importTrades(withDefaultFees(detectAndParse(await file.text()), prefs), currentAccount || undefined)
      setStatus(null)
      toast(added ? `Imported ${added} new trade${added === 1 ? '' : 's'}` : 'No new trades in that file')
    } catch (e) {
      setStatus({ kind: 'error', text: clean(e) })
    }
  }

  // Paste a screenshot from the clipboard anywhere on this page; N starts a new trade.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(isSupportedImage)
      if (file) {
        e.preventDefault()
        onScreenshot(file)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (!typing && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setDrafts([blank(prefs, currentAccount || undefined)])
      }
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  }, [onScreenshot, prefs, currentAccount])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (file.name.toLowerCase().endsWith('.csv')) onCsv(file)
    else onScreenshot(file)
  }

  const remove = async (t: Trade) => {
    await deleteTrade(t.id)
    toast(`Deleted ${t.side} ${t.symbol} (${usd(netPnl(t))})`, { label: 'Undo', run: () => restoreTrade(t.id) })
  }

  const closeDraft = (id: string) => setDrafts((ds) => ds.filter((d) => d.id !== id))
  const q = query.trim().toLowerCase()
  const shown = (trades ?? []).filter(
    (t) => !q || [t.symbol, t.side, t.setup, t.notes, accountName(t.accountId), ...t.tags].some((f) => f?.toLowerCase().includes(q))
  )

  return (
    <div className="page" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <header className="page-header">
        <div>
          <h1>Journal</h1>
          <p className="muted">{trades?.length ?? 0} trades logged · press N for a new trade</p>
        </div>
        <div className="row gap">
          <select value={currentAccount} onChange={(e) => setAccount(e.target.value)} title="Account for new and imported trades">
            <option value="">No account</option>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.firm}</option>)}
          </select>
          <label className="button ghost">
            <Icon name="upload" size={16} /> Import CSV
            <input type="file" accept=".csv" hidden onChange={(e) => { if (e.target.files?.[0]) onCsv(e.target.files[0]); e.target.value = '' }} />
          </label>
          <button className="primary" onClick={() => setDrafts([blank(prefs, currentAccount || undefined)])}>
            <Icon name="plus" size={16} /> New trade
          </button>
        </div>
      </header>

      <label className={`dropzone ${dragging ? 'over' : ''} ${status?.kind === 'busy' ? 'busy' : ''}`}>
        <Icon name="image" size={22} />
        <div>
          <strong>{status?.kind === 'busy' ? 'Reading screenshot…' : 'Add a trade from a screenshot'}</strong>
          <div className="muted small">Drop an image here, paste with {navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}+V, or click to choose. Read on this computer for free. Clear, uncropped screenshots of your fills or Performance tab work best.</div>
        </div>
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { if (e.target.files?.[0]) onScreenshot(e.target.files[0]); e.target.value = '' }} />
      </label>

      {status && status.kind !== 'busy' && (
        <div className={`notice ${status.kind}`}>
          {status.text}
          <button className="icon-btn" onClick={() => setStatus(null)} title="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      {drafts.map((d) => (
        <TradeForm
          key={d.id}
          trade={d}
          accounts={allAccounts}
          setups={setups}
          prefs={prefs}
          onClose={() => closeDraft(d.id)}
          onSaved={() => { closeDraft(d.id); toast('Trade saved') }}
        />
      ))}

      {(trades?.length ?? 0) > 0 && (
        <div className="search">
          <Icon name="search" size={15} />
          <input value={query} placeholder="Search by setup, tag, account or notes" onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="card flush">
        <table>
          <thead>
            <tr><th>Closed</th><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th className="num">P&L</th><th className="num">R</th><th>Account</th><th>Setup</th><th>Tags</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const pnl = netPnl(t)
              const r = rMultiple(t)
              return (
                <tr key={t.id} onClick={() => setDrafts([t])} title={t.notes || 'Click to edit'}>
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
                  <td><button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); remove(t) }}><Icon name="trash" size={15} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {trades?.length === 0 && <div className="empty">No trades yet. Drop a screenshot above, import your broker's CSV, or press N to add one by hand.</div>}
        {trades && trades.length > 0 && shown.length === 0 && <div className="empty">No trades match "{query}".</div>}
      </div>
    </div>
  )
}

function TradeForm({ trade, accounts, setups, prefs, onClose, onSaved }: { trade: Trade; accounts: PropAccount[]; setups: Setup[]; prefs: Prefs; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState(trade)
  const [newTag, setNewTag] = useState('')
  const set = <K extends keyof Trade>(k: K, v: Trade[K]) => setT((cur) => ({ ...cur, [k]: v }))
  const num = (k: 'entryPrice' | 'exitPrice' | 'fees') => (
    <input type="number" step={k === 'fees' ? '0.01' : '0.25'} value={t[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} />
  )
  // Keep fees in step with contracts while they still match the default commission.
  const setQty = (qty: number) =>
    setT((cur) => ({ ...cur, qty, fees: cur.fees === defaultFees(cur.qty, prefs) ? defaultFees(qty, prefs) : cur.fees }))
  const toggleTag = (tag: string) => set('tags', t.tags.includes(tag) ? t.tags.filter((x) => x !== tag) : [...t.tags, tag])
  const addTag = () => {
    const tag = newTag.trim()
    if (!tag) return
    if (!t.tags.includes(tag)) set('tags', [...t.tags, tag])
    if (!prefs.tags.includes(tag)) updatePrefs({ tags: [...prefs.tags, tag] })
    setNewTag('')
  }
  const preview = netPnl(t)
  const points = (t.exitPrice - t.entryPrice) * (t.side === 'long' ? 1 : -1)
  const allTags = [...new Set([...prefs.tags, ...t.tags])]
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); await saveTrade(t); onSaved() }}>
      <div className="form-head wide">
        <h3>{t.symbol || 'Trade'} <span className={`side ${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span></h3>
        <span className="muted small">{t.entryPrice && t.exitPrice ? `${points >= 0 ? '+' : ''}${points.toFixed(2)} pts · ${usd(tickValue(t.symbol))}/tick` : ''}</span>
        <div className="spacer" />
        <span className={`pnl-preview ${pnlClass(preview)}`}>{usd(preview)}</span>
      </div>
      <label>Symbol<input value={t.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} /></label>
      <label>Side
        <div className="segmented">
          <button type="button" className={t.side === 'long' ? 'active long' : ''} onClick={() => set('side', 'long')}>Long</button>
          <button type="button" className={t.side === 'short' ? 'active short' : ''} onClick={() => set('side', 'short')}>Short</button>
        </div>
      </label>
      <label>Contracts<input type="number" min={1} value={t.qty} onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)} /></label>
      <label>Entry{num('entryPrice')}</label>
      <label>Exit{num('exitPrice')}</label>
      <label>Stop <span className="hint">for R-multiple</span>
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
      <div className="wide chip-field">
        <span className="field-label">Setup</span>
        <div className="chips">
          {setups.map((s) => (
            <button type="button" key={s.id} className={`chip ${t.setup === s.name ? 'active' : ''}`} style={t.setup === s.name ? { borderColor: s.color, background: s.color + '26' } : undefined} onClick={() => set('setup', t.setup === s.name ? undefined : s.name)}>
              {s.name}
            </button>
          ))}
          <input className="chip-input" value={setups.some((s) => s.name === t.setup) ? '' : t.setup ?? ''} placeholder={setups.length ? 'Other…' : 'e.g. ORB, VWAP reclaim'} onChange={(e) => set('setup', e.target.value || undefined)} />
        </div>
      </div>
      <div className="wide chip-field">
        <span className="field-label">Tags</span>
        <div className="chips">
          {allTags.map((tag) => (
            <button type="button" key={tag} className={`chip ${t.tags.includes(tag) ? 'active' : ''}`} onClick={() => toggleTag(tag)}>{tag}</button>
          ))}
          <input className="chip-input" value={newTag} placeholder="+ New tag" onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} onBlur={addTag} />
        </div>
      </div>
      <label className="wide">Notes<textarea rows={3} value={t.notes ?? ''} placeholder="Why did you take it? How did you feel? What would you do differently?" onChange={(e) => set('notes', e.target.value)} /></label>
      <div className="wide actions">
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save trade</button>
      </div>
    </form>
  )
}
