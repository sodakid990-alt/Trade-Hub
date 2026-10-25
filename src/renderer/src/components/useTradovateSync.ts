import { useEffect, useState } from 'react'
import { syncTradovate } from '../lib/tradovateSync'

const POLL_MS = 60_000

/** While Tradovate is connected, pulls new fills and balances every minute. */
export function useTradovateSync() {
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!window.hub) return
    let running = false
    const run = async () => {
      if (running || !navigator.onLine || !(await window.hub!.tradovate.status()).connected) return setStatus('')
      running = true
      try {
        setStatus(await syncTradovate())
      } catch (e) {
        setStatus('Tradovate: ' + (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      } finally {
        running = false
      }
    }
    run()
    const timer = setInterval(run, POLL_MS)
    window.addEventListener('tradovate-changed', run)
    return () => {
      clearInterval(timer)
      window.removeEventListener('tradovate-changed', run)
    }
  }, [])
  return status
}
