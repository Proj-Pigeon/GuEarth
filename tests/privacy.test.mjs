import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
import {
  DEFAULT_PRIVACY_SETTINGS,
  PRIVACY_DISCLOSURES,
  filterPosthogEvent,
  privacyDisclosureFor,
  resolvePrivacySettings
} from '../src/common/privacy.ts'
import {
  formatTelemetryToolCalls,
  normalizeModelTestOutput,
  redactApiKey,
  sanitizeTelemetryMessages,
  sanitizeTelemetryToolSpan,
  stripMemoryFromPrompt
} from '../src/common/aiTelemetry.ts'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

test('privacy defaults enable error reporting and disable telemetry/AI reporting with safe coercion', () => {
  assert.deepEqual(DEFAULT_PRIVACY_SETTINGS, {
    errorReportingEnabled: true,
    telemetryEnabled: false,
    aiTelemetryEnabled: false
  })
  assert.deepEqual(resolvePrivacySettings(undefined), DEFAULT_PRIVACY_SETTINGS)
  assert.deepEqual(resolvePrivacySettings({ errorReportingEnabled: 'false', telemetryEnabled: 1, aiTelemetryEnabled: null }), DEFAULT_PRIVACY_SETTINGS)
  assert.deepEqual(resolvePrivacySettings({ errorReportingEnabled: false, telemetryEnabled: false, aiTelemetryEnabled: true }), {
    errorReportingEnabled: false,
    telemetryEnabled: false,
    aiTelemetryEnabled: true
  })
})

test('privacy disclosures cover all three switches with non-empty collected data lists', () => {
  assert.deepEqual(
    PRIVACY_DISCLOSURES.map((item) => item.title),
    ['自动化收集错误信息', '上报遥测信息', '上报 AI 使用信息']
  )
  for (const key of ['errorReportingEnabled', 'telemetryEnabled', 'aiTelemetryEnabled']) {
    const item = privacyDisclosureFor(key)
    assert.ok(item.confirmTitle.length > 0)
    assert.match(item.confirmTitle, /“.*”/)
    assert.doesNotMatch(item.confirmTitle, /[「」]/)
    assert.ok(item.confirmIntro.length > 0)
    assert.ok(item.collectedItems.length >= 3)
    assert.ok(item.destinations.length > 0)
    assert.ok(item.notice.length > 0)
  }
})

test('filterPosthogEvent routes exception, AI, and product telemetry events independently', () => {
  const exceptionEvent = { event: '$exception' }
  const aiPromptEvent = { event: 'ai_prompt_submitted' }
  const aiGenerationEvent = { event: '$ai_generation' }
  const productEvent = { event: 'scene_saved' }

  const allDisabled = { errorReportingEnabled: false, telemetryEnabled: false, aiTelemetryEnabled: false }
  assert.equal(filterPosthogEvent(exceptionEvent, allDisabled), null)
  assert.equal(filterPosthogEvent(aiPromptEvent, allDisabled), null)
  assert.equal(filterPosthogEvent(aiGenerationEvent, allDisabled), null)
  assert.equal(filterPosthogEvent(productEvent, allDisabled), null)

  assert.equal(filterPosthogEvent(exceptionEvent, DEFAULT_PRIVACY_SETTINGS), exceptionEvent)
  assert.equal(filterPosthogEvent(productEvent, DEFAULT_PRIVACY_SETTINGS), null)
  assert.equal(filterPosthogEvent(aiPromptEvent, DEFAULT_PRIVACY_SETTINGS), null)
  assert.equal(filterPosthogEvent(aiGenerationEvent, DEFAULT_PRIVACY_SETTINGS), null)

  const onlyTelemetry = { errorReportingEnabled: false, telemetryEnabled: true, aiTelemetryEnabled: false }
  assert.equal(filterPosthogEvent(exceptionEvent, onlyTelemetry), null)
  assert.equal(filterPosthogEvent(productEvent, onlyTelemetry), productEvent)
  assert.equal(filterPosthogEvent(aiPromptEvent, onlyTelemetry), null)

  const onlyAi = { errorReportingEnabled: false, telemetryEnabled: false, aiTelemetryEnabled: true }
  assert.equal(filterPosthogEvent(exceptionEvent, onlyAi), null)
  assert.equal(filterPosthogEvent(productEvent, onlyAi), null)
  assert.equal(filterPosthogEvent(aiPromptEvent, onlyAi), aiPromptEvent)
  assert.equal(filterPosthogEvent(aiGenerationEvent, onlyAi), aiGenerationEvent)
})

test('AI telemetry sanitizer removes long-term memory, base64 images, save_memory content, and API keys', () => {
  const systemWithMemory = '你是地理助手。\n长期记忆：\n- 已保存的用户记忆：\n- mem_1：我在北京海淀教高中地理'
  assert.equal(stripMemoryFromPrompt(systemWithMemory), '你是地理助手。')

  assert.equal(redactApiKey('请求失败：sk-secret-123 被拒绝', 'sk-secret-123'), '请求失败：[redacted] 被拒绝')

  const sanitizedMessages = sanitizeTelemetryMessages([
    { role: 'system', content: systemWithMemory },
    { role: 'user', content: '带我看青藏高原' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'call_1', name: 'save_memory', arguments: JSON.stringify({ content: '用户喜欢高原地貌' }) },
        { id: 'call_2', name: 'capture_globe_view', arguments: '{}' }
      ]
    },
    {
      role: 'tool',
      callId: 'call_1',
      name: 'save_memory',
      content: JSON.stringify({ memorySaved: true, id: 'm1', content: '用户喜欢高原地貌', message: '已写入记忆' })
    },
    {
      role: 'tool',
      callId: 'call_2',
      name: 'capture_globe_view',
      content: JSON.stringify({ captured: true }),
      image: { mediaType: 'image/jpeg', data: 'SUPER_SECRET_BASE64_IMAGE_PAYLOAD' }
    }
  ])

  const serialized = JSON.stringify(sanitizedMessages)
  assert.doesNotMatch(serialized, /海淀/)
  assert.doesNotMatch(serialized, /高原地貌/)
  assert.doesNotMatch(serialized, /SUPER_SECRET_BASE64_IMAGE_PAYLOAD/)

  assert.deepEqual(sanitizedMessages[2].tool_calls, [
    { id: 'call_1', type: 'function', function: { name: 'save_memory', arguments: '{"content":"[redacted]"}' } },
    { id: 'call_2', type: 'function', function: { name: 'capture_globe_view', arguments: '{}' } }
  ])
  assert.equal(sanitizedMessages[3].tool_call_id, 'call_1')
  assert.equal(sanitizedMessages[4].tool_call_id, 'call_2')
  assert.match(String(sanitizedMessages[4].content), /\[image omitted\]/)

  const span = sanitizeTelemetryToolSpan(
    'save_memory',
    { content: '我的私人笔记' },
    { memorySaved: true, id: 'm2', content: '我的私人笔记' }
  )
  assert.doesNotMatch(JSON.stringify(span), /私人笔记/)
  assert.equal(span.input.content, '[redacted]')
  assert.equal(span.output.content, '[redacted]')

  assert.deepEqual(formatTelemetryToolCalls([{ id: 'c1', name: 'search_place', arguments: '{"q":"泰山"}' }]), [
    { id: 'c1', type: 'function', function: { name: 'search_place', arguments: '{"q":"泰山"}' } }
  ])
})

test('normalizeModelTestOutput converts OpenAI and Anthropic payloads to assistant message arrays', () => {
  assert.deepEqual(
    normalizeModelTestOutput('openai', { choices: [{ message: { role: 'assistant', content: 'hello' } }] }),
    [{ role: 'assistant', content: 'hello' }]
  )
  assert.deepEqual(
    normalizeModelTestOutput('anthropic', { content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }] }),
    [{ role: 'assistant', content: 'hi there' }]
  )
})

test('privacy store persists changes and fails closed on IPC update errors', async () => {
  let stored = { errorReportingEnabled: true, telemetryEnabled: false, aiTelemetryEnabled: false }
  let failUpdate = false

  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => ({ ...stored }),
        update: async (patch) => {
          if (failUpdate) throw new Error('disk full')
          stored = { ...stored, ...patch }
          return { ...stored }
        }
      }
    }
  }

  const { usePrivacyStore } = await import('../src/renderer/src/stores/privacy.ts')
  const { getPrivacySettings } = await import('../src/renderer/src/lib/privacyRuntime.ts')

  setActivePinia(createPinia())
  const store = usePrivacyStore()
  await store.hydrate()
  assert.equal(store.errorReportingEnabled, true)
  assert.equal(store.telemetryEnabled, false)
  assert.equal(store.aiTelemetryEnabled, false)
  assert.deepEqual(getPrivacySettings(), DEFAULT_PRIVACY_SETTINGS)

  failUpdate = true
  const failedEnable = await store.setPrivacySetting('telemetryEnabled', true)
  assert.equal(failedEnable, false)
  assert.equal(store.telemetryEnabled, false)
  assert.equal(getPrivacySettings().telemetryEnabled, false)

  failUpdate = false
  const enabledOk = await store.setPrivacySetting('telemetryEnabled', true)
  assert.equal(enabledOk, true)
  assert.equal(store.telemetryEnabled, true)
  assert.equal(getPrivacySettings().telemetryEnabled, true)

  failUpdate = true
  const failedDisable = await store.setPrivacySetting('telemetryEnabled', false)
  assert.equal(failedDisable, false)
  assert.equal(store.telemetryEnabled, true)
  assert.equal(getPrivacySettings().telemetryEnabled, true)

  failUpdate = false
  const disabledOk = await store.setPrivacySetting('telemetryEnabled', false)
  assert.equal(disabledOk, true)
  assert.equal(store.telemetryEnabled, false)
  assert.equal(getPrivacySettings().telemetryEnabled, false)
})

test('privacy store keeps error reporting disabled on hydrate failure and allows retry', async () => {
  let failGet = true
  let stored = {}

  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => {
          if (failGet) throw new Error('ipc unavailable')
          return { ...stored }
        },
        update: async (patch) => {
          stored = { ...stored, ...patch }
          return { ...stored }
        }
      }
    }
  }

  const { usePrivacyStore } = await import('../src/renderer/src/stores/privacy.ts')
  const { applyRendererPrivacySettings, getPrivacySettings } = await import('../src/renderer/src/lib/privacyRuntime.ts')
  applyRendererPrivacySettings({ errorReportingEnabled: false, telemetryEnabled: false, aiTelemetryEnabled: false })

  setActivePinia(createPinia())
  const store = usePrivacyStore()
  assert.equal(store.hydrated, false)
  assert.equal(store.errorReportingEnabled, false)

  await store.hydrate()
  assert.equal(store.hydrated, false)
  assert.equal(store.errorReportingEnabled, false)
  assert.equal(getPrivacySettings().errorReportingEnabled, false)

  failGet = false
  await store.hydrate()
  assert.equal(store.hydrated, true)
  assert.equal(store.errorReportingEnabled, true)
  assert.equal(getPrivacySettings().errorReportingEnabled, true)
})

test('privacy store preserves pending disable when an earlier overlapping update resolves first', async () => {
  const stored = { errorReportingEnabled: true, telemetryEnabled: false, aiTelemetryEnabled: false }
  const resolvers = []

  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => ({ ...stored }),
        update: (patch) => new Promise((resolve) => {
          resolvers.push({ patch, resolve })
        })
      }
    }
  }

  const { usePrivacyStore } = await import('../src/renderer/src/stores/privacy.ts')
  const { getPrivacySettings } = await import('../src/renderer/src/lib/privacyRuntime.ts')

  setActivePinia(createPinia())
  const store = usePrivacyStore()
  await store.hydrate()
  assert.equal(store.errorReportingEnabled, true)
  assert.equal(store.telemetryEnabled, false)

  const enableTelemetry = store.setPrivacySetting('telemetryEnabled', true)
  const disableErrorReporting = store.setPrivacySetting('errorReportingEnabled', false)

  assert.equal(store.errorReportingEnabled, false)
  assert.equal(getPrivacySettings().errorReportingEnabled, false)
  assert.equal(resolvers.length, 2)

  resolvers[0].resolve({ errorReportingEnabled: true, telemetryEnabled: true, aiTelemetryEnabled: false })
  assert.equal(await enableTelemetry, true)
  assert.equal(store.telemetryEnabled, true)
  assert.equal(store.errorReportingEnabled, false)
  assert.equal(getPrivacySettings().errorReportingEnabled, false)

  resolvers[1].resolve({ errorReportingEnabled: false, telemetryEnabled: true, aiTelemetryEnabled: false })
  assert.equal(await disableErrorReporting, true)
  assert.equal(store.telemetryEnabled, true)
  assert.equal(store.errorReportingEnabled, false)
  assert.equal(getPrivacySettings().errorReportingEnabled, false)

  const enableAi = store.setPrivacySetting('aiTelemetryEnabled', true)
  resolvers[2].resolve({ errorReportingEnabled: false, telemetryEnabled: true, aiTelemetryEnabled: true })
  assert.equal(await enableAi, true)
  assert.equal(store.aiTelemetryEnabled, true)
  assert.equal(store.errorReportingEnabled, false)
})

test('gated log record exporter suppresses queued BatchLogRecordProcessor logs after disable', async () => {
  const { BatchLogRecordProcessor, LoggerProvider } = await import('@opentelemetry/sdk-logs')
  const { createGatedLogRecordExporter } = await import('../src/main/posthogLogs.ts')

  let enabled = true
  const exportedBodies = []
  let shutdownCalled = 0
  const baseExporter = {
    export(logs, resultCallback) {
      for (const record of logs) exportedBodies.push(record.body)
      resultCallback({ code: 0 })
    },
    async forceFlush() {},
    async shutdown() {
      shutdownCalled += 1
    }
  }

  const gatedProvider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exporter: createGatedLogRecordExporter(baseExporter, () => enabled),
        scheduledDelayMillis: 60_000
      })
    ]
  })
  const log = gatedProvider.getLogger('test')
  log.emit({ severityText: 'info', body: 'queued_before_disable' })
  enabled = false
  await gatedProvider.shutdown()
  assert.deepEqual(exportedBodies, [])
  assert.equal(shutdownCalled, 1)

  enabled = true
  const activeProvider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exporter: createGatedLogRecordExporter(baseExporter, () => enabled),
        scheduledDelayMillis: 60_000
      })
    ]
  })
  activeProvider.getLogger('test').emit({ severityText: 'info', body: 'exported_while_enabled' })
  await activeProvider.shutdown()
  assert.deepEqual(exportedBodies, ['exported_while_enabled'])
  assert.equal(shutdownCalled, 2)
})
