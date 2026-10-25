import { newId, stamp } from './db'
import type { Trade } from './types'
import type { ExtractedTrade, ImageType } from '../../../preload'

const TYPES: ImageType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function isSupportedImage(file: File) {
  return TYPES.includes(file.type as ImageType)
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** "2026-10-24T09:31:05" (local, no zone) -> ISO; falls back to now. */
const localToIso = (s: string | null) => {
  const d = s ? new Date(s) : new Date()
  return isNaN(d.getTime()) ? stamp() : d.toISOString()
}

export function toTradeDraft(x: ExtractedTrade, accountId?: string): Trade {
  return {
    id: newId(),
    symbol: x.symbol.toUpperCase(),
    side: x.side,
    qty: x.qty,
    entryPrice: x.entryPrice,
    exitPrice: x.exitPrice,
    stopPrice: x.stopPrice ?? undefined,
    entryTime: localToIso(x.entryTime ?? x.exitTime),
    exitTime: localToIso(x.exitTime ?? x.entryTime),
    fees: x.fees ?? 0,
    pnlOverride: x.pnl ?? undefined,
    accountId,
    tags: [],
    updatedAt: stamp()
  }
}

export async function readTradesFromScreenshot(file: File, accountId?: string): Promise<Trade[]> {
  if (!window.hub) throw new Error('Screenshot reading needs the desktop app.')
  if (!isSupportedImage(file)) throw new Error('Use a PNG, JPG, WebP or GIF screenshot.')
  const extracted = await window.hub.extractTrades(await toBase64(file), file.type as ImageType)
  return extracted.map((x) => toTradeDraft(x, accountId))
}
