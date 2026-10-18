import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { cacheKeyOf, coastalZones, gridPointsOf, heightCache, seaLevelGridPoints, seedSampleHeights } from '../src/renderer/src/thematic/seaLevelRise.ts'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const samplingSource = await readFile(new URL('../src/renderer/src/composables/seaLevelSampling.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')

test('seeded heights fill the canonical grid points and skip gaps', () => {
  const points = seaLevelGridPoints()
  assert.equal(points.length, coastalZones.reduce((total, zone) => total + gridPointsOf(zone).length, 0))
  const heights = points.map(() => null)
  heights[0] = 1.5
  heights[3] = -2.25
  assert.equal(seedSampleHeights(heights), 2)
  assert.equal(heightCache.get(cacheKeyOf(points[0][0], points[0][1])), 1.5)
  assert.equal(heightCache.get(cacheKeyOf(points[3][0], points[3][1])), -2.25)
  assert.equal(heightCache.size, 2)
})

test('seeded heights ignore non finite entries and short arrays', () => {
  assert.equal(seedSampleHeights([Number.NaN, Number.POSITIVE_INFINITY]), 0)
  assert.equal(seedSampleHeights([2]), 1)
})

test('the main window hands its sampled heights to the offscreen recorder', () => {
  assert.match(scenePlayerSource, /seaLevelHeights: recordsSeaLevel \? seaLevelGridPoints\(\)\.map/)
  assert.match(mainSource, /seaLevelHeights: Array\.isArray\(value\.seaLevelHeights\)/)
})

test('the offscreen recorder seeds heights and resolves the land mask before recording', () => {
  assert.match(offscreenSource, /const seeded = seedSampleHeights\(script\.seaLevelHeights \?\? \[\]\)/)
  assert.match(offscreenSource, /await prepareSeaLevel\(script\)/)
  assert.match(offscreenSource, /reportNotice\(`淹没模拟地形采样失败/)
  assert.match(samplingSource, /await ensureLandMask\(\)\r?\n\s+if \(allPointsCached\(\)\)/)
})

test('one shared promise owns the land mask and the cache check so concurrent callers reuse it', () => {
  const assignIndex = samplingSource.indexOf('samplePromise ??=')
  const maskIndex = samplingSource.indexOf('await ensureLandMask()')
  const cacheIndex = samplingSource.indexOf('if (allPointsCached())')
  assert.ok(assignIndex >= 0 && maskIndex > assignIndex && cacheIndex > maskIndex)
  assert.ok(samplingSource.includes('})().finally(() => {'))
  assert.ok(samplingSource.includes('samplePromise = undefined'))
  assert.ok(!samplingSource.includes('if (samplePromise) return samplePromise'))
  assert.ok(!samplingSource.includes('await samplePromise'))
})
