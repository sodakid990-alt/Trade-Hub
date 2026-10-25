import { useEffect, useState } from 'react'
import { checkAlerts } from '../lib/alerts'

const POLL_MS = 15_000

/** Polls the delayed MNQ quote and checks alerts against each move. Mounted once at the app root. */
export function useQuote() {
  const [quote, setQuote] = useState<{ price: number; time: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!window.hub) return setError('Quotes need the desktop app')
    let prev: number | undefined
    const poll = async () => {
      try {
        const q = await window.hub!.quote()
        if (prev !== undefined && q.price !== prev) await checkAlerts('MNQ', prev, q.price)
        prev = q.price
        setQuote(q)
        setError('')
      } catch (e) {
        setError('Quote unavailable, retrying')
        console.warn('quote failed', e)
      }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [])
  return { quote, error }
}
