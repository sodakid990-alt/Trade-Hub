# Trading Hub

Desktop app for trading MNQ futures: charts, trading journal, trade analysis and price alerts, synced between computers. Runs on Windows and macOS (Electron).

## Run it

```bash
npm install
npm run dev        # development
npm test           # unit tests
npm run dist:win   # Windows installer -> dist/
npm run dist:mac   # macOS .dmg -> dist/ (build on a Mac)
```

## Downloading the app

Every push to `main` builds a Windows installer and a Mac `.dmg` on GitHub Actions. Open the repo's **Actions** tab, click the latest "Build installers" run, and download `trading-hub-win` or `trading-hub-mac` under Artifacts.

The app isn't code-signed yet, so the first launch needs one extra click:
- **Windows:** on the SmartScreen warning, click "More info" then "Run anyway".
- **Mac:** right-click the app in Applications, choose Open, then Open again. If macOS says the app is damaged, run `xattr -cr "/Applications/Trading Hub.app"` in Terminal.

## Features

- **Simple by default:** the sidebar shows Home, Chart, Journal, Analysis and Accounts. Daily, Playbook and Alerts can be turned on in Settings > More options.
- **Home:** today's P&L, rule check against your daily max loss and prop limits, today's plan and quick actions (log a trade, add a screenshot, plan the day).
- **Daily:** pre-market plan (bias, key levels, max loss, plan) and end-of-day review with a grade. Autosaves.
- **Playbook:** your setups with rules, colors and live stats for each.
- **Chart:** the full TradingView site in an embedded browser, opened on `CME_MINI:MNQ1!`. Use **Sign in to TradingView** (Google, Apple or email) and your real-time data, layouts, indicators and TradingView alerts carry over. The login persists between launches.
- **Journal:** drop, paste or pick a screenshot of your fills or Performance tab and the app reads it on your computer (free, offline OCR) and fills in the trade for you to check. You can also add trades by hand or import Tradovate's Performance report CSV. Setup, tags, stop and notes are kept when the same trades are re-imported.
- **Analysis:** net P&L, win rate, profit factor, expectancy, average R, max drawdown, equity curve, daily P&L, and breakdowns by setup, hour (ET) and weekday, filterable by date range, account and setup, plus a calendar and what each mistake tag cost you. MNQ is valued at $2/point.
- **Accounts:** add a Lucid account by picking the plan (Flex, Pro, Direct, Daily), size and stage; the rules fill in automatically (other firms can enter rules by hand). Dashboard for prop firm evaluations and funded accounts: balance, profit target progress, trailing/EOD/static drawdown room and breach level, daily loss limit and trading days. Pick the account when importing or logging trades. Funded accounts track payouts.
- **Tradovate connection:** in Settings, enter your Tradovate login and API key (Tradovate Settings > API Access). Link each card on the Accounts page to a Tradovate account and its fills and balance sync every minute while the app is open. Trades match the CSV import, so nothing doubles up.
- **Alerts:** price-cross alerts shown as desktop notifications while the app is open, checked every 15s against a free delayed quote (Yahoo Finance `MNQ=F`, unofficial).
- **Settings:** Basics (theme, commission, daily max loss), Connections (sync, Tradovate) and More options (extra pages, accent color, compact mode, start page, default symbol, your own tags and warning level). Ctrl/⌘+1-9 switches pages, N adds a trade, and deletes can be undone.
- **Sync:** data is stored locally first and synced through Supabase when signed in.

## Setting up sync

1. Create a free project at supabase.com.
2. Run `supabase/schema.sql` in its SQL editor. It is safe to run again, and must be re-run after updates that add synced tables.
3. Put the project URL and publishable key in `.env.production` (already set for this project). Installers built from `main` include them.
4. Sign in on the Sync page with the same account on each computer.
