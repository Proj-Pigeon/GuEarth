import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const layersSource = await readFile(new URL('../src/renderer/src/composables/useThematicLayers.ts', import.meta.url), 'utf8')

test('the HSR network repaints when the timeline year changes', () => {
  assert.match(layersSource, /const opened = new Cesium\.CallbackProperty\(\(\) => line\.openedYear <= Math\.floor\(transportStore\.year\), false\)/)
  assert.match(layersSource, /watch\(\(\) => transportStore\.year, requestRender\)/)
  assert.doesNotMatch(layersSource, /watch\(\(\) => transportStore\.isPlaying/)
})

test('animated thematic layers repaint through the same requestRender helper', () => {
  assert.match(layersSource, /function requestRender\(\): void \{/)
  assert.match(layersSource, /watch\(\(\) => solarStore\.utcMs, \(\) => \{ refreshSubsolarPoint\(\); requestRender\(\) \}\)/)
})
