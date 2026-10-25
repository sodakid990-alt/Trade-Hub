import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Credentials stay on this computer, encrypted with the OS keychain
// (Keychain on macOS, DPAPI on Windows). They are never synced.
const secretFile = (name: string) => join(app.getPath('userData'), `${name}.bin`)

export function setSecret(name: string, value: string | null) {
  if (!value) return rmSync(secretFile(name), { force: true })
  writeFileSync(secretFile(name), safeStorage.encryptString(value))
}

export function getSecret(name: string): string | null {
  if (!existsSync(secretFile(name))) return null
  return safeStorage.decryptString(readFileSync(secretFile(name)))
}

export const setApiKey = (key: string) => setSecret('anthropic-key', key.trim() || null)
export const getApiKey = () => getSecret('anthropic-key')
