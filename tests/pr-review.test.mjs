import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { transpileModule } from 'typescript'

const tileFsUrl = `data:text/javascript,${encodeURIComponent(`
  import { readdir, stat, unlink as remove } from 'node:fs/promises'
  export { readdir, stat }
  export const blocked = new Set()
  export async function unlink(path) {
    if (blocked.has(path)) throw Object.assign(new Error('locked'), { code: 'EACCES' })
    await remove(path)
  }
`)}`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'fs/promises' && context.parentURL.endsWith('/tileCacheFiles.ts')) return nextResolve(tileFsUrl, context)
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { blocked } = await import(tileFsUrl)
const { listTileFiles, pruneTileFiles } = await import('../src/main/tileCacheFiles.ts')
const { writeAtomic, serialQueue, writeJson } = await import('../src/main/jsonStore.ts')
const { createScenePlayerController, interpolateCamera } = await import('../src/renderer/src/composables/useScenePlayer.ts')
const { resetClimateStore } = await import('../src/renderer/src/stores/climate.ts')
const { resetGlobeStore } = await import('../src/renderer/src/stores/globe.ts')
const { resetScenesStore } = await import('../src/renderer/src/stores/scenes.ts')
const { resetSolarStore } = await import('../src/renderer/src/stores/solar.ts')
const { resetTransportStore } = await import('../src/renderer/src/stores/transport.ts')
const { renderMarkdown, renderStreamingMarkdown, createStreamingDelayState, settleStreamingDelayState } = await import('../src/renderer/src/utils/markdown.ts')

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'guearth-review-'))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

test('cache quota includes metadata and evicts complete oldest pairs', async (t) => {
  const path = await directory(t)
  for (const name of ['old', 'new']) {
    await writeFile(join(path, `${name}.bin`), Buffer.alloc(10))
    await writeFile(join(path, `${name}.json`), Buffer.alloc(10))
    if (name === 'old') for (const extension of ['bin', 'json']) await utimes(join(path, `${name}.${extension}`), 1, 1)
  }
  assert.equal((await listTileFiles(path)).reduce((sum, file) => sum + file.size, 0), 40)
  assert.equal(await pruneTileFiles(path, 20), 20)
  assert.deepEqual((await readdir(path)).sort(), ['new.bin', 'new.json'])
})

test('failed cache deletions remain in quota and orphan metadata is pruned', async (t) => {
  const path = await directory(t)
  const locked = join(path, 'locked.bin')
  await writeFile(locked, Buffer.alloc(10))
  await writeFile(join(path, 'locked.json'), Buffer.alloc(10))
  await writeFile(join(path, 'orphan.json'), Buffer.alloc(10))
  blocked.add(locked)
  t.after(() => blocked.delete(locked))
  assert.equal(await pruneTileFiles(path, 0), 10)
  assert.deepEqual(await readdir(path), ['locked.bin'])
})

test('atomic replacement exposes complete bytes and cleans failed temporary writes', async (t) => {
  const path = join(await directory(t), 'tile.bin')
  const before = Buffer.alloc(1024 * 1024, 1)
  const after = Buffer.alloc(before.length, 2)
  await writeAtomic(path, before)
  const writing = writeAtomic(path, after).then(() => true, () => false)
  for (let index = 0; index < 20; index += 1) {
    const data = await readFile(path)
    assert.ok(data.equals(before) || data.equals(after))
  }
  if (!await writing) await writeAtomic(path, after)
  assert.deepEqual(await readFile(path), after)
  const invalid = join(dirname(path), 'blocked')
  await mkdir(invalid)
  await assert.rejects(writeAtomic(invalid, after))
  assert.equal((await readdir(dirname(path))).some((file) => file.endsWith('.tmp')), false)
})

test('atomic writes retry transient rename failures and clean the temporary file', async (t) => {
  const path = join(await directory(t), 'retry.json')
  const source = await readFile(new URL('../src/main/jsonStore.ts', import.meta.url), 'utf8')
  assert.match(source, /attempt >= 4/)
  assert.match(source, /EACCES.*EBUSY.*EEXIST.*EPERM/s)
  await writeAtomic(path, '{"ok":true}')
  assert.equal(await readFile(path, 'utf8'), '{"ok":true}')
  assert.equal((await readdir(dirname(path))).some((file) => file.endsWith('.tmp')), false)
})

test('failed settings commits preserve memory and concurrent patches use the last committed state', async (t) => {
  const path = join(await directory(t), 'settings.json')
  const source = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const section = source.slice(source.indexOf('const enqueueSettings ='), source.indexOf('function proxyConfig('))
  const { outputText } = transpileModule(`${section}\nreturn { saveSettings, get: () => settings }`, {})
  const store = new Function('serialQueue', 'writeJson', 'structuredClone', 'settingsPath', 'settings', outputText)(serialQueue, writeJson, structuredClone, path, { first: 0, second: 0 })
  await mkdir(path)
  await assert.rejects(store.saveSettings((current) => ({ ...current, first: 1 })))
  assert.deepEqual(store.get(), { first: 0, second: 0 })
  await rm(path, { recursive: true })
  await Promise.all([
    store.saveSettings((current) => ({ ...current, first: 2 })),
    store.saveSettings((current) => ({ ...current, second: 3 }))
  ])
  assert.deepEqual(store.get(), { first: 2, second: 3 })
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), store.get())
})

test('prewarm cameras cross the antimeridian and heading zero by the shortest path', () => {
  const start = { longitude: 179, latitude: 0, height: 1000, heading: 350, pitch: -45 }
  const end = { longitude: -179, latitude: 10, height: 4000, heading: 10, pitch: -75 }
  const middle = interpolateCamera(start, end, 0.5)
  assert.equal(Math.abs(middle.longitude), 180)
  assert.equal(middle.heading, 0)
  assert.equal(middle.latitude, 5)
  assert.ok(Math.abs(middle.height - 2000) < 1e-8)
  assert.equal(middle.pitch, -60)
  assert.equal(interpolateCamera(start, end, 0).heading, 350)
  assert.equal(interpolateCamera(start, end, 1).heading, 10)
})

function playerFixture(t) {
  resetScenesStore()
  resetClimateStore()
  resetSolarStore()
  resetGlobeStore()
  resetTransportStore()
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  let requests = 0
  const viewer = {
    isDestroyed: () => false,
    scene: { mode: 3, globe: { tilesLoaded: true, maximumScreenSpaceError: 2, pick: () => undefined }, requestRender: () => { requests += 1 }, canvas: { clientWidth: 800, clientHeight: 600 } },
    camera: { setView() {}, flyTo(options) { options.complete() }, getPickRay: () => ({}) }
  }
  const player = createScenePlayerController(viewer, () => {}, () => {})
  const unmount = player.mount()
  t.after(unmount)
  const scene = { name: 'Sky', narration: '', flyDurationMs: 100, dwellMs: 100, snapshot: { camera: { longitude: 179, latitude: 30, height: 10000, heading: 350, pitch: 10 }, basemapId: '', overlays: [], month: 6, simTime: null } }
  const tick = async (ms) => { t.mock.timers.tick(ms); await nextTurn() }
  return { viewer, player, scene, tick, requests: () => requests }
}

test('sky-facing scenes advance once tiles are ready instead of waiting ten seconds', async (t) => {
  const { player, scene, tick } = playerFixture(t)
  const playing = player.play({ scenes: [scene], mode: 'auto' })
  for (let index = 0; index < 35; index += 1) await tick(120)
  assert.equal(player.getPlayerState().active, false)
  await playing
})

function walkReactNodes(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkReactNodes(item, visit)
  } else if (value && typeof value === 'object') {
    visit(value)
    if (value.props?.children !== undefined) walkReactNodes(value.props.children, visit)
  }
}

function childTextList(children) {
  if (children === undefined || children === null) return []
  return Array.isArray(children) ? children : [children]
}

test('AI markdown treats HTML as text and omits executable link and image attributes', () => {
  const nodes = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![x](data:image/svg+xml,boom) [safe](https://example.com)')
  const seen = []
  walkReactNodes(nodes, (node) => seen.push(node))
  assert.equal(seen.some((node) => node.type === 'script'), false)
  assert.equal(seen.some((node) => node.props?.dangerouslySetInnerHTML || node.props?.innerHTML || node.props?.onerror), false)
  assert.equal(seen.filter((node) => node.type === 'img').length, 0)
  const link = seen.find((node) => node.type === 'a')
  assert.equal(link.props.href, 'https://example.com')
  assert.equal(link.props.rel, 'noopener noreferrer')
})

test('streaming markdown tints the last two words, appends one caret and leaves code untouched', () => {
  const nodes = renderStreamingMarkdown('前言 **加粗** 结尾\n\n```js\nconst answer = 42\n```\n')
  const seen = []
  walkReactNodes(nodes, (node) => seen.push(node))
  const tokens = seen.filter((node) => node.props?.className?.includes('stream-token'))
  const fresh = seen.filter((node) => node.props?.className?.includes('stream-token-fresh'))
  const carets = seen.filter((node) => node.props?.className === 'stream-caret')
  assert.equal(tokens.length, 6)
  assert.equal(fresh.length, 2)
  assert.equal(carets.length, 1)
  assert.deepEqual(tokens.map((node) => node.props.children), ['前', '言', '加', '粗', '结', '尾'])
  assert.deepEqual(fresh.map((node) => node.props.children), ['结', '尾'])
  assert.equal(
    seen.some((node) => {
      if (node.type !== 'pre') return false
      let hasToken = false
      walkReactNodes(node.props?.children, (child) => {
        if (child.props?.className?.includes('stream-token')) hasToken = true
      })
      return hasToken
    }),
    false
  )

  const delayState = createStreamingDelayState()
  const firstBatch = renderStreamingMarkdown('珠穆朗玛', delayState)
  const firstTokens = []
  walkReactNodes(firstBatch, (node) => firstTokens.push(node))
  const firstSpans = firstTokens.filter((node) => node.props?.className?.includes('stream-token'))
  assert.deepEqual(firstSpans.map((node) => node.props?.style?.animationDelay ?? '0ms'), ['0ms', '9ms', '18ms', '27ms'])

  settleStreamingDelayState(delayState, '珠穆朗玛')
  const punctuated = renderStreamingMarkdown('珠穆朗玛峰（8848.86m）。', delayState)
  const punctuatedNodes = []
  walkReactNodes(punctuated, (node) => punctuatedNodes.push(node))
  const resumedSpans = punctuatedNodes.filter((node) => node.props?.className?.includes('stream-token'))
  const punctuatedFresh = punctuatedNodes.filter((node) => node.props?.className?.includes('stream-token-fresh'))
  assert.deepEqual(resumedSpans.map((node) => node.props.children), ['峰', '（', '8848.86m', '）', '。'])
  assert.deepEqual(punctuatedFresh.map((node) => node.props.children), ['峰', '8848.86m'])
  const paragraphChildren = childTextList(punctuated[0].props.children)
  assert.equal(paragraphChildren[0], '珠穆朗玛')
  assert.equal(paragraphChildren[paragraphChildren.length - 1]?.props?.className, 'stream-caret')

  const burstState = createStreamingDelayState()
  const burst = renderStreamingMarkdown('京师、齐河、长清、泰安。', burstState)
  const burstNodes = []
  walkReactNodes(burst, (node) => burstNodes.push(node))
  const burstSpans = burstNodes.filter((node) => node.props?.className?.includes('stream-token'))
  assert.equal(burstSpans.length, 6)
  assert.equal(childTextList(burst[0].props.children)[0], '京师、齐河、')
})
