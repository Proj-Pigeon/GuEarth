import assert from 'node:assert/strict'
import { test, vi } from 'vite-plus/test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from '@typescript/typescript6'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DataSourceCollection } from 'cesium'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })

function installDomGlobals() {
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

installDomGlobals()

registerHooks({
  resolve(specifier, context, nextResolve) {
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

const { default: StreamingMarkdown } = await import('../src/renderer/src/components/StreamingMarkdown.tsx')
const { useThematicLayers } = await import('../src/renderer/src/composables/useThematicLayers.ts')
const { useClimateStore, resetClimateStore } = await import('../src/renderer/src/stores/climate.ts')
const { useOnlineDataStore, resetOnlineDataStore } = await import('../src/renderer/src/stores/onlineData.ts')
const { useFailureStore, resetFailureStore } = await import('../src/renderer/src/stores/failure.ts')

function ThematicHarness({ viewer }) {
  useThematicLayers(viewer)
  return createElement('div')
}

test('streaming Markdown coalesces updates for 50ms, settles idle tail and cancels unmount work', async (t) => {
  installDomGlobals()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  t.onTestFinished(() => vi.useRealTimers())
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
  })

  let renders = 0
  const renderComponent = (text, streaming) => {
    act(() => {
      root.render(createElement(StreamingMarkdown, { text, streaming, onRendered: () => { renders += 1 } }))
    })
  }
  const hasStreamingArtifacts = () =>
    Boolean(container.querySelector('.stream-token, .stream-caret'))

  renderComponent('initial', true)
  assert.equal(renders, 1)
  assert.equal(hasStreamingArtifacts(), true)

  for (let index = 0; index < 8; index += 1) {
    renderComponent(`stream-${index}`, true)
  }
  assert.equal(renders, 1)

  act(() => {
    vi.advanceTimersByTime(49)
  })
  assert.equal(renders, 1)

  act(() => {
    vi.advanceTimersByTime(1)
  })
  assert.equal(renders, 2)
  assert.equal(hasStreamingArtifacts(), true)

  act(() => {
    vi.advanceTimersByTime(260)
  })
  assert.equal(renders, 2)
  assert.equal(hasStreamingArtifacts(), false)

  renderComponent('resumed stream', true)
  assert.equal(renders, 3)
  assert.equal(hasStreamingArtifacts(), true)

  renderComponent('final text', false)
  assert.equal(renders, 4)
  assert.equal(hasStreamingArtifacts(), false)

  act(() => {
    vi.advanceTimersByTime(50)
  })
  assert.equal(renders, 4)

  renderComponent('pending', true)
  act(() => {
    root.unmount()
  })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  assert.equal(renders, 4)
})

test('thematic sources clean up across viewer changes, delayed additions and unmount', async (t) => {
  installDomGlobals()
  const pendingFeeds = []
  dom.window.guEarth = {
    datasets: {
      getEarthquakes: () => new Promise((resolveFeed) => pendingFeeds.push(resolveFeed)),
      getOnlineData: async () => ({ revision: 1, earthquakes: null, earthquakeError: '', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }),
      onOnlineData: () => () => {}
    }
  }
  resetClimateStore()
  resetOnlineDataStore()
  resetFailureStore()

  useClimateStore.getState().setOverlay('enso', true)
  useClimateStore.getState().setOverlay('plate-tectonics', true)

  const makeViewer = () => ({ isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() })
  const first = makeViewer()
  const second = makeViewer()
  const added = []
  const originalAdd = first.dataSources.add.bind(first.dataSources)
  first.dataSources.add = (source) => new Promise((resolveAdd) => added.push(async () => resolveAdd(await originalAdd(source))))

  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
    resetOnlineDataStore()
    resetClimateStore()
    resetFailureStore()
    delete dom.window.guEarth
  })

  await act(async () => {
    root.render(createElement(ThematicHarness, { viewer: first }))
  })
  await act(async () => {
    root.render(createElement(ThematicHarness, { viewer: second }))
  })
  await Promise.all(added.map((add) => add()))

  assert.equal(first.dataSources.length, 0)
  assert.equal(second.dataSources.length, 2)
  const obsolete = second.dataSources.getByName('plate-tectonics')[0]
  const before = obsolete.entities.values.length
  act(() => {
    useClimateStore.getState().setOverlay('plate-tectonics', false)
  })
  for (const resolveFeed of pendingFeeds) resolveFeed({ events: [{ longitude: 120, latitude: 30, magnitude: 5, depthKm: 10, place: 'test' }] })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(obsolete.entities.values.length, before)
  assert.equal(second.dataSources.getByName('plate-tectonics').length, 0)
  assert.equal(second.dataSources.length, 1)

  act(() => {
    root.unmount()
  })
  assert.equal(second.dataSources.length, 0)
})

test('earthquake failures stay retryable and retry refreshes the feed', async (t) => {
  installDomGlobals()
  const refreshRequests = []
  dom.window.guEarth = {
    datasets: {
      getEarthquakes: (refresh = false) => {
        refreshRequests.push(refresh)
        if (refreshRequests.length === 1) return Promise.reject(new Error('offline'))
        return Promise.resolve({ fetchedAt: 2, events: [{ longitude: 120, latitude: 30, magnitude: 6, depthKm: 10, place: 'test', time: 1 }] })
      },
      getOnlineData: async () => ({ revision: 1, earthquakes: null, earthquakeError: 'offline', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }),
      onOnlineData: () => () => {}
    }
  }
  resetClimateStore()
  resetOnlineDataStore()
  resetFailureStore()

  useClimateStore.getState().setOverlay('plate-tectonics', true)
  const current = { isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() }
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
    resetOnlineDataStore()
    resetClimateStore()
    resetFailureStore()
    delete dom.window.guEarth
  })

  await act(async () => {
    root.render(createElement(ThematicHarness, { viewer: current }))
  })
  assert.equal(useFailureStore.getState().notices.dataset?.retryable, true)
  assert.deepEqual(refreshRequests, [false])

  await act(async () => {
    await useFailureStore.getState().retry('dataset')
  })
  assert.deepEqual(refreshRequests, [false, true])
  assert.equal(useFailureStore.getState().notices.dataset, undefined)
  const source = current.dataSources.getByName('plate-tectonics')[0]
  assert.equal(source.entities.values.filter((entity) => entity.id.startsWith('earthquake-')).length, 1)
})

test('stale earthquake cache keeps a retryable failure until a fresh feed arrives', async (t) => {
  installDomGlobals()
  const refreshRequests = []
  dom.window.guEarth = {
    datasets: {
      getEarthquakes: (refresh = false) => {
        refreshRequests.push(refresh)
        if (!refresh) {
          return Promise.resolve({ fetchedAt: 1, stale: true, events: [{ longitude: 120, latitude: 30, magnitude: 5, depthKm: 10, place: 'cached', time: 1 }] })
        }
        return Promise.resolve({ fetchedAt: 2, events: [{ longitude: 121, latitude: 31, magnitude: 6, depthKm: 10, place: 'fresh', time: 2 }] })
      },
      getOnlineData: async () => ({ revision: 1, earthquakes: null, earthquakeError: '', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }),
      onOnlineData: () => () => {}
    }
  }
  resetClimateStore()
  resetOnlineDataStore()
  resetFailureStore()

  useClimateStore.getState().setOverlay('plate-tectonics', true)
  const current = { isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() }
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
    resetOnlineDataStore()
    resetClimateStore()
    resetFailureStore()
    delete dom.window.guEarth
  })

  await act(async () => {
    root.render(createElement(ThematicHarness, { viewer: current }))
  })
  assert.equal(useFailureStore.getState().notices.dataset?.retryable, true)
  assert.match(useFailureStore.getState().notices.dataset?.message ?? '', /缓存/)
  const source = current.dataSources.getByName('plate-tectonics')[0]
  assert.equal(source.entities.values.filter((entity) => entity.id.startsWith('earthquake-')).length, 1)

  await act(async () => {
    await useFailureStore.getState().retry('dataset')
  })
  assert.deepEqual(refreshRequests, [false, true])
  assert.equal(useFailureStore.getState().notices.dataset, undefined)
  assert.equal(source.entities.values.filter((entity) => entity.id.startsWith('earthquake-')).length, 1)
})

test('typhoon layers fetch newly configured data on demand and ignore obsolete IPC replies', async (t) => {
  installDomGlobals()
  const initial = { revision: 1, earthquakes: null, earthquakeError: '', typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }
  let notify
  let resolveInitial
  let unsubscribed = false
  const requests = []
  dom.window.guEarth = {
    datasets: {
      getOnlineData: () => new Promise((resolveData) => { resolveInitial = resolveData }),
      onOnlineData: (listener) => { notify = listener; return () => { unsubscribed = true } },
      ensureTyphoons: () => new Promise((resolveTyphoons) => requests.push(resolveTyphoons))
    }
  }
  resetClimateStore()
  resetOnlineDataStore()
  resetFailureStore()

  const current = { isDestroyed: () => false, scene: { requestRender() {} }, camera: { flyTo() {} }, dataSources: new DataSourceCollection() }
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
    resetOnlineDataStore()
    resetClimateStore()
    resetFailureStore()
    delete dom.window.guEarth
    assert.equal(unsubscribed, true)
  })

  await act(async () => {
    root.render(createElement(ThematicHarness, { viewer: current }))
  })
  const pending = { ...initial, revision: 2, typhoonConfigured: true, typhoonStatus: 'pending' }
  act(() => {
    notify(pending)
    resolveInitial(initial)
  })
  await useOnlineDataStore.getState().load()
  assert.equal(useOnlineDataStore.getState().snapshot, pending)
  assert.equal(requests.length, 0)

  await act(async () => {
    useClimateStore.getState().setOverlay('typhoon', true)
  })
  assert.equal(requests.length, 1)

  const loading = { ...pending, revision: 3, typhoonStatus: 'loading' }
  const point = { time: '2026-10-30T00:00:00Z', longitude: 129, latitude: 20, type: 'TY', pressure: 970, windSpeed: 35 }
  const feed = { fetchedAt: 100, sources: [], license: [], storms: [{ id: 'NP_TEST', name: 'test', active: true, now: point, track: [], forecast: [], forecastError: '' }] }
  const live = { ...pending, revision: 4, typhoonStatus: 'ready', typhoons: feed }

  await act(async () => {
    notify(loading)
    notify(live)
    requests[0](loading)
  })
  assert.equal(useOnlineDataStore.getState().snapshot, live)
  const source = current.dataSources.getByName('typhoon')[0]
  assert.equal(source.entities.values.filter((entity) => entity.label).length, 1)

  act(() => {
    useOnlineDataStore.getState().setTyphoonMode('history')
  })
  act(() => {
    useOnlineDataStore.getState().setTyphoonMode('live')
  })
  assert.equal(requests.length, 1)

  await act(async () => {
    notify({ ...pending, revision: 5 })
  })
  assert.equal(requests.length, 2)

  const removed = { ...initial, revision: 7 }
  await act(async () => {
    notify(removed)
    requests[1]({ ...live, revision: 6 })
  })
  assert.equal(useOnlineDataStore.getState().snapshot, removed)
  assert.equal(source.entities.values.some((entity) => entity.properties?.cached), false)
  assert.equal(requests.length, 2)
})
