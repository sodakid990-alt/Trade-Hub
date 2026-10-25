/** Dollar value of one full point, per contract. */
export const POINT_VALUE: Record<string, number> = {
  MNQ: 2,
  NQ: 20,
  MES: 5,
  ES: 50
}

/** "MNQZ6" -> "MNQ" */
export function rootSymbol(symbol: string): string {
  const m = symbol.toUpperCase().match(/^([A-Z]+?)[FGHJKMNQUVXZ]\d{1,2}$/)
  return m ? m[1] : symbol.toUpperCase()
}

export function pointValue(symbol: string): number {
  return POINT_VALUE[rootSymbol(symbol)] ?? 1
}
