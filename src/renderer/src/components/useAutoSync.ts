import { useEffect, useState } from 'react'
import { supabase, syncNow } from '../lib/sync'

/** Syncs on start, every 30s, and when the network comes back. */
export function useAutoSync() {
  const [status, setStatus] = useState(supabase ? 'Sync: starting' : 'Sync: off')
  useEffect(() => {
    if (!supabase) return
    let running = false
    const run = async () => {
      if (running || !navigator.onLine) return
      running = true
      try {
        const r = await syncNow()
        setStatus(r.message)
      } catch (e) {
        setStatus(`Sync error: ${(e as Error).message}`)
      } finally {
        running = false
      }
    }
    run()
    const timer = setInterval(run, 30_000)
    window.addEventListener('online', run)
    const { data } = supabase.auth.onAuthStateChange(() => run())
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', run)
      data.subscription.unsubscribe()
    }
  }, [])
  return status
}
