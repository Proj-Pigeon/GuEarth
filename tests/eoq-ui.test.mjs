import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { JSDOM } from 'jsdom'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from 'typescript'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })

function installDomGlobals() {
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
}

installDomGlobals()

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === '../posthog' ||
      specifier.endsWith('/posthog') ||
      specifier === '@renderer/posthog'
    ) {
      return { url: 'stub://renderer-posthog', shortCircuit: true }
    }
    if (specifier.startsWith('@renderer/')) {
      const target = resolve('src/renderer/src', specifier.slice(10))
      if (/\.[a-z]+$/i.test(target)) return nextResolve(pathToFileURL(target).href, context)
      try {
        return nextResolve(pathToFileURL(`${target}.ts`).href, context)
      } catch {
        return nextResolve(pathToFileURL(`${target}.tsx`).href, context)
      }
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        try {
          return nextResolve(`${specifier}.ts`, context)
        } catch {
          return nextResolve(`${specifier}.tsx`, context)
        }
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (url === 'stub://renderer-posthog') {
      return {
        format: 'module',
        source:
          'export function captureAiUsageEvent() {} export function captureTelemetryEvent() {} export function syncPosthogPrivacy() {} export function capturePosthogException() {} export function identifyTelemetryUser() {} export function isTelemetryUserIdentified() { return false } export function resetTelemetryIdentity() {}',
        shortCircuit: true
      }
    }
    if (url.endsWith('.module.css')) {
      return {
        format: 'module',
        source: 'export default new Proxy({}, { get: (_target, prop) => String(prop) })',
        shortCircuit: true
      }
    }
    if (url.endsWith('.tsx')) {
      const source = transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {
          jsx: JsxEmit.ReactJSX,
          module: ModuleKind.ESNext,
          target: ScriptTarget.ES2022
        }
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  }
})

const { convertChatMessage } =
  await import('../src/renderer/src/components/eoq/EoqRuntimeProvider.tsx')
const { default: EoqWebSearch } =
  await import('../src/renderer/src/components/eoq/EoqWebSearch.tsx')
const { default: EoqWelcome } = await import('../src/renderer/src/components/eoq/EoqWelcome.tsx')

test('convertChatMessage preserves reasoning and tool timing plus error states', () => {
  const converted = convertChatMessage({
    id: 'a1',
    role: 'assistant',
    content: '结果已就绪',
    status: 'done',
    error: '',
    parts: [
      { kind: 'reasoning', id: 'r1', text: '先定位坐标', ms: 1400, startedAt: 1000 },
      {
        kind: 'tool',
        step: {
          callId: 'c1',
          name: 'search_place',
          args: { query: '珠穆朗玛峰' },
          status: 'ok',
          summary: '已找到珠穆朗玛峰',
          result: '{"lat":27.9881,"lng":86.925}',
          startedAt: 2400,
          completedAt: 3100
        }
      },
      {
        kind: 'tool',
        step: {
          callId: 'c2',
          name: 'query_terrain',
          args: {},
          status: 'error',
          summary: '地形服务超时',
          result: '{"error":"timeout"}'
        }
      },
      { kind: 'text', text: '结果已就绪' }
    ]
  })

  assert.equal(converted.role, 'assistant')
  assert.ok(Array.isArray(converted.content))
  const [reasoningPart, okToolPart, errToolPart, textPart] = converted.content
  assert.equal(reasoningPart.type, 'reasoning')
  assert.deepEqual(reasoningPart.timing, { startedAt: 1000, completedAt: 2400 })
  assert.equal(okToolPart.type, 'tool-call')
  assert.deepEqual(okToolPart.timing, { startedAt: 2400, completedAt: 3100 })
  assert.equal(okToolPart.isError, false)
  assert.equal(errToolPart.type, 'tool-call')
  assert.equal(errToolPart.isError, true)
  assert.equal(textPart.type, 'text')
})

test('EoqComposer uses native assistant-ui ComposerPrimitive without nested Ant Input or danger stop button', () => {
  const composerSource = readFileSync(
    resolve('src/renderer/src/components/eoq/EoqComposer.tsx'),
    'utf8'
  )
  assert.match(composerSource, /ComposerPrimitive\.Root/)
  assert.match(composerSource, /ComposerPrimitive\.Input/)
  assert.match(composerSource, /ComposerPrimitive\.Send/)
  assert.match(composerSource, /ComposerPrimitive\.Cancel/)
  assert.match(composerSource, /SquareIcon/)
  assert.doesNotMatch(composerSource, /Input\.TextArea/)
  assert.doesNotMatch(composerSource, /BorderOutlined/)
  assert.doesNotMatch(composerSource, /danger/)

  const mainCss = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')
  assert.match(mainCss, /@import 'tw-shimmer';/)
  assert.match(mainCss, /@theme inline/)

  const markdownSource = readFileSync(
    resolve('src/renderer/src/components/eoq/EoqMarkdownText.tsx'),
    'utf8'
  )
  assert.match(markdownSource, /useMessagePartText/)
  assert.match(markdownSource, /StreamingMarkdown/)
  assert.match(markdownSource, /status\.type === 'running'/)
})

test('EoqWebSearch filters unsafe links, toggles extra sources, and exposes retry on error', t => {
  installDomGlobals()
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.after(() => {
    act(() => root.unmount())
    container.remove()
  })

  const references = [
    { title: '安全来源 1', url: 'https://example.com/1', website: 'example.com', content: '' },
    { title: '不安全来源', url: 'javascript:alert(1)', website: 'bad.local', content: '' },
    { title: '安全来源 2', url: 'https://example.org/2', website: 'example.org', content: '' },
    { title: '安全来源 3', url: 'https://example.net/3', website: 'example.net', content: '' }
  ]

  act(() => {
    root.render(
      createElement(EoqWebSearch, {
        busy: false,
        step: {
          callId: 'ws-1',
          name: 'web_search',
          args: { query: '丹霞地貌成因' },
          status: 'ok',
          summary: '',
          result: '',
          references
        }
      })
    )
  })

  assert.equal(container.querySelectorAll('a').length, 2)
  assert.match(container.textContent ?? '', /已阅读 4 个来源/)
  const expandButton = Array.from(container.querySelectorAll('button')).find(el =>
    (el.textContent ?? '').includes('展开其余 1 个来源')
  )
  assert.ok(expandButton)
  act(() => {
    expandButton.click()
  })
  assert.equal(container.querySelectorAll('a').length, 3)

  let retried = ''
  act(() => {
    root.render(
      createElement(EoqWebSearch, {
        busy: false,
        onRetry: query => {
          retried = query
        },
        step: {
          callId: 'ws-2',
          name: 'web_search',
          args: { query: '黄土高原' },
          status: 'error',
          summary: '网络异常',
          result: '{"error":"搜索服务暂不可用"}'
        }
      })
    )
  })

  assert.match(container.textContent ?? '', /搜索服务暂不可用/)
  const retryButton = container.querySelector('button')
  assert.ok(retryButton)
  act(() => {
    retryButton.click()
  })
  assert.equal(retried, '黄土高原')
})

test('EoqWelcome renders suggestions, cycles on refresh, and submits clicked prompt', t => {
  installDomGlobals()
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.after(() => {
    act(() => root.unmount())
    container.remove()
  })

  let submitted = ''
  act(() => {
    root.render(
      createElement(EoqWelcome, {
        onSelectPrompt: prompt => {
          submitted = prompt
        }
      })
    )
  })

  const initialButtons = Array.from(container.querySelectorAll('button'))
  assert.equal(initialButtons.length, 4)
  const firstLabel = initialButtons[0].textContent ?? ''
  act(() => {
    initialButtons[0].click()
  })
  assert.ok(submitted.length > 0)

  const refreshButton = initialButtons[3]
  act(() => {
    refreshButton.click()
  })
  const nextFirstLabel = container.querySelectorAll('button')[0].textContent ?? ''
  assert.notEqual(nextFirstLabel, firstLabel)
})
