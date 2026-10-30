import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { createRenderer, h, nextTick, reactive, shallowRef } from 'vue'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { DataSourceCollection } from 'cesium'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('/StreamingMarkdown.vue')) return nextLoad(url, context)
    const { descriptor } = parse(readFileSync(new URL(url), 'utf8'))
    const compiled = compileScript(descriptor, { id: 'review-markdown', inlineTemplate: true })
    const source = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText
    return { format: 'module', source, shortCircuit: true }
  }
})

const { default: StreamingMarkdown } = await import('../src/renderer/src/components/StreamingMarkdown.vue')
const { useThematicLayers } = await import('../src/renderer/src/composables/useThematicLayers.ts')
const { useClimateStore } = await import('../src/renderer/src/stores/climate.ts')
const { useOnlineDataStore } = await import('../src/renderer/src/stores/onlineData.ts')
const { useFailureStore } = await import('../src/renderer/src/stores/failure.ts')

const renderer = createRenderer({
  createElement: (tag) => ({ tag, children: [] }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text },
  patchProp: (node, key, _previous, value) => { node[key] = value },
  insert: (node, parent) => { parent.children.push(node) },
  remove() {},
  parentNode: () => null,
  nextSibling: () => null
})

test('streaming Markdown coalesces updates for 50ms, flushes completion and cancels unmount work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const props = reactive({ text: 'initial', streaming: true })
  let renders = 0
  const app = renderer.createApp({ setup: () => () => h(StreamingMarkdown, { ...props, onRendered: () => renders++ }) })
  app.mount({ children: [] })
  assert.equal(renders, 1)
  for (let index = 0; index < 8; index++) {
    props.text = `stream-${index}`
    await nextTick()
  }
  assert.equal(renders, 1)
  t.mock.timers.tick(49)
  await nextTick()
  assert.equal(renders, 1)
  t.mock.timers.tick(1)
  await nextTick()
  assert.equal(renders, 2)
  props.text = 'final text'
  await nextTick()
  props.streaming = false
  await nextTick()
  assert.equal(renders, 3)
  t.mock.timers.tick(50)
  assert.equal(renders, 3)
  props.streaming = true
  props.text = 'pending'
  await nextTick()
  app.unmount()
  t.mock.timers.tick(50)
  assert.equal(renders, 3)
})

test('thematic sources clean up across viewer changes, delayed additions and unmount', async (t) => {
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.cancelAnimationFrame = () => {}
  globalThis.document = document
  const pendingFeeds = []
  globalThis.window = { guEarth: { datasets: {
    getEarthquakes: () => new Promise((resolve) => pendingFeeds.push(resolve)),
    getOnlineData: async () => ({ revision: 1, earthquakes: null, earthquakeError: '', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }),
    onOnlineData: () => () => {}
  } } }
  t.after(() => { globalThis.document = originalDocument; globalThis.window = originalWindow; globalThis.cancelAnimationFrame = originalCancel })
  setActivePinia(createPinia())
  const store = useClimateStore()
  store.setOverlay('enso', true)
  store.setOverlay('plate-tectonics', true)
  const makeViewer = () => ({ isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() })
  const first = makeViewer()
  const second = makeViewer()
  const added = []
  const originalAdd = first.dataSources.add.bind(first.dataSources)
  first.dataSources.add = (source) => new Promise((resolve) => added.push(async () => resolve(await originalAdd(source))))
  const viewer = shallowRef(first)
  const app = renderer.createApp({ setup() { useThematicLayers(viewer); return () => h('div') } })
  app.mount({ children: [] })
  viewer.value = second
  await nextTick()
  await Promise.all(added.map((add) => add()))
  await nextTick()
  assert.equal(first.dataSources.length, 0)
  assert.equal(second.dataSources.length, 2)
  const obsolete = second.dataSources.getByName('plate-tectonics')[0]
  const before = obsolete.entities.values.length
  store.setOverlay('plate-tectonics', false)
  await nextTick()
  for (const resolveFeed of pendingFeeds) resolveFeed({ events: [{ longitude: 120, latitude: 30, magnitude: 5, depthKm: 10, place: 'test' }] })
  await nextTick()
  assert.equal(obsolete.entities.values.length, before)
  assert.equal(second.dataSources.getByName('plate-tectonics').length, 0)
  assert.equal(second.dataSources.length, 1)
  app.unmount()
  assert.equal(second.dataSources.length, 0)
})

test('earthquake failures stay retryable and retry refreshes the feed', async (t) => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  globalThis.cancelAnimationFrame = () => {}
  const refreshRequests = []
  globalThis.window = { guEarth: { datasets: {
    getEarthquakes: (refresh = false) => {
      refreshRequests.push(refresh)
      if (refreshRequests.length === 1) return Promise.reject(new Error('offline'))
      return Promise.resolve({ fetchedAt: 2, events: [{ longitude: 120, latitude: 30, magnitude: 6, depthKm: 10, place: 'test', time: 1 }] })
    },
    getOnlineData: async () => ({ revision: 1, earthquakes: null, earthquakeError: 'offline', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }),
    onOnlineData: () => () => {}
  } } }
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useClimateStore()
  const failure = useFailureStore()
  store.setOverlay('plate-tectonics', true)
  const current = { isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() }
  const app = renderer.createApp({ setup() { useThematicLayers(shallowRef(current)); return () => h('div') } })
  t.after(() => {
    app.unmount()
    disposePinia(pinia)
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.cancelAnimationFrame = originalCancel
  })
  app.mount({ children: [] })
  await nextTick()
  await nextTick()
  assert.equal(failure.notices.dataset?.retryable, true)
  assert.deepEqual(refreshRequests, [false])
  await failure.retry('dataset')
  await nextTick()
  assert.deepEqual(refreshRequests, [false, true])
  assert.equal(failure.notices.dataset, undefined)
  const source = current.dataSources.getByName('plate-tectonics')[0]
  assert.equal(source.entities.values.filter((entity) => entity.id.startsWith('earthquake-')).length, 1)
})

test('typhoon layers fetch newly configured data on demand and ignore obsolete IPC replies', async (t) => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  globalThis.cancelAnimationFrame = () => {}
  const initial = { revision: 1, earthquakes: null, earthquakeError: '', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }
  let notify
  let resolveInitial
  let unsubscribed = false
  const requests = []
  globalThis.window = { guEarth: { datasets: {
    getOnlineData: () => new Promise((resolve) => { resolveInitial = resolve }),
    onOnlineData: (listener) => { notify = listener; return () => { unsubscribed = true } },
    ensureTyphoons: () => new Promise((resolve) => requests.push(resolve))
  } } }
  const pinia = createPinia()
  setActivePinia(pinia)
  const climate = useClimateStore()
  const online = useOnlineDataStore()
  const current = { isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() }
  const app = renderer.createApp({ setup() { useThematicLayers(shallowRef(current)); return () => h('div') } })
  t.after(() => {
    app.unmount()
    disposePinia(pinia)
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.cancelAnimationFrame = originalCancel
    assert.equal(unsubscribed, true)
  })
  app.mount({ children: [] })
  const pending = { ...initial, revision: 2, typhoonConfigured: true, typhoonStatus: 'pending' }
  notify(pending)
  resolveInitial(initial)
  await online.load()
  assert.equal(online.snapshot, pending)
  assert.equal(requests.length, 0)
  climate.setOverlay('typhoon', true)
  await nextTick()
  await nextTick()
  assert.equal(requests.length, 1)
  const loading = { ...pending, revision: 3, typhoonStatus: 'loading' }
  notify(loading)
  const point = { time: '2026-10-30T00:00:00Z', longitude: 129, latitude: 20, type: 'TY', pressure: 970, windSpeed: 35 }
  const feed = { fetchedAt: 100, sources: [], license: [], storms: [{ id: 'NP_TEST', name: 'test', active: true, now: point, track: [], forecast: [], forecastError: '' }] }
  const live = { ...pending, revision: 4, typhoonStatus: 'ready', typhoons: feed }
  notify(live)
  requests[0](loading)
  await nextTick()
  await nextTick()
  assert.equal(online.snapshot, live)
  const source = current.dataSources.getByName('typhoon')[0]
  assert.equal(source.entities.values.filter((entity) => entity.label).length, 1)
  online.setTyphoonMode('history')
  await nextTick()
  online.setTyphoonMode('live')
  await nextTick()
  assert.equal(requests.length, 1)
  notify({ ...pending, revision: 5 })
  await nextTick()
  await nextTick()
  assert.equal(requests.length, 2)
  const removed = { ...initial, revision: 7 }
  notify(removed)
  requests[1]({ ...live, revision: 6 })
  await nextTick()
  await nextTick()
  assert.equal(online.snapshot, removed)
  assert.equal(source.entities.values.some((entity) => entity.properties?.cached), false)
  assert.equal(requests.length, 2)
})
