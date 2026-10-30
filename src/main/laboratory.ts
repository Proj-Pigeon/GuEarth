import type { LaboratoryProvider, LaboratoryProviderInput } from '../common/onlineData'
import { normalizeQWeatherHost } from '../common/onlineData'
import { clearProviderKey, hasProviderKey, readProviderKey, writeProviderKey } from './keyVault'

const CREDENTIAL_ID = 'laboratory-qweather'

export interface QWeatherCredentials {
  apiHost: string
  apiKey: string
}

function validateApiKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(value.trim())) {
    throw new Error('请输入有效的 API Key（不含空格或换行）')
  }
  return value.trim()
}

export function getQWeatherCredentials(): QWeatherCredentials | null {
  if (!hasProviderKey(CREDENTIAL_ID)) return null
  try {
    const saved = readProviderKey(CREDENTIAL_ID)
    if (!saved) throw new Error('无法解密')
    const value = JSON.parse(saved)
    return { apiHost: normalizeQWeatherHost(value.apiHost), apiKey: validateApiKey(value.apiKey) }
  } catch {
    throw new Error('和风天气凭据不可用，请在设置 → 实验室重新保存 API Host 和 API Key')
  }
}

export function listLaboratoryProviders(): LaboratoryProvider[] {
  try {
    const credentials = getQWeatherCredentials()
    return credentials ? [{ category: 'weather', provider: 'qweather', apiHost: credentials.apiHost, configured: true }] : []
  } catch {
    return [{ category: 'weather', provider: 'qweather', apiHost: '', configured: false }]
  }
}

export function saveLaboratoryProvider(input: LaboratoryProviderInput): LaboratoryProvider[] {
  if (!input || input.category !== 'weather' || input.provider !== 'qweather') throw new Error('不支持的数据源或提供商')
  const apiHost = normalizeQWeatherHost(input.apiHost)
  const apiKey = input.apiKey === undefined || input.apiKey === ''
    ? getQWeatherCredentials()?.apiKey
    : validateApiKey(input.apiKey)
  if (!apiKey) throw new Error('请输入 API Key')
  writeProviderKey(CREDENTIAL_ID, JSON.stringify({ apiHost, apiKey }))
  return listLaboratoryProviders()
}

export function removeLaboratoryProvider(provider: unknown): LaboratoryProvider[] {
  if (provider !== 'qweather') throw new Error('不支持的提供商')
  clearProviderKey(CREDENTIAL_ID)
  return []
}
