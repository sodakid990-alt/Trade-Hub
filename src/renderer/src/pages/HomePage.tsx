import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { byDay, netPnl, summarize, todayKey } from '../lib/analytics'
import { guardrails } from '../lib/guardrails'
import { updatePrefs, usePrefs } from '../lib/prefs'
import { pct, pnlClass, usd } from '../components/format'
import { Icon } from '../components/Icon'
import { useNav } from '../components/app'
import { GuardrailList } from '../components/GuardrailList'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function HomePage() {
  const { go } = useNav()
  const prefs = usePrefs()
  const today = todayKey()
  const trades = useLiveQuery(() => db.trades.filter((t) => !t.deleted).toArray(), []) ?? []
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), []) ?? []
  const day = useLiveQuery(() => db.days.get(today), [today])
  const setups = useLiveQuery(() => db.setups.filter((s) => !s.deleted).count(), []) ?? 0
  const signedIn = useLiveQuery(async () => !!(await db.meta.get('lastSync')), []) ?? false

  const todays = trades.filter((t) => byDay(t) === today).sort((a, b) => b.exitTime.localeCompare(a.exitTime))
  const s = summarize(todays)
  const week = summarize(trades.filter((t) => Date.now() - Date.parse(t.exitTime) < 7 * 864e5))
  const rails = guardrails(trades, accounts, prefs, today, byDay)
  const worst = rails.reduce((w, g) => (g.level === 'stop' ? 'stop' : g.level === 'warn' && w !== 'stop' ? 'warn' : w), 'ok' as string)

  const steps = [
    { done: accounts.length > 0, label: 'Add your prop firm account', action: () => go('Accounts', 'add-account') },
    { done: trades.length > 0, label: 'Log your first trade (try dropping in a screenshot)', action: () => go('Journal', 'screenshot') },
    { done: setups > 0, label: 'Write down your setups in the Playbook', action: () => go('Playbook', 'add-setup') },
    { done: !!day?.plan || !!day?.levels, label: "Make today's game plan", action: () => go('Daily', 'today') },
    { done: signedIn, label: 'Sign in to sync with your other computer', action: () => go('Settings') }
  ]
  const showSteps = !prefs.onboardingDone && steps.some((x) => !x.done)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{greeting()}</h1>
          <p className="muted">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="row gap">
          <button className="ghost" onClick={() => go('Journal', 'screenshot')}><Icon name="image" size={16} /> Add screenshot</button>
          <button className="primary" onClick={() => go('Journal', 'new-trade')}><Icon name="plus" size={16} /> Log a trade</button>
        </div>
      </header>

      {showSteps && (
        <section className="card onboarding">
          <div className="row">
            <h3>Getting started</h3>
            <div className="spacer" />
            <button className="link" onClick={() => updatePrefs({ onboardingDone: true })}>Hide</button>
          </div>
          {steps.map((step) => (
            <button key={step.label} className={`step ${step.done ? 'done' : ''}`} onClick={step.action} disabled={step.done}>
              <span className="check">{step.done && <Icon name="check" size={13} />}</span>
              <span>{step.label}</span>
            </button>
          ))}
        </section>
      )}

      <div className="stats">
        <div className="card stat"><div className="muted">Today's P&L</div><div className={`value ${pnlClass(s.netPnl)}`}>{usd(s.netPnl)}</div></div>
        <div className="card stat"><div className="muted">Trades today</div><div className="value">{s.trades}</div></div>
        <div className="card stat"><div className="muted">Win rate today</div><div className="value">{s.trades ? pct(s.winRate) : '—'}</div></div>
        <div className="card stat"><div className="muted">Last 7 days</div><div className={`value ${pnlClass(week.netPnl)}`}>{usd(week.netPnl)}</div></div>
      </div>

      <div className="grid2">
        <section className="card">
          <div className="row">
            <h3><Icon name="shield" size={15} /> Rules check</h3>
            <div className="spacer" />
            <span className={`badge ${worst === 'stop' ? 'failed' : worst === 'warn' ? 'warn' : 'passed'}`}>
              {worst === 'stop' ? 'Stop trading' : worst === 'warn' ? 'Be careful' : 'All good'}
            </span>
          </div>
          {rails.length ? (
            <GuardrailList items={rails} />
          ) : (
            <p className="muted">
              Add a prop account with a daily loss limit, or set your own daily max loss in{' '}
              <button className="link" onClick={() => go('Settings')}>Settings</button>, and this will warn you before you break a rule.
            </p>
          )}
        </section>

        <section className="card">
          <div className="row">
            <h3><Icon name="calendar" size={15} /> Today's plan</h3>
            <div className="spacer" />
            <button className="link" onClick={() => go('Daily', 'today')}>{day ? 'Edit' : 'Make a plan'}</button>
          </div>
          {day && (day.bias || day.levels || day.plan || day.maxLoss) ? (
            <div className="plan-summary">
              {day.bias && <div><span className="muted">Bias</span> <span className={`badge bias-${day.bias}`}>{day.bias}</span></div>}
              {day.maxLoss ? <div><span className="muted">Max loss</span> {usd(day.maxLoss)}</div> : null}
              {day.levels && <div><span className="muted">Levels</span> {day.levels}</div>}
              {day.plan && <p>{day.plan}</p>}
            </div>
          ) : (
            <p className="muted">Write your bias, key levels and max loss before the open. It takes a minute and keeps you honest.</p>
          )}
        </section>
      </div>

      <section className="card flush">
        <div className="row card-head">
          <h3>Today's trades</h3>
          <div className="spacer" />
          <button className="link" onClick={() => go('Journal')}>Open journal</button>
        </div>
        {todays.length ? (
          <table>
            <tbody>
              {todays.slice(0, 8).map((t) => (
                <tr key={t.id} onClick={() => go('Journal')}>
                  <td>{new Date(t.exitTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                  <td><span className={`side ${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span> {t.qty} {t.symbol}</td>
                  <td className="muted">{t.setup}</td>
                  <td className={`num ${pnlClass(netPnl(t))}`}><strong>{usd(netPnl(t))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No trades yet today.</div>
        )}
      </section>
    </div>
  )
}
