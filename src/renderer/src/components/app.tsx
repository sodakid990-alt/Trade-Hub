import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { PageName } from '../lib/types'

/** Something a page should do when opened, e.g. Home's "Log a trade" button opening the Journal form. */
export type Intent = 'new-trade' | 'screenshot' | 'today' | 'add-account' | 'add-setup' | null

interface Nav {
  page: PageName
  go: (page: PageName, intent?: Intent) => void
  intent: Intent
  clearIntent: () => void
}

export const NavContext = createContext<Nav>(null!)
export const useNav = () => useContext(NavContext)

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const ToastContext = createContext<(text: string, action?: Toast['action']) => void>(() => {})
export const useToast = () => useContext(ToastContext)

/** Small confirmation messages in the corner, optionally with an Undo button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const show = useCallback((text: string, action?: Toast['action']) => {
    const id = ++next.current
    setToasts((ts) => [...ts.slice(-2), { id, text, action }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), action ? 7000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && (
              <button className="link" onClick={() => { t.action!.run(); setToasts((ts) => ts.filter((x) => x.id !== t.id)) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
