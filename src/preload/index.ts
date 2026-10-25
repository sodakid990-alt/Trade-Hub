import { contextBridge, ipcRenderer } from 'electron'

const api = {
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),
  quote: (): Promise<{ price: number; time: number }> => ipcRenderer.invoke('quote')
}

contextBridge.exposeInMainWorld('hub', api)

export type HubApi = typeof api
