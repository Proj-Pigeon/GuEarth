import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { createRenderer, defineComponent, h, nextTick, reactive } from 'vue'

let forceMarkdownMode = 'normal'
const updaterState = reactive({
  promptVisible: true,
  currentVersion: '0.1.17',
  version: '0.1.18',
  notes: '',
  startDownload() {},
  remindLater() {}
})

const realMarkdownUrl = pathToFileURL(resolve('src/renderer/src/utils/markdown.ts')).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@renderer/stores/updater') {
      return { url: 'virtual:updater-store', shortCircuit: true }
    }
    if (specifier === '@renderer/utils/markdown' && context.parentURL.endsWith('/UpdateDialog.vue')) {
      return { url: 'virtual:update-dialog-markdown', shortCircuit: true }
    }
    if (specifier.startsWith('@renderer/')) {
      return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (url === 'virtual:updater-store') {
      return {
        format: 'module',
        source: 'export const useUpdaterStore = () => globalThis.__testUpdaterStore',
        shortCircuit: true
      }
    }
    if (url === 'virtual:update-dialog-markdown') {
      return {
        format: 'module',
        source: [
          `import { tryRenderMarkdown as realTryRenderMarkdown } from ${JSON.stringify(realMarkdownUrl)}`,
          'export function tryRenderMarkdown(text) { return globalThis.__testTryRenderMarkdown(text, realTryRenderMarkdown) }'
        ].join('\n'),
        shortCircuit: true
      }
    }
    if (!url.endsWith('/UpdateDialog.vue')) return nextLoad(url, context)
    const { descriptor } = parse(readFileSync(new URL(url), 'utf8'))
    const compiled = compileScript(descriptor, { id: 'update-dialog-test', inlineTemplate: true })
    const source = transpileModule(compiled.content, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 }
    }).outputText
    return { format: 'module', source, shortCircuit: true }
  }
})

globalThis.__testUpdaterStore = updaterState
globalThis.__testTryRenderMarkdown = (text, realTryRenderMarkdown) => {
  if (forceMarkdownMode === 'null') return null
  if (forceMarkdownMode === 'throw-in-vnode') {
    const BadChild = defineComponent({
      setup() {
        throw new Error('render boom')
      }
    })
    return [h(BadChild)]
  }
  return realTryRenderMarkdown(text)
}

const { renderMarkdown, tryRenderMarkdown } = await import(realMarkdownUrl)
const { default: UpdateDialog } = await import('../src/renderer/src/components/UpdateDialog.vue')

const renderer = createRenderer({
  createElement: (tag) => ({ tag, children: [], parent: null }),
  createText: (text) => ({ text, parent: null }),
  createComment: (text) => ({ text, parent: null }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text; node.children = [] },
  patchProp: (node, key, _previous, value) => { node[key] = value },
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) },
  remove: (node) => {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index >= 0) node.parent.children.splice(index, 1)
    node.parent = null
  },
  parentNode: (node) => node.parent ?? null,
  nextSibling: () => null
})

function findByClass(node, className) {
  if (!node) return null
  if (typeof node.class === 'string' && node.class.split(/\s+/).includes(className)) return node
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const hit = findByClass(child, className)
      if (hit) return hit
    }
  }
  return null
}

function collectTags(node, tags = []) {
  if (!node) return tags
  if (typeof node.tag === 'string') tags.push(node.tag)
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectTags(child, tags)
  }
  return tags
}

function collectText(node) {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.children)) return node.children.map(collectText).join('')
  return ''
}

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
  const nodes = tryRenderMarkdown('## 更新内容\n\n- 支持 `Markdown`\n- [详情](https://example.com)', renderMarkdown)
  assert.ok(Array.isArray(nodes) && nodes.length > 0)
})

test('UpdateDialog renders markdown release notes, hides blank notes, and falls back to plain text on failure', async (t) => {
  forceMarkdownMode = 'normal'
  updaterState.notes = '## 更新内容\n\n- 新增 **Markdown** 渲染\n- 支持 `code` 与 [链接](https://example.com)'
  const root = { children: [] }
  const app = renderer.createApp({
    setup: () => () => h(UpdateDialog)
  })
  app.component('AModal', defineComponent({
    props: { open: Boolean },
    setup(props, { slots }) {
      return () => (props.open ? h('div', { class: 'mock-modal' }, slots.default?.()) : null)
    }
  }))
  t.after(() => {
    app.unmount()
    forceMarkdownMode = 'normal'
    updaterState.notes = ''
  })
  app.mount(root)

  const markdownBox = findByClass(root, 'update-notes-markdown')
  assert.ok(markdownBox)
  assert.equal(findByClass(root, 'update-notes-plain'), null)
  const tags = collectTags(markdownBox)
  assert.ok(tags.includes('h2'))
  assert.ok(tags.includes('ul'))
  assert.ok(tags.includes('li'))
  assert.ok(tags.includes('strong'))
  assert.ok(tags.includes('code'))
  assert.ok(tags.includes('a'))

  forceMarkdownMode = 'null'
  updaterState.notes = '## 原始文本\n- item'
  await nextTick()
  assert.equal(findByClass(root, 'update-notes-markdown'), null)
  const plainFallback = findByClass(root, 'update-notes-plain')
  assert.ok(plainFallback)
  assert.equal(collectText(plainFallback), '## 原始文本\n- item')

  forceMarkdownMode = 'throw-in-vnode'
  updaterState.notes = '## 运行时渲染失败\n- fallback'
  await nextTick()
  await nextTick()
  assert.equal(findByClass(root, 'update-notes-markdown'), null)
  const errorFallback = findByClass(root, 'update-notes-plain')
  assert.ok(errorFallback)
  assert.equal(collectText(errorFallback), '## 运行时渲染失败\n- fallback')

  forceMarkdownMode = 'normal'
  updaterState.notes = '   \n  '
  await nextTick()
  assert.equal(findByClass(root, 'update-notes-markdown'), null)
  assert.equal(findByClass(root, 'update-notes-plain'), null)
})
