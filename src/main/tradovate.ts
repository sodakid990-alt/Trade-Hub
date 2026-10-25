import { net } from 'electron'
import { randomUUID } from 'node:crypto'
import { getSecret, setSecret } from './secrets'

/**
 * Tradovate REST API client. Needs the user's Tradovate login plus an API key
 * (CID + secret) from Tradovate's Application Settings > API Access. Prop firm
 * evaluation and many funded accounts run on Tradovate's demo (sim) servers.
 */
export interface TradovateCreds {
  env: 'live' | 'demo'
  username: string
  password: string
  cid: string
  secret: string
}

export interface TradovateAccount {
  id: number
  name: string
  balance?: number
  realizedPnl?: number
}

export interface TradovateFill {
  id: number
  contractId: number
  timestamp: string
  action: 'Buy' | 'Sell'
  qty: number
  price: number
}

export interface TradovateFillPair {
  id: number
  positionId: number
  buyFillId: number
  sellFillId: number
  qty: number
  buyPrice: number
  sellPrice: number
}

export interface TradovateSnapshot {
  accounts: TradovateAccount[]
  fills: TradovateFill[]
  fillPairs: TradovateFillPair[]
  /** contractId -> symbol, e.g. 3842 -> "MNQZ6" */
  contracts: Record<number, string>
  /** positionId -> accountId, to tell which account a fill pair belongs to */
  positionAccounts: Record<number, number>
}

const CREDS = 'tradovate-creds'
const DEVICE = 'tradovate-device'

const baseUrl = (env: TradovateCreds['env']) => `https://${env}.tradovateapi.com/v1`

export function loadCreds(): TradovateCreds | null {
  const raw = getSecret(CREDS)
  return raw ? (JSON.parse(raw) as TradovateCreds) : null
}

export function saveCreds(creds: TradovateCreds | null) {
  setSecret(CREDS, creds && JSON.stringify(creds))
  token = null
}

function deviceId() {
  let id = getSecret(DEVICE)
  if (!id) setSecret(DEVICE, (id = randomUUID()))
  return id
}

let token: { value: string; expires: number; env: string } | null = null

async function call<T>(creds: TradovateCreds, path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (init.auth !== false) headers.Authorization = `Bearer ${await accessToken(creds)}`
  const res = await net.fetch(baseUrl(creds.env) + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined
  })
  if (res.status === 401) token = null
  if (!res.ok) throw new Error(`Tradovate ${path} failed (${res.status})`)
  return (await res.json()) as T
}

interface AuthResponse {
  accessToken?: string
  expirationTime?: string
  errorText?: string
  'p-ticket'?: string
  'p-time'?: number
}

async function accessToken(creds: TradovateCreds): Promise<string> {
  if (token && token.env === creds.env && token.expires - Date.now() > 5 * 60_000) return token.value
  const body: Record<string, unknown> = {
    name: creds.username,
    password: creds.password,
    appId: 'Trading Hub',
    appVersion: '1.0',
    cid: creds.cid,
    sec: creds.secret,
    deviceId: deviceId()
  }
  let auth = await call<AuthResponse>(creds, '/auth/accesstokenrequest', { body, auth: false })
  // Tradovate rate-limits logins with a penalty ticket: wait p-time seconds, then retry with it.
  if (auth['p-ticket'] && !auth.accessToken) {
    await new Promise((r) => setTimeout(r, (auth['p-time'] ?? 1) * 1000))
    auth = await call<AuthResponse>(creds, '/auth/accesstokenrequest', { body: { ...body, 'p-ticket': auth['p-ticket'] }, auth: false })
  }
  if (!auth.accessToken) throw new Error(auth.errorText || 'Tradovate sign-in failed. Check your username, password and API key.')
  token = { value: auth.accessToken, expires: Date.parse(auth.expirationTime ?? '') || Date.now() + 60 * 60_000, env: creds.env }
  return token.value
}

export async function listAccounts(creds: TradovateCreds): Promise<TradovateAccount[]> {
  const accounts = await call<{ id: number; name: string; active?: boolean }[]>(creds, '/account/list')
  return Promise.all(
    accounts
      .filter((a) => a.active !== false)
      .map(async (a) => {
        const snap = await call<{ totalCashValue?: number; realizedPnL?: number }>(creds, '/cashBalance/getcashbalancesnapshot', {
          body: { accountId: a.id }
        }).catch(() => null)
        return { id: a.id, name: a.name, balance: snap?.totalCashValue, realizedPnl: snap?.realizedPnL }
      })
  )
}

/** Accounts with balances, plus the fills and matched round trips Tradovate currently reports. */
export async function snapshot(creds: TradovateCreds): Promise<TradovateSnapshot> {
  const [accounts, fills, fillPairs, positions] = await Promise.all([
    listAccounts(creds),
    call<TradovateFill[]>(creds, '/fill/list'),
    call<TradovateFillPair[]>(creds, '/fillPair/list'),
    call<{ id: number; accountId: number }[]>(creds, '/position/list')
  ])
  const positionAccounts = Object.fromEntries(positions.map((p) => [p.id, p.accountId]))
  const contractIds = [...new Set(fills.map((f) => f.contractId))]
  const contracts: Record<number, string> = {}
  await Promise.all(
    contractIds.map(async (id) => {
      const c = await call<{ name: string }>(creds, `/contract/item?id=${id}`).catch(() => null)
      if (c) contracts[id] = c.name
    })
  )
  return { accounts, fills, fillPairs, contracts, positionAccounts }
}
