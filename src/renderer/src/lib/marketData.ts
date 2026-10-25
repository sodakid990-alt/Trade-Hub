import type { Bar } from './types'

/**
 * A market data source. The real provider (broker API or data vendor) plugs in
 * behind this interface; the demo feed below lets charts and alerts run without one.
 */
export interface MarketDataFeed {
  name: string
  history(symbol: string, timeframeSec: number, count: number): Promise<Bar[]>
  /** Calls back on every tick with the updated current bar. Returns an unsubscribe. */
  subscribe(symbol: string, timeframeSec: number, onBar: (bar: Bar) => void): () => void
}

/** Random-walk MNQ prices on the 0.25 tick grid. Not real market data. */
export class DemoFeed implements MarketDataFeed {
  name = 'Demo (simulated)'
  private last = 21000

  private step(price: number) {
    return Math.round((price + (Math.random() - 0.5) * 6) * 4) / 4
  }

  async history(_symbol: string, tf: number, count: number): Promise<Bar[]> {
    const now = Math.floor(Date.now() / 1000 / tf) * tf
    const bars: Bar[] = []
    let price = 21000
    for (let i = count; i > 0; i--) {
      const open = price
      let high = open
      let low = open
      for (let k = 0; k < 10; k++) {
        price = this.step(price)
        high = Math.max(high, price)
        low = Math.min(low, price)
      }
      bars.push({ time: now - i * tf, open, high, low, close: price, volume: Math.round(Math.random() * 2000) })
    }
    this.last = price
    return bars
  }

  subscribe(_symbol: string, tf: number, onBar: (bar: Bar) => void) {
    let bar: Bar | null = null
    const timer = setInterval(() => {
      const time = Math.floor(Date.now() / 1000 / tf) * tf
      this.last = this.step(this.last)
      if (!bar || bar.time !== time) bar = { time, open: this.last, high: this.last, low: this.last, close: this.last }
      bar = { ...bar, high: Math.max(bar.high, this.last), low: Math.min(bar.low, this.last), close: this.last }
      onBar(bar)
    }, 500)
    return () => clearInterval(timer)
  }
}

export const feed: MarketDataFeed = new DemoFeed()
