import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const layersSource = await readFile(new URL('../src/renderer/src/composables/useThematicLayers.ts', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')

test('the offscreen recorder suppresses thematic layer auto focus', () => {
  assert.match(offscreenSource, /useThematicLayers\(offscreenViewer, \{ autoFocus: false \}\)/)
  assert.match(layersSource, /const autoFocus = options\?\.autoFocus !== false/)
  assert.match(layersSource, /const view = autoFocus \? enableViews\[layer\.id\] : undefined/)
  assert.match(appSource, /useThematicLayers\(viewer\)/)
})

test('the offscreen recorder cancels any in-flight camera flight before framing a scene', () => {
  assert.match(offscreenSource, /viewer\.camera\.cancelFlight\(\)\r?\n\s*viewer\.camera\.setView/)
  assert.match(offscreenSource, /await flyCamera\(scene\.snapshot\.camera, scene\.flyDurationMs\)/)
})
