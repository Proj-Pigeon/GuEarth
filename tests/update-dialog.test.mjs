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
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node

let forceMarkdownMode = 'normal'
const realMarkdownUrl = pathToFileURL(resolve('src/renderer/src/utils/markdown.ts')).href

const reactUrl = import.meta.resolve('react')
const antdStubUrl = `data:text/javascript,${encodeURIComponent(`
  import { createElement } from ${JSON.stringify(reactUrl)}
  export function Modal({ open, children }) {
    return open ? createElement('div', { className: 'mock-modal' }, children) : null
  }
  export const message = {
    success() {},
    error() {},
    warning() {},
    info() {}
  }
`)}`

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'antd') {
      return { url: antdStubUrl, shortCircuit: true }
    }
    if (
      specifier === '@renderer/utils/markdown' &&
      context.parentURL.endsWith('/UpdateDialog.tsx')
    ) {
      return { url: 'virtual:update-dialog-markdown', shortCircuit: true }
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
    if (url === 'virtual:update-dialog-markdown') {
      return {
        format: 'module',
        source: [
          `import { createElement } from ${JSON.stringify(reactUrl)}`,
          `import { tryRenderMarkdown as realTryRenderMarkdown } from ${JSON.stringify(realMarkdownUrl)}`,
          'export function tryRenderMarkdown(text) { return globalThis.__testTryRenderMarkdown(text, realTryRenderMarkdown, createElement) }'
        ].join('\n'),
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
    if (!url.endsWith('/UpdateDialog.tsx')) return nextLoad(url, context)
    const source = transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: {
        jsx: JsxEmit.ReactJSX,
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2022
      }
    }).outputText
    return { format: 'module', source, shortCircuit: true }
  }
})

globalThis.__testTryRenderMarkdown = (text, realTryRenderMarkdown, h) => {
  if (forceMarkdownMode === 'null') return null
  if (forceMarkdownMode === 'throw-in-vnode') {
    function BadChild() {
      throw new Error('render boom')
    }
    return [h(BadChild, { key: 'bad' })]
  }
  return realTryRenderMarkdown(text)
}

const { renderMarkdown, tryRenderMarkdown } = await import(realMarkdownUrl)
const { useUpdaterStore, resetUpdaterStore } = await import('../src/renderer/src/stores/updater.ts')
const { default: UpdateDialog } = await import('../src/renderer/src/components/UpdateDialog.tsx')

test('tryRenderMarkdown renders valid markdown and returns null on blank, empty output, or errors', () => {
  assert.equal(tryRenderMarkdown(''), null)
  assert.equal(tryRenderMarkdown('   \n\t  '), null)
  assert.equal(tryRenderMarkdown('[ref]: https://example.com'), null)
  assert.equal(
    tryRenderMarkdown('## 更新内容', () => {
      throw new Error('parse error')
    }),
    null
  )
  const nodes = tryRenderMarkdown(
    '## 更新内容\n\n- 支持 `Markdown`\n- [详情](https://example.com)',
    renderMarkdown
  )
  assert.ok(Array.isArray(nodes) && nodes.length > 0)
})

test('UpdateDialog renders markdown release notes, hides blank notes, and falls back to plain text on failure', async t => {
  forceMarkdownMode = 'normal'
  resetUpdaterStore()
  useUpdaterStore.setState({
    promptVisible: true,
    currentVersion: '0.1.17',
    version: '0.1.18',
    notes: '## 更新内容\n\n- 新增 **Markdown** 渲染\n- 支持 `code` 与 [链接](https://example.com)'
  })

  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const originalConsoleError = console.error
  console.error = () => {}
  t.after(() => {
    console.error = originalConsoleError
    act(() => root.unmount())
    container.remove()
    forceMarkdownMode = 'normal'
    resetUpdaterStore()
  })

  act(() => {
    root.render(createElement(UpdateDialog))
  })

  const markdownBox = container.querySelector('.updateNotesMarkdown')
  assert.ok(markdownBox)
  assert.equal(container.querySelector('.updateNotesPlain'), null)
  for (const tag of ['h2', 'ul', 'li', 'strong', 'code', 'a']) {
    assert.ok(markdownBox.querySelector(tag), `expected <${tag}> inside markdown box`)
  }

  act(() => {
    forceMarkdownMode = 'null'
    useUpdaterStore.setState({ notes: '## 原始文本\n- item' })
  })
  assert.equal(container.querySelector('.updateNotesMarkdown'), null)
  const plainFallback = container.querySelector('.updateNotesPlain')
  assert.ok(plainFallback)
  assert.equal(plainFallback.textContent, '## 原始文本\n- item')

  act(() => {
    forceMarkdownMode = 'throw-in-vnode'
    useUpdaterStore.setState({ notes: '## 运行时渲染失败\n- fallback' })
  })
  assert.equal(container.querySelector('.updateNotesMarkdown'), null)
  const errorFallback = container.querySelector('.updateNotesPlain')
  assert.ok(errorFallback)
  assert.equal(errorFallback.textContent, '## 运行时渲染失败\n- fallback')

  act(() => {
    forceMarkdownMode = 'normal'
    useUpdaterStore.setState({ notes: '   \n  ' })
  })
  assert.equal(container.querySelector('.updateNotesMarkdown'), null)
  assert.equal(container.querySelector('.updateNotesPlain'), null)
})
