import type { AiModelConfig, AiProviderConfig, AiSearchProviderConfig } from '../../../preload'

export interface AiDraftModel extends AiModelConfig {
  key: string
}

export interface AiDraftProvider extends AiProviderConfig {
  key: string
  models: AiDraftModel[]
}

export interface AiDraftState {
  providers: AiDraftProvider[]
  activeChoice: string
  searchProviders: AiSearchProviderConfig[]
  activeSearchProviderId: string
}

export interface AiPersistedState {
  providers: AiProviderConfig[]
  activeProviderId: string
  activeModelId: string
  searchProviders: AiSearchProviderConfig[]
  activeSearchProviderId: string
}

function modelSignature(model: AiModelConfig): string {
  const id = model.id.trim()
  return JSON.stringify([id, model.label.trim() || id, model.contextWindow, model.streaming, model.vision, model.thinking, model.thinkingLevel, model.enabled])
}

function providerSignature(provider: AiProviderConfig): string {
  return JSON.stringify([provider.id, provider.name.trim(), provider.protocol, provider.baseUrl.trim(), provider.models.map(modelSignature)])
}

function searchSignature(provider: AiSearchProviderConfig): string {
  return JSON.stringify([provider.id, provider.name.trim(), provider.kind])
}

export function activePairSignature(providerId: string, modelId: string): string {
  return modelId ? JSON.stringify([providerId, modelId]) : ''
}

export function draftChoiceSignature(choice: string | null | undefined): string {
  const value = typeof choice === 'string' ? choice : ''
  const separator = value.indexOf(':')
  if (separator < 0) return ''
  return activePairSignature(value.slice(0, separator), value.slice(separator + 1))
}

export function providerListSignature(providers: AiProviderConfig[]): string {
  return JSON.stringify(providers.map(providerSignature))
}

export function isAiDraftDirty(draft: AiDraftState, persisted: AiPersistedState): boolean {
  if (providerListSignature(draft.providers) !== providerListSignature(persisted.providers)) return true
  if (draftChoiceSignature(draft.activeChoice) !== activePairSignature(persisted.activeProviderId, persisted.activeModelId)) return true
  if (JSON.stringify(draft.searchProviders.map(searchSignature)) !== JSON.stringify(persisted.searchProviders.map(searchSignature))) return true
  return draft.activeSearchProviderId !== persisted.activeSearchProviderId
}
