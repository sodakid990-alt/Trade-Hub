import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'node:path'
import { fetchQuote } from './quote'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0e1117',
    title: 'Trading Hub',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, webviewTag: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('notify', (_e, title: string, body: string) => {
  new Notification({ title, body, urgency: 'critical' }).show()
})

ipcMain.handle('quote', () => fetchQuote())

const TV_PARTITION = 'persist:tradingview'

app.on('web-contents-created', (_e, contents) => {
  // Only allow the TradingView webview, with no Node access.
  contents.on('will-attach-webview', (event, prefs, params) => {
    if (params.partition !== TV_PARTITION || !params.src.startsWith('https://www.tradingview.com/')) event.preventDefault()
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
  })
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
