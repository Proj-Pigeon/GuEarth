import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'vitest'

const layersSource = await readFile(new URL('../src/renderer/src/composables/useThematicLayers.ts', import.meta.url), 'utf8')

test('the HSR network repaints when the timeline year changes', () => {
  assert.match(layersSource, /const opened = new Cesium\.CallbackProperty\(\(\) => line\.openedYear <= Math\.floor\(useTransportStore\.getState\(\)\.year\), false\)/)
  assert.match(layersSource, /useTransportStore\.subscribe\(\(state\) => state\.year, requestRender\)/)
  assert.doesNotMatch(layersSource, /useTransportStore\.subscribe\(\(state\) => state\.isPlaying/)
})

test('animated thematic layers repaint through the same requestRender helper', () => {
  assert.match(layersSource, /function requestRender\(\): void \{/)
  assert.match(layersSource, /useSolarStore\.subscribe\(\r?\n\s*\(state\) => state\.utcMs,\r?\n\s*\(\) => \{\r?\n\s*refreshSubsolarPoint\(\)\r?\n\s*requestRender\(\)\r?\n\s*\}\r?\n\s*\)/)
})
