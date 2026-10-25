import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { TradovateAccount, TradovateCreds } from '../../../preload'
import { supabase, syncNow } from '../lib/sync'

export function SettingsPage() {
  return (
    <div className="page narrow">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Sync, broker connection and screenshot reading.</p>
        </div>
      </header>
      <SyncSettings />
      <TradovateSettings />
      <ApiKeySettings />
    </div>
  )
}

function SyncSettings() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase)
    return (
      <section className="card">
        <h3>Sync</h3>
        <p className="muted">Sync isn't configured in this build. Your data is saved on this computer.</p>
      </section>
    )

  const auth = async (mode: 'in' | 'up') => {
    const fn = mode === 'in' ? supabase!.auth.signInWithPassword : supabase!.auth.signUp
    const { error } = await fn.call(supabase!.auth, { email, password })
    setMsg(error ? error.message : mode === 'up' ? 'Check your email to confirm, then sign in.' : '')
  }

  return (
    <section className="card">
      <h3>Sync</h3>
      {user ? (
        <>
          <p>Signed in as <strong>{user.email}</strong>. Sign in with the same account on your other computer to keep both in sync.</p>
          <div className="row gap">
            <button className="primary" onClick={async () => setMsg((await syncNow()).message)}>Sync now</button>
            <button className="ghost" onClick={() => supabase!.auth.signOut()}>Sign out</button>
          </div>
        </>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); auth('in') }}>
          <p className="muted">Create an account once, then sign in on each computer.</p>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="row gap">
            <button className="primary" type="submit">Sign in</button>
            <button className="ghost" type="button" onClick={() => auth('up')}>Create account</button>
          </div>
        </form>
      )}
      {msg && <p className="muted">{msg}</p>}
    </section>
  )
}

function ApiKeySettings() {
  const [hasKey, setHasKey] = useState<boolean>()
  const [key, setKey] = useState('')
  useEffect(() => {
    window.hub?.hasApiKey().then(setHasKey)
  }, [])

  const save = async (value: string) => {
    await window.hub?.setApiKey(value)
    setHasKey(!!value)
    setKey('')
  }

  return (
    <section className="card">
      <h3>Screenshot reading</h3>
      <p className="muted">
        Fill in trades from a screenshot using Claude. Needs an Anthropic API key from console.anthropic.com (pay as you go, about a cent or two per screenshot).
        The key is encrypted and stays on this computer; it isn't synced, so add it on each computer.
      </p>
      {hasKey ? (
        <div className="row gap">
          <span className="badge passed">Key saved</span>
          <button className="ghost" onClick={() => save('')}>Remove key</button>
        </div>
      ) : (
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(key.trim()) }}>
          <input type="password" placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" type="submit">Save key</button>
        </form>
      )}
    </section>
  )
}

const emptyCreds: TradovateCreds = { env: 'demo', username: '', password: '', cid: '', secret: '' }

function TradovateSettings() {
  const [status, setStatus] = useState<{ connected: boolean; env?: string; username?: string }>()
  const [accounts, setAccounts] = useState<TradovateAccount[]>([])
  const [creds, setCreds] = useState(emptyCreds)
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof TradovateCreds>(k: K, v: TradovateCreds[K]) => setCreds({ ...creds, [k]: v })
  const clean = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

  useEffect(() => {
    window.hub?.tradovate.status().then((s) => {
      setStatus(s)
      if (s.connected) window.hub!.tradovate.accounts().then(setAccounts).catch((e) => setMsg({ error: true, text: clean(e) }))
    })
  }, [])

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      setAccounts(await window.hub!.tradovate.connect(creds))
      setStatus({ connected: true, env: creds.env, username: creds.username })
      setCreds(emptyCreds)
      setMsg({ error: false, text: 'Connected. Link each account on the Accounts page to start syncing.' })
      window.dispatchEvent(new Event('tradovate-changed'))
    } catch (err) {
      setMsg({ error: true, text: clean(err) })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    await window.hub!.tradovate.disconnect()
    setStatus({ connected: false })
    setAccounts([])
    window.dispatchEvent(new Event('tradovate-changed'))
  }

  return (
    <section className="card">
      <h3>Tradovate connection</h3>
      <p className="muted">
        Pulls your fills and balances automatically every minute, so your journal and account cards stay current.
        Needs an API key from Tradovate (log in, then Settings, then API Access). Credentials are encrypted and stay on this computer.
      </p>
      {status?.connected ? (
        <>
          <div className="row gap">
            <span className="badge passed">Connected</span>
            <span className="muted">{status.username} · {status.env === 'live' ? 'Live' : 'Demo / prop firm sim'}</span>
            <div className="spacer" />
            <button className="ghost" onClick={disconnect}>Disconnect</button>
          </div>
          {accounts.length > 0 && (
            <table className="compact">
              <thead><tr><th>Tradovate account</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}><td>{a.name}</td><td className="num">{a.balance === undefined ? '' : '$' + a.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <form className="form plain" onSubmit={connect}>
          <label>Server
            <select value={creds.env} onChange={(e) => set('env', e.target.value as TradovateCreds['env'])}>
              <option value="demo">Demo (prop firm evals and sim-funded)</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label>Username<input value={creds.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></label>
          <label>Password<input type="password" value={creds.password} onChange={(e) => set('password', e.target.value)} /></label>
          <label>API key ID (CID)<input value={creds.cid} onChange={(e) => set('cid', e.target.value)} /></label>
          <label className="wide">API secret<input type="password" value={creds.secret} onChange={(e) => set('secret', e.target.value)} /></label>
          <div className="wide actions">
            <button className="primary" type="submit" disabled={busy || !creds.username || !creds.password || !creds.cid || !creds.secret}>
              {busy ? 'Connecting…' : 'Connect Tradovate'}
            </button>
          </div>
        </form>
      )}
      {msg && <div className={`notice ${msg.error ? 'error' : ''}`} style={{ marginTop: 12, marginBottom: 0 }}>{msg.text}</div>}
    </section>
  )
}
