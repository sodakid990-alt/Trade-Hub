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

## Features

- **Chart:** the full TradingView site in an embedded browser, opened on `CME_MINI:MNQ1!`. Sign in with your TradingView account (email/username) and your real-time data, layouts, indicators and TradingView alerts carry over. The login persists between launches.
- **Journal:** add trades by hand or import Tradovate's Performance report CSV. Setup, tags, stop and notes are kept when the same trades are re-imported.
- **Analysis:** net P&L, win rate, profit factor, expectancy, average R, max drawdown, equity curve, daily P&L, and breakdowns by setup, hour (ET) and weekday. MNQ is valued at $2/point.
- **Accounts:** dashboard for prop firm evaluations and funded accounts: balance, profit target progress, trailing/EOD/static drawdown room and breach level, daily loss limit and trading days. Pick the account when importing or logging trades.
- **Alerts:** price-cross alerts shown as desktop notifications while the app is open, checked every 15s against a free delayed quote (Yahoo Finance `MNQ=F`, unofficial).
- **Sync:** data is stored locally first and synced through Supabase when signed in.

## Setting up sync

1. Create a free project at supabase.com.
2. Run `supabase/schema.sql` in its SQL editor.
3. Copy `.env.example` to `.env` and fill in the project URL and anon key, then build.
4. Sign in on the Sync page with the same account on each computer.
