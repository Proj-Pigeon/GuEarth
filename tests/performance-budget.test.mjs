import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { test } from 'vite-plus/test'

import {
  clampPrewarmQuality,
  normalizePerformanceMode,
  performanceBudget
} from '../src/common/performanceBudget.ts'

test('unknown performance modes stay on the balanced budget', () => {
  assert.equal(normalizePerformanceMode(undefined), 'balanced')
  assert.equal(normalizePerformanceMode('ultra'), 'balanced')
  assert.equal(performanceBudget('nope').resolutionScale, 1)
  assert.equal(performanceBudget('balanced').tileCacheSize, 256)
  assert.equal(performanceBudget('balanced').depthTestAgainstTerrain, true)
})

test('fluent mode spends fewer pixels, tiles and wind particles than balanced', () => {
  const fluent = performanceBudget('fluent')
  const balanced = performanceBudget('balanced')
  assert.ok(fluent.resolutionScale < balanced.resolutionScale)
  assert.ok(fluent.screenSpaceError > balanced.screenSpaceError)
  assert.ok(fluent.tileCacheSize < balanced.tileCacheSize)
  assert.ok(fluent.flightTileCacheSize < balanced.flightTileCacheSize)
  assert.equal(fluent.depthTestAgainstTerrain, false)
  assert.equal(fluent.antialias, false)
  assert.equal(fluent.msaaSamples, 1)
  assert.ok(fluent.maxWindParticles < balanced.maxWindParticles)
  assert.ok(fluent.terrainSampleCap < balanced.terrainSampleCap)
  assert.deepEqual(
    [fluent.recordingWidth, fluent.recordingHeight, fluent.recordingFps],
    [1280, 720, 24]
  )
})

test('quality mode asks for finer terrain without shrinking the recording', () => {
  const quality = performanceBudget('quality')
  const balanced = performanceBudget('balanced')
  assert.ok(quality.screenSpaceError < balanced.screenSpaceError)
  assert.ok(quality.tileCacheSize > balanced.tileCacheSize)
  assert.equal(quality.msaaSamples, 4)
  assert.equal(quality.recordingWidth, balanced.recordingWidth)
  assert.equal(quality.recordingFps, balanced.recordingFps)
})

test('fluent recording cannot request a prewarm finer than standard', () => {
  assert.equal(clampPrewarmQuality('fluent', 'ultra'), 'standard')
  assert.equal(clampPrewarmQuality('fluent', 'high'), 'standard')
  assert.equal(clampPrewarmQuality('fluent', 'standard'), 'standard')
  assert.equal(clampPrewarmQuality('balanced', 'ultra'), 'ultra')
  assert.equal(clampPrewarmQuality('quality', 'high'), 'high')
  assert.equal(clampPrewarmQuality('balanced', 'nope'), 'high')
})

test('settings and the globe viewer read the same performance mode', async () => {
  const [mainSource, preloadSource, globeSource, viewerSource] = await Promise.all([
    readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/stores/globe.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/composables/useCesiumViewer.ts', import.meta.url), 'utf8')
  ])
  assert.match(mainSource, /performanceMode: 'balanced'/)
  assert.match(mainSource, /normalizePerformanceMode\(parsed\.performanceMode\)/)
  assert.match(preloadSource, /performanceMode: PerformanceMode/)
  assert.match(globeSource, /normalizePerformanceMode\(settings\.performanceMode\)/)
  assert.match(viewerSource, /performanceBudget\(useGlobeStore\.getState\(\)\.performanceMode\)/)
  assert.match(viewerSource, /depthTestAgainstTerrain = budget\.depthTestAgainstTerrain/)
})
