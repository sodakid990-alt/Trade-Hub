import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, syncNow } from '../lib/sync'

export function SyncPage() {
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
      <div className="page">
        <h2>Sync</h2>
        <p className="muted">Sync isn't configured in this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README). Your data is saved on this computer in the meantime.</p>
      </div>
    )

  const auth = async (mode: 'in' | 'up') => {
    const fn = mode === 'in' ? supabase!.auth.signInWithPassword : supabase!.auth.signUp
    const { error } = await fn.call(supabase!.auth, { email, password })
    setMsg(error ? error.message : mode === 'up' ? 'Check your email to confirm, then sign in.' : '')
  }

  return (
    <div className="page">
      <header className="toolbar"><h2>Sync</h2></header>
      {user ? (
        <div className="card">
          <p>Signed in as {user.email}. Sign in with the same account on your other computer to sync.</p>
          <button onClick={async () => setMsg((await syncNow()).message)}>Sync now</button>{' '}
          <button onClick={() => supabase!.auth.signOut()}>Sign out</button>
        </div>
      ) : (
        <form className="card inline" onSubmit={(e) => { e.preventDefault(); auth('in') }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="primary" type="submit">Sign in</button>
          <button type="button" onClick={() => auth('up')}>Create account</button>
        </form>
      )}
      <p className="muted">{msg}</p>
    </div>
  )
}
