import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The Anthropic API key stays on this computer, encrypted with the OS keychain
// (Keychain on macOS, DPAPI on Windows). It is never synced.
const keyFile = () => join(app.getPath('userData'), 'anthropic-key.bin')

export function setApiKey(key: string) {
  if (!key) return rmSync(keyFile(), { force: true })
  writeFileSync(keyFile(), safeStorage.encryptString(key.trim()))
}

export function getApiKey(): string | null {
  if (!existsSync(keyFile())) return null
  return safeStorage.decryptString(readFileSync(keyFile()))
}
