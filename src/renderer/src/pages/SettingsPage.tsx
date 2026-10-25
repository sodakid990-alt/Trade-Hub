import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { User } from '@supabase/supabase-js'
import type { TradovateAccount, TradovateCreds } from '../../../preload'
import { supabase, syncNow } from '../lib/sync'
import { db } from '../lib/db'
import { ACCENTS, DEFAULT_TAGS, PAGE_NAMES, updatePrefs, usePrefs } from '../lib/prefs'
import type { PageName, Prefs } from '../lib/types'
import { Icon } from '../components/Icon'
import { useToast } from '../components/app'

const SECTIONS = ['Appearance', 'Trading', 'Rules', 'Sync', 'Tradovate'] as const

export function SettingsPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Appearance')
  return (
    <div className="page narrow">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Make the app work the way you trade. Changes save automatically and sync to your other computer.</p>
        </div>
      </header>
      <div className="tabs">
        {SECTIONS.map((s) => (
          <button key={s} className={`tab ${s === section ? 'active' : ''}`} onClick={() => setSection(s)}>{s}</button>
        ))}
      </div>
      {section === 'Appearance' && <AppearanceSettings />}
      {section === 'Trading' && <TradingSettings />}
      {section === 'Rules' && <RulesSettings />}
      {section === 'Sync' && <SyncSettings />}
      {section === 'Tradovate' && <TradovateSettings />}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div className="setting-label">{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button type="button" key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

function AppearanceSettings() {
  const prefs = usePrefs()
  const togglePage = (p: PageName) =>
    updatePrefs({ hiddenPages: prefs.hiddenPages.includes(p) ? prefs.hiddenPages.filter((x) => x !== p) : [...prefs.hiddenPages, p] })
  return (
    <>
      <section className="card">
        <Field label="Theme">
          <Segmented value={prefs.theme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Match computer']]} onChange={(theme) => updatePrefs({ theme })} />
        </Field>
        <Field label="Accent color">
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button key={c} className={`swatch ${prefs.accent === c ? 'active' : ''}`} style={{ background: c }} onClick={() => updatePrefs({ accent: c })} title={c} />
            ))}
            <input type="color" value={prefs.accent} onChange={(e) => updatePrefs({ accent: e.target.value })} title="Pick any color" />
          </div>
        </Field>
        <Field label="Compact mode" hint="Tighter spacing to fit more trades on screen.">
          <label className="switch"><input type="checkbox" checked={prefs.compact} onChange={(e) => updatePrefs({ compact: e.target.checked })} /><span /></label>
        </Field>
        <Field label="Open the app on">
          <select value={prefs.startPage} onChange={(e) => updatePrefs({ startPage: e.target.value as PageName })}>
            {PAGE_NAMES.filter((p) => !prefs.hiddenPages.includes(p)).map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </section>
      <section className="card">
        <h3>Pages in the sidebar</h3>
        <p className="muted small">Hide the ones you don't use. Settings always stays.</p>
        <div className="chips">
          {PAGE_NAMES.filter((p) => p !== 'Settings').map((p) => (
            <button key={p} className={`chip ${prefs.hiddenPages.includes(p) ? '' : 'active'}`} onClick={() => togglePage(p)} disabled={p === prefs.startPage && !prefs.hiddenPages.includes(p)} title={p === prefs.startPage ? 'This is your start page' : ''}>
              {prefs.hiddenPages.includes(p) ? '' : '✓ '}{p}
            </button>
          ))}
        </div>
      </section>
      {!prefs.onboardingDone ? null : (
        <p className="muted small">
          <button className="link" onClick={() => updatePrefs({ onboardingDone: false })}>Show the getting-started steps on Home again</button>
        </p>
      )}
    </>
  )
}

function NumberSetting({ value, onChange, prefix, step = 1, placeholder }: { value: number; onChange: (n: number) => void; prefix?: string; step?: number; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => setText(value ? String(value) : ''), [value])
  return (
    <div className="input-prefix">
      {prefix && <span>{prefix}</span>}
      <input type="number" min={0} step={step} value={text} placeholder={placeholder ?? '0'} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(Number(text) || 0)} />
    </div>
  )
}

function TradingSettings() {
  const prefs = usePrefs()
  const toast = useToast()
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted && a.status === 'active').toArray(), []) ?? []
  const [newTag, setNewTag] = useState('')
  const addTag = () => {
    const tag = newTag.trim()
    if (tag && !prefs.tags.includes(tag)) updatePrefs({ tags: [...prefs.tags, tag] })
    setNewTag('')
  }
  return (
    <>
      <section className="card">
        <Field label="Default contract" hint="Used for new trades.">
          <select value={prefs.defaultSymbol} onChange={(e) => updatePrefs({ defaultSymbol: e.target.value })}>
            {['MNQ', 'NQ', 'MES', 'ES'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Default account" hint="New and imported trades go here unless you pick another.">
          <select value={prefs.defaultAccountId ?? ''} onChange={(e) => updatePrefs({ defaultAccountId: e.target.value || undefined })}>
            <option value="">None</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.firm}</option>)}
          </select>
        </Field>
        <Field label="Commission per contract, per side" hint="Added to every new trade automatically. For example $0.62 per side is $1.24 per round trip on MNQ.">
          <NumberSetting prefix="$" step={0.01} value={prefs.commissionPerSide} onChange={(commissionPerSide) => { updatePrefs({ commissionPerSide }); toast('Commission saved') }} />
        </Field>
      </section>
      <section className="card">
        <h3>Tags</h3>
        <p className="muted small">Quick-pick tags for your trades. Mistake tags like FOMO show up in Analysis with what they cost you.</p>
        <div className="chips">
          {prefs.tags.map((tag) => (
            <span key={tag} className="chip active removable">
              {tag}
              <button onClick={() => updatePrefs({ tags: prefs.tags.filter((t) => t !== tag) })} title="Remove"><Icon name="x" size={11} /></button>
            </span>
          ))}
          <input className="chip-input" value={newTag} placeholder="+ Add tag" onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag() }} onBlur={addTag} />
        </div>
        {prefs.tags.length === 0 && <button className="link" onClick={() => updatePrefs({ tags: DEFAULT_TAGS })}>Restore the suggested tags</button>}
      </section>
    </>
  )
}

function RulesSettings() {
  const prefs = usePrefs()
  return (
    <section className="card">
      <p className="muted">The app warns you on Home and with a desktop notification when you get close to a limit, and tells you to stop when you hit it. Prop account limits come from each account's settings.</p>
      <Field label="My daily max loss" hint="Across all accounts. Leave at 0 to turn off.">
        <NumberSetting prefix="$" value={prefs.dailyMaxLoss} onChange={(dailyMaxLoss) => updatePrefs({ dailyMaxLoss })} />
      </Field>
      <Field label="Warn me at" hint="How much of a limit can be used before the warning.">
        <Segmented<string>
          value={String(prefs.warnAt)}
          options={[['0.5', '50%'], ['0.75', '75%'], ['0.9', '90%']]}
          onChange={(v) => updatePrefs({ warnAt: Number(v) as Prefs['warnAt'] })}
        />
      </Field>
    </section>
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
