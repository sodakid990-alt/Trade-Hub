import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteAlert, newId, saveAlert, stamp } from '../lib/db'
import type { PriceAlert } from '../lib/types'

export function AlertsPage() {
  const alerts = useLiveQuery(() => db.alerts.filter((a) => !a.deleted).toArray(), [])
  const [price, setPrice] = useState('')
  const [direction, setDirection] = useState<PriceAlert['direction']>('above')
  const [note, setNote] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = parseFloat(price)
    if (!p) return
    await saveAlert({ id: newId(), symbol: 'MNQ', price: p, direction, note: note || undefined, active: true, updatedAt: stamp() })
    setPrice('')
    setNote('')
  }

  return (
    <div className="page">
      <header className="page-header"><div><h1>Alerts</h1><p className="muted">Desktop notifications when MNQ crosses your levels</p></div></header>
      <form className="card inline" onSubmit={add}>
        <span>MNQ crosses</span>
        <select value={direction} onChange={(e) => setDirection(e.target.value as PriceAlert['direction'])}>
          <option value="above">above</option><option value="below">below</option>
        </select>
        <input type="number" step="0.25" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="primary" type="submit">Add alert</button>
      </form>
      <p className="muted">Alerts are checked every 15 seconds against a free delayed MNQ quote while the app is open, and show as desktop notifications. Use them for levels you're watching, not for precise entries.</p>
      <table>
        <thead><tr><th>Level</th><th>Note</th><th>Status</th><th /></tr></thead>
        <tbody>
          {alerts?.map((a) => (
            <tr key={a.id}>
              <td>{a.direction} {a.price}</td>
              <td>{a.note}</td>
              <td>{a.active ? 'Active' : `Triggered ${a.triggeredAt ? new Date(a.triggeredAt).toLocaleString() : ''}`}</td>
              <td>
                {!a.active && <button className="link" onClick={() => saveAlert({ ...a, active: true, triggeredAt: undefined })}>Re-arm</button>}
                <button className="link" onClick={() => deleteAlert(a.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
