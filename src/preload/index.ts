import { contextBridge, ipcRenderer } from 'electron'
import type { ExtractedTrade } from '../main/parseTradeText'
import type { TradovateAccount, TradovateCreds, TradovateSnapshot } from '../main/tradovate'

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

const api = {
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),
  quote: (): Promise<{ price: number; time: number }> => ipcRenderer.invoke('quote'),
  tradingViewLogin: (): Promise<void> => ipcRenderer.invoke('tradingview-login'),
  /** Reads trades from a screenshot on this computer (free, offline). */
  extractTrades: (imageBase64: string): Promise<ExtractedTrade[]> => ipcRenderer.invoke('extract-trades', imageBase64),
  tradovate: {
    status: (): Promise<{ connected: boolean; env?: TradovateCreds['env']; username?: string }> => ipcRenderer.invoke('tradovate:status'),
    connect: (creds: TradovateCreds): Promise<TradovateAccount[]> => ipcRenderer.invoke('tradovate:connect', creds),
    disconnect: (): Promise<void> => ipcRenderer.invoke('tradovate:disconnect'),
    accounts: (): Promise<TradovateAccount[]> => ipcRenderer.invoke('tradovate:accounts'),
    snapshot: (): Promise<TradovateSnapshot> => ipcRenderer.invoke('tradovate:snapshot')
  }
}

contextBridge.exposeInMainWorld('hub', api)

export type HubApi = typeof api
export type { ExtractedTrade, ImageType, TradovateAccount, TradovateCreds }
