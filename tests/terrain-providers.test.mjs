import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { TERRAIN_PROVIDER_ID_SET, TERRAIN_PROVIDER_IDS } from '../src/common/terrainProviders.ts'

const registrySource = await readFile(new URL('../src/renderer/src/terrain/terrainRegistry.ts', import.meta.url), 'utf8')
const globeSource = await readFile(new URL('../src/renderer/src/stores/globe.ts', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')

test('every shared terrain provider id has a registry factory and a catalog entry', () => {
  for (const id of TERRAIN_PROVIDER_IDS) {
    assert.ok(TERRAIN_PROVIDER_ID_SET.has(id))
    assert.match(registrySource, new RegExp(`['"]?${id}['"]?:`), `registry factory missing for ${id}`)
    assert.match(globeSource, new RegExp(`id: '${id}'`), `terrain catalog entry missing for ${id}`)
  }
  assert.match(registrySource, /Record<TerrainProviderId, \(\) => Promise<Cesium\.TerrainProvider>>/)
  assert.match(globeSource, /id: TerrainProviderId/)
})

test('registry lookups fall back through the shared factory instead of ad hoc indexing', () => {
  const viewerSource = readFile(new URL('../src/renderer/src/composables/useCesiumViewer.ts', import.meta.url), 'utf8')
  const offscreenSource = readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
  return Promise.all([viewerSource, offscreenSource]).then(([viewer, offscreen]) => {
    assert.doesNotMatch(viewer, /terrainRegistry\[id\] \?\? terrainRegistry\.ellipsoid/)
    assert.doesNotMatch(offscreen, /terrainRegistry\[terrain\.providerId\] \?\?/)
    assert.match(viewer, /terrainProviderFactory\(id\)/)
    assert.match(offscreen, /terrainProviderFactory\(terrain\.providerId\)/)
  })
})

test('the main process offscreen whitelist derives from the shared terrain list', () => {
  assert.doesNotMatch(mainSource, /OFFSCREEN_TERRAIN_PROVIDER_IDS = new Set\(\['/)
  assert.match(mainSource, /TERRAIN_PROVIDER_ID_SET\.has\(value\.providerId\)/)
})
