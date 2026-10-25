import { db, saveAlert } from './db'
import type { PriceAlert } from './types'

/** Returns alerts crossed by a move from prev to price. */
export function crossed(alerts: PriceAlert[], prev: number, price: number): PriceAlert[] {
  return alerts.filter(
    (a) =>
      a.active &&
      !a.deleted &&
      ((a.direction === 'above' && prev < a.price && price >= a.price) ||
        (a.direction === 'below' && prev > a.price && price <= a.price))
  )
}

export async function checkAlerts(symbol: string, prev: number, price: number) {
  const active = await db.alerts.filter((a) => a.active && !a.deleted && a.symbol === symbol).toArray()
  for (const a of crossed(active, prev, price)) {
    await saveAlert({ ...a, active: false, triggeredAt: new Date().toISOString() })
    const title = `${a.symbol} ${a.direction === 'above' ? 'crossed above' : 'crossed below'} ${a.price}`
    if (window.hub) window.hub.notify(title, a.note ?? `Last ${price}`)
    else new Notification(title, { body: a.note ?? `Last ${price}` })
  }
}
