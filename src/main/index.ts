import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'node:path'
import { extractTrades } from './extractTrade'
import { fetchQuote } from './quote'
import { getApiKey, setApiKey } from './secrets'
import { openTradingViewLogin, prepareTradingViewSession, TV_PARTITION } from './tradingviewLogin'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0b0e14',
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

ipcMain.handle('has-api-key', () => getApiKey() !== null)
ipcMain.handle('set-api-key', (_e, key: string) => setApiKey(key))
ipcMain.handle('extract-trades', (_e, imageBase64: string, mediaType: Parameters<typeof extractTrades>[2]) => {
  const key = getApiKey()
  if (!key) throw new Error('Add your Anthropic API key in Settings first.')
  return extractTrades(key, imageBase64, mediaType)
})

ipcMain.handle('tradingview-login', (e) => openTradingViewLogin(BrowserWindow.fromWebContents(e.sender)!))

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
  prepareTradingViewSession()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
