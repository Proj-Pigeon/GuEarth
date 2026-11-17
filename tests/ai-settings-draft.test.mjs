import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { isAiDraftDirty } = await import('../src/renderer/src/lib/aiSettingsDraft.ts')

function model(id, overrides = {}) {
  return {
    id,
    label: id,
    contextWindow: 128000,
    streaming: true,
    vision: false,
    thinking: false,
    thinkingLevel: 'medium',
    enabled: true,
    ...overrides
  }
}

function provider(id, overrides = {}) {
  return {
    id,
    name: `供应商 ${id}`,
    protocol: 'openai',
    baseUrl: `https://${id}.example.com`,
    models: [model(`${id}-chat`)],
    ...overrides
  }
}

const persisted = {
  providers: [provider('p1'), provider('p2')],
  activeProviderId: 'p1',
  activeModelId: 'p1-chat',
  searchProviders: [{ id: 'baidu', name: '百度千帆', kind: 'baidu' }],
  activeSearchProviderId: 'baidu'
}

function draft(overrides = {}) {
  return {
    providers: persisted.providers.map((item) => ({ ...item, models: item.models.map((entry) => ({ ...entry })) })),
    activeChoice: 'p1:p1-chat',
    searchProviders: persisted.searchProviders.map((item) => ({ ...item })),
    activeSearchProviderId: 'baidu',
    ...overrides
  }
}

test('a draft rebuilt from persisted settings is not dirty', () => {
  assert.equal(isAiDraftDirty(draft(), persisted), false)
})

test('provider edits mark the draft dirty', () => {
  const renamed = draft()
  renamed.providers[0].name = 'DeepSeek'
  assert.equal(isAiDraftDirty(renamed, persisted), true)

  const rehosted = draft()
  rehosted.providers[1].baseUrl = 'https://api.deepseek.com'
  assert.equal(isAiDraftDirty(rehosted, persisted), true)

  const reprotocol = draft()
  reprotocol.providers[0].protocol = 'anthropic'
  assert.equal(isAiDraftDirty(reprotocol, persisted), true)
})

test('model edits and list changes mark the draft dirty', () => {
  const flagged = draft()
  flagged.providers[0].models[0].vision = true
  assert.equal(isAiDraftDirty(flagged, persisted), true)

  const resized = draft()
  resized.providers[0].models[0].contextWindow = 200000
  assert.equal(isAiDraftDirty(resized, persisted), true)

  const added = draft()
  added.providers[0].models.push({ ...model('p1-reasoner') })
  assert.equal(isAiDraftDirty(added, persisted), true)

  const removed = draft()
  removed.providers.pop()
  assert.equal(isAiDraftDirty(removed, persisted), true)

  const reordered = draft()
  reordered.providers.reverse()
  assert.equal(isAiDraftDirty(reordered, persisted), true)
})

test('trimmed values are treated as unchanged', () => {
  const padded = draft()
  padded.providers[0].name = '  供应商 p1  '
  padded.providers[0].baseUrl = '  https://p1.example.com  '
  assert.equal(isAiDraftDirty(padded, persisted), false)
})

test('the active model choice marks the draft dirty', () => {
  const switched = draft({ activeChoice: 'p2:p2-chat' })
  assert.equal(isAiDraftDirty(switched, persisted), true)

  const cleared = draft({ activeChoice: '' })
  assert.equal(isAiDraftDirty(cleared, persisted), true)
})

test('a persisted provider without an active model matches an empty draft choice', () => {
  const withoutModel = { ...persisted, activeModelId: '' }
  assert.equal(isAiDraftDirty(draft({ activeChoice: '' }), withoutModel), false)
})

test('clearing the select to undefined matches an empty draft choice', () => {
  assert.equal(isAiDraftDirty(draft({ activeChoice: undefined }), persisted), true)

  const withoutModel = { ...persisted, activeModelId: '' }
  assert.equal(isAiDraftDirty(draft({ activeChoice: undefined }), withoutModel), false)
})

test('search provider edits mark the draft dirty', () => {
  const renamed = draft()
  renamed.searchProviders[0].name = '百度'
  assert.equal(isAiDraftDirty(renamed, persisted), true)

  const switched = draft({ activeSearchProviderId: 'other' })
  assert.equal(isAiDraftDirty(switched, persisted), true)
})
