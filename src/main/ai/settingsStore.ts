import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { AiModelConfig, AiProviderConfig, AiProtocol, AiSearchProviderConfig, AiSettings, AiThinkingLevel } from '../../preload'
import { defaultAiSettings, defaultSearchProviders } from '../../shared/aiSettings'

const thinkingLevels: AiThinkingLevel[] = ['low', 'medium', 'high']
const protocols: AiProtocol[] = ['openai', 'anthropic']
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeModel(value: unknown): AiModelConfig | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 200) : ''
  if (!id) return null
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim().slice(0, 80) : id
  const contextWindow = typeof value.contextWindow === 'number' && Number.isFinite(value.contextWindow)
    ? Math.min(2_000_000, Math.max(4_096, Math.round(value.contextWindow)))
    : 128_000
  const thinkingLevel = thinkingLevels.includes(value.thinkingLevel as AiThinkingLevel) ? value.thinkingLevel as AiThinkingLevel : 'medium'
  return {
    id,
    label,
    contextWindow,
    streaming: value.streaming !== false,
    vision: value.vision === true,
    thinking: value.thinking === true,
    thinkingLevel
  }
}

function normalizeProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' && idPattern.test(value.id) ? value.id : ''
  if (!id) return null
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : id
  const protocol = protocols.includes(value.protocol as AiProtocol) ? value.protocol as AiProtocol : 'openai'
  let baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : ''
  if (!baseUrl) baseUrl = protocol === 'anthropic' ? 'https://api.anthropic.com' : ''
  baseUrl = baseUrl.replace(/\/+$/, '').slice(0, 500)
  const models = Array.isArray(value.models) ? value.models.map(normalizeModel).filter((model): model is AiModelConfig => model !== null).slice(0, 32) : []
  return { id, name, protocol, baseUrl, models }
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const source = isRecord(value) ? value : {}
  const providers = Array.isArray(source.providers)
    ? source.providers.map(normalizeProvider).filter((provider): provider is AiProviderConfig => provider !== null).slice(0, 16)
    : []
  const activeProviderId = providers.some((provider) => provider.id === source.activeProviderId)
    ? source.activeProviderId as string
    : ''
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0]
  const activeModelId = activeProvider?.models.some((model) => model.id === source.activeModelId)
    ? source.activeModelId as string
    : activeProvider?.models[0]?.id ?? ''
  const seenSearchIds = new Set<string>()
  const searchProviders = Array.isArray(source.searchProviders)
    ? source.searchProviders.flatMap((value): AiSearchProviderConfig[] => {
        if (!isRecord(value) || value.kind !== 'baidu' || typeof value.id !== 'string') return []
        if (!/^[a-z0-9][a-z0-9_-]{0,53}$/i.test(value.id) || seenSearchIds.has(value.id)) return []
        seenSearchIds.add(value.id)
        const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : '百度千帆'
        return [{ id: value.id, name, kind: 'baidu' }]
      }).slice(0, 16)
    : []
  if (!searchProviders.length) searchProviders.push(...defaultSearchProviders())
  const activeSearchProviderId = searchProviders.some((provider) => provider.id === source.activeSearchProviderId)
    ? source.activeSearchProviderId as string
    : searchProviders[0].id
  return {
    providers,
    activeProviderId: activeProvider?.id ?? '',
    activeModelId,
    searchProviders,
    activeSearchProviderId,
    skipDeleteConversationConfirm: source.skipDeleteConversationConfirm === true,
    memoryEnabled: source.memoryEnabled !== false,
    socraticEnabled: source.socraticEnabled === true
  }
}

export class AiSettingsStore {
  private path = ''
  private settings: AiSettings = defaultAiSettings()

  init(path: string): void {
    this.path = path
    this.settings = this.read()
  }

  private read(): AiSettings {
    if (!this.path || !existsSync(this.path)) return defaultAiSettings()
    try {
      return normalizeAiSettings(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch {
      return defaultAiSettings()
    }
  }

  snapshot(): AiSettings {
    return this.settings
  }

  update(value: unknown): AiSettings {
    this.settings = normalizeAiSettings(value)
    writeFileSync(this.path, JSON.stringify(this.settings, null, 2), 'utf8')
    return this.settings
  }
}
