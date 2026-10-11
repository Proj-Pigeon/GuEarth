import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { transpileModule } from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
import { ref, nextTick } from 'vue'

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
const { interpolateCamera, useScenePlayer } = await import('../src/renderer/src/composables/useScenePlayer.ts')
const { useScenesStore } = await import('../src/renderer/src/stores/scenes.ts')
const { renderMarkdown } = await import('../src/renderer/src/utils/markdown.ts')

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
  setActivePinia(createPinia())
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  let requests = 0
  const viewer = ref({
    isDestroyed: () => false,
    scene: { mode: 3, globe: { tilesLoaded: true, maximumScreenSpaceError: 2, pick: () => undefined }, requestRender: () => { requests += 1 }, canvas: { clientWidth: 800, clientHeight: 600 } },
    camera: { setView() {}, flyTo(options) { options.complete() }, getPickRay: () => ({}) }
  })
  const player = useScenePlayer(viewer, () => {})
  const scenes = useScenesStore()
  const scene = { name: 'Sky', narration: '', flyDurationMs: 100, dwellMs: 100, snapshot: { camera: { longitude: 179, latitude: 30, height: 10000, heading: 350, pitch: 10 }, basemapId: '', overlays: [], month: 6, simTime: null } }
  const tick = async (ms) => { t.mock.timers.tick(ms); await nextTick(); await nextTurn() }
  return { viewer, player, scenes, scene, tick, requests: () => requests }
}

test('sky-facing scenes advance once tiles are ready instead of waiting ten seconds', async (t) => {
  const { player, scene, tick } = playerFixture(t)
  const playing = player.play({ scenes: [scene], mode: 'auto' })
  for (let index = 0; index < 35; index += 1) await tick(120)
  assert.equal(player.playerState.active, false)
  await playing
})

test('single-scene prewarm applies standard and live ultra quality, then restores the globe', async (t) => {
  const { viewer, player, scenes, scene, tick, requests } = playerFixture(t)
  scenes.setRecording({ prewarmQuality: 'standard' })
  viewer.value.scene.globe.tilesLoaded = false
  const playing = player.play({ scenes: [scene], mode: 'auto', recording: { tempShapeIds: [] } })
  await tick(120)
  assert.equal(viewer.value.scene.globe.maximumScreenSpaceError, 4)
  const renders = requests()
  scenes.setRecording({ prewarmQuality: 'ultra' })
  assert.equal(viewer.value.scene.globe.maximumScreenSpaceError, 0.5)
  assert.ok(requests() > renders)
  for (let index = 0; index < 45; index += 1) await tick(120)
  assert.equal(player.playerState.prewarming, true)
  player.stop()
  for (let index = 0; index < 8; index += 1) await tick(120)
  await playing
  assert.equal(viewer.value.scene.globe.maximumScreenSpaceError, 2)
  scenes.setRecording({ prewarmQuality: 'high' })
  assert.equal(viewer.value.scene.globe.maximumScreenSpaceError, 2)
})

test('AI markdown treats HTML as text and omits executable link and image attributes', () => {
  const nodes = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![x](data:image/svg+xml,boom) [safe](https://example.com)')
  const seen = []
  function walk(value) {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') { seen.push(value); walk(value.children) }
  }
  walk(nodes)
  assert.equal(seen.some((node) => node.type === 'script'), false)
  assert.equal(seen.some((node) => node.props?.innerHTML || node.props?.onerror), false)
  assert.equal(seen.filter((node) => node.type === 'img').length, 0)
  const link = seen.find((node) => node.type === 'a')
  assert.equal(link.props.href, 'https://example.com')
  assert.equal(link.props.rel, 'noopener noreferrer')
})
