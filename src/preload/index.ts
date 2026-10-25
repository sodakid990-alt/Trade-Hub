import { contextBridge, ipcRenderer } from 'electron'

const api = {
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body)
}

contextBridge.exposeInMainWorld('hub', api)

export type HubApi = typeof api
