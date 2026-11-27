import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let credentialsPath = ''

export function initKeyVault(directory: string): void {
  credentialsPath = directory
  mkdirSync(credentialsPath, { recursive: true })
}

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

export function assertSafeId(value: unknown): string {
  if (!isSafeId(value)) {throw new Error('无效的供应商标识')}
  return value
}

function credentialPath(providerId: string): string {
  return join(credentialsPath, `${assertSafeId(providerId)}.bin`)
}

export function hasProviderKey(providerId: string): boolean {
  return existsSync(credentialPath(providerId))
}

export function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {throw new Error('系统安全存储不可用')}
}

export function writeProviderKey(providerId: string, apiKey: string): void {
  assertEncryptionAvailable()
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 4096) {throw new Error('无效的供应商密钥')}
  writeFileSync(credentialPath(providerId), safeStorage.encryptString(apiKey))
}

export function clearProviderKey(providerId: string): void {
  const path = credentialPath(providerId)
  if (existsSync(path)) {unlinkSync(path)}
}

export function readProviderKey(providerId: string): string | undefined {
  const path = credentialPath(providerId)
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) {return undefined}
  try {
    return safeStorage.decryptString(readFileSync(path))
  } catch {
    return undefined
  }
}
