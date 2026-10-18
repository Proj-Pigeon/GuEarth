import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { hidesThematicLayers, visibleThematicLayers } from '../src/renderer/src/lib/nightBasemap.ts'

const appSource = await readFile(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')

test('the night basemap hides every thematic layer', () => {
  assert.equal(hidesThematicLayers('viirs-night'), true)
  assert.equal(hidesThematicLayers('osm'), false)
  assert.deepEqual(visibleThematicLayers('viirs-night', ['enso', 'hu-line']), [])
  assert.deepEqual(visibleThematicLayers('osm', ['enso']), ['enso'])
})

test('capture, playback and the offscreen renderer all apply the night rule', () => {
  assert.match(appSource, /const nightBasemapActive = computed\(\(\) => hidesThematicLayers\(store\.selectedLayerId\)\)/)
  assert.match(appSource, /overlays: visibleThematicLayers\(store\.selectedLayerId, knownOverlays\)/)
  assert.match(appSource, /if \(args\.enabled && nightBasemapActive\.value\) return \{ error:/)
  assert.match(scenePlayerSource, /overlays: visibleThematicLayers\(globeStore\.selectedLayerId,/)
  assert.match(scenePlayerSource, /const overlays = visibleThematicLayers\(snapshot\.basemapId, snapshot\.overlays\)/)
  assert.match(offscreenSource, /const overlays = visibleThematicLayers\(basemapId, snapshot\.overlays\)/)
})
