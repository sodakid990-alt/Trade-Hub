import { net } from 'electron'

/**
 * Last MNQ price from Yahoo Finance's public chart endpoint. Unofficial and
 * delayed (CME quotes there typically lag ~10 minutes), but free.
 */
export function parseYahooChart(json: unknown): { price: number; time: number } | null {
  const meta = (json as { chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number } }[] } })
    ?.chart?.result?.[0]?.meta
  if (typeof meta?.regularMarketPrice !== 'number') return null
  return { price: meta.regularMarketPrice, time: meta.regularMarketTime ?? Math.floor(Date.now() / 1000) }
}

export async function fetchQuote(symbol = 'MNQ=F') {
  const res = await net.fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  if (!res.ok) throw new Error(`Quote request failed (${res.status})`)
  const quote = parseYahooChart(await res.json())
  if (!quote) throw new Error('Quote missing from response')
  return quote
}
