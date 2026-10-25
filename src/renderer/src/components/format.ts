export const usd = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`
export const pnlClass = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
