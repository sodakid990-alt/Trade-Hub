import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteSetup, newId, saveSetup, stamp } from '../lib/db'
import { summarize } from '../lib/analytics'
import { ACCENTS } from '../lib/prefs'
import type { Setup } from '../lib/types'
import { pct, pnlClass, usd } from '../components/format'
import { Icon } from '../components/Icon'
import { useNav, useToast } from '../components/app'

const blank = (): Setup => ({ id: newId(), name: '', description: '', rules: [''], color: ACCENTS[0], updatedAt: stamp() })

export function PlaybookPage() {
  const { intent, clearIntent } = useNav()
  const toast = useToast()
  const setups = useLiveQuery(() => db.setups.filter((s) => !s.deleted).sortBy('name'), []) ?? []
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), []) ?? []
  const [editing, setEditing] = useState<Setup | null>(null)

  useEffect(() => {
    if (intent === 'add-setup') {
      setEditing(blank())
      clearIntent()
    }
  }, [intent, clearIntent])

  // Setup names used in the journal that aren't in the playbook yet.
  const unlisted = [...new Set(trades.map((t) => t.setup).filter((n): n is string => !!n))].filter(
    (n) => !setups.some((s) => s.name.toLowerCase() === n.toLowerCase())
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Playbook</h1>
          <p className="muted">Your setups, the rules for taking them, and how they actually perform.</p>
        </div>
        <button className="primary" onClick={() => setEditing(blank())}><Icon name="plus" size={16} /> Add setup</button>
      </header>

      {editing && (
        <SetupForm
          setup={editing}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            await deleteSetup(editing.id)
            setEditing(null)
            toast(`Deleted "${editing.name}"`, { label: 'Undo', run: () => saveSetup({ ...editing, deleted: false }) })
          }}
        />
      )}

      {setups.length === 0 && !editing && (
        <div className="card empty">
          <p>Write down each setup you trade, like "Opening range breakout" or "VWAP reclaim", with the rules you need to see before you take it.</p>
          <p>Then pick the setup when you log a trade and you'll see which ones really make you money.</p>
        </div>
      )}

      <div className="playbook">
        {setups.map((setup) => {
          const mine = trades.filter((t) => t.setup?.toLowerCase() === setup.name.toLowerCase())
          const s = summarize(mine)
          return (
            <div key={setup.id} className="card setup-card" style={{ borderTopColor: setup.color }} onClick={() => setEditing(setup)}>
              <div className="row">
                <h3>{setup.name}</h3>
                <div className="spacer" />
                <Icon name="edit" size={14} />
              </div>
              {setup.description && <p className="muted">{setup.description}</p>}
              {setup.rules.filter(Boolean).length > 0 && (
                <ul className="rules">
                  {setup.rules.filter(Boolean).map((r, i) => <li key={i}><Icon name="check" size={13} /> {r}</li>)}
                </ul>
              )}
              <div className="setup-stats">
                <div><span className="muted">Trades</span><strong>{s.trades}</strong></div>
                <div><span className="muted">Win rate</span><strong>{s.trades ? pct(s.winRate) : '—'}</strong></div>
                <div><span className="muted">Avg</span><strong className={pnlClass(s.expectancy)}>{s.trades ? usd(s.expectancy) : '—'}</strong></div>
                <div><span className="muted">Total</span><strong className={pnlClass(s.netPnl)}>{usd(s.netPnl)}</strong></div>
              </div>
            </div>
          )
        })}
      </div>

      {unlisted.length > 0 && (
        <p className="muted small">
          Setups in your journal not in the playbook yet:{' '}
          {unlisted.map((n) => (
            <button key={n} className="chip" onClick={() => setEditing({ ...blank(), name: n })}>+ {n}</button>
          ))}
        </p>
      )}
    </div>
  )
}

function SetupForm({ setup, onClose, onDelete }: { setup: Setup; onClose: () => void; onDelete: () => void }) {
  const [s, setS] = useState(setup)
  const isNew = !setup.name
  const setRule = (i: number, v: string) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? v : r)) })
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (s.name.trim()) { await saveSetup({ ...s, name: s.name.trim(), rules: s.rules.filter((r) => r.trim()) }); onClose() } }}>
      <label>Name<input autoFocus value={s.name} placeholder="e.g. Opening range breakout" onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
      <label>Color
        <div className="swatches">
          {ACCENTS.map((c) => <button type="button" key={c} className={`swatch ${s.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setS({ ...s, color: c })} />)}
        </div>
      </label>
      <label className="wide">Description<input value={s.description ?? ''} placeholder="What the setup is, in a sentence" onChange={(e) => setS({ ...s, description: e.target.value })} /></label>
      <div className="wide rules-edit">
        <span className="muted small">Rules (what you need to see before taking it)</span>
        {s.rules.map((r, i) => (
          <div key={i} className="row">
            <input value={r} placeholder={['Price above VWAP', 'Clean break of the first 15-min range', 'Stop below the range'][i] ?? 'Another rule'} onChange={(e) => setRule(i, e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="icon-btn" onClick={() => setS({ ...s, rules: s.rules.filter((_, j) => j !== i) })} title="Remove rule"><Icon name="x" size={14} /></button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => setS({ ...s, rules: [...s.rules, ''] })}>+ Add rule</button>
      </div>
      <div className="wide actions">
        {!isNew && <button type="button" className="link danger" onClick={onDelete}>Delete setup</button>}
        <div className="spacer" />
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Save setup</button>
      </div>
    </form>
  )
}
