import type { AiSearchProviderConfig, AiSettings } from '../preload'

export function defaultSearchProviders(): AiSearchProviderConfig[] {
  return [{ id: 'baidu', name: '百度千帆', kind: 'baidu' }]
}

export function defaultAiSettings(): AiSettings {
  return {
    providers: [],
    activeProviderId: '',
    activeModelId: '',
    searchProviders: defaultSearchProviders(),
    activeSearchProviderId: 'baidu',
    skipDeleteConversationConfirm: false,
    memoryEnabled: true,
    socraticEnabled: false
  }
}
