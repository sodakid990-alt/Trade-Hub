import { BrowserWindow, session, shell } from 'electron'

export const TV_PARTITION = 'persist:tradingview'

// Identity providers TradingView's sign-in page opens in a popup.
const SIGN_IN_HOSTS = ['accounts.google.com', 'appleid.apple.com']

const isSignInHost = (url: string) => {
  const { protocol, hostname } = new URL(url)
  return protocol === 'https:' && (hostname === 'www.tradingview.com' || SIGN_IN_HOSTS.includes(hostname))
}

/**
 * Google refuses to sign in from browsers that identify as Electron, so the
 * TradingView session presents the plain Chrome user agent it is built on.
 */
export function prepareTradingViewSession() {
  const tv = session.fromPartition(TV_PARTITION)
  tv.setUserAgent(tv.getUserAgent().replace(/\s(Electron|trading-hub)\/\S+/g, ''))
}

/**
 * Opens TradingView's sign-in page in its own window, sharing the chart's
 * session so the login carries over. Only Google/Apple sign-in popups may open
 * from it; anything else goes to the system browser. Resolves when it closes.
 */
export function openTradingViewLogin(parent: BrowserWindow): Promise<void> {
  const win = new BrowserWindow({
    parent,
    width: 520,
    height: 720,
    title: 'Sign in to TradingView',
    webPreferences: { partition: TV_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const restrictPopups = (contents: Electron.WebContents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isSignInHost(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: win,
            webPreferences: { partition: TV_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
          }
        }
      }
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }
  restrictPopups(win.webContents)
  win.webContents.on('did-create-window', (child) => restrictPopups(child.webContents))
  win.loadURL('https://www.tradingview.com/accounts/signin/')
  return new Promise((resolve) => win.on('closed', () => resolve()))
}
