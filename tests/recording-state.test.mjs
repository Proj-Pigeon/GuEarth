import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { ENSO_PHASES, HSR_END_YEAR, HSR_START_YEAR, SEA_LEVEL_SCENARIOS } from '../src/common/thematicState.ts'
import { ensoPhaseOptions } from '../src/renderer/src/thematic/ensoPhases.ts'
import { HSR_END_YEAR as rendererEndYear, HSR_START_YEAR as rendererStartYear } from '../src/renderer/src/thematic/hsrLines.ts'
import { SEA_LEVEL_SCENARIOS as rendererScenarios } from '../src/renderer/src/thematic/seaLevelRise.ts'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')

test('the shared thematic state bounds match the renderer copies', () => {
  assert.deepEqual([...SEA_LEVEL_SCENARIOS], [...rendererScenarios])
  assert.equal(HSR_START_YEAR, rendererStartYear)
  assert.equal(HSR_END_YEAR, rendererEndYear)
  assert.deepEqual([...ENSO_PHASES], ensoPhaseOptions.map((option) => option.value))
})

test('scene snapshots carry the mutable thematic layer state', () => {
  assert.match(preloadSource, /ensoPhase: EnsoPhase/)
  assert.match(preloadSource, /seaLevelRise: number/)
  assert.match(preloadSource, /transportYear: number/)
  assert.match(mainSource, /normalizeEnsoPhase\(value\.ensoPhase\)/)
  assert.match(mainSource, /normalizeSeaLevelRise\(value\.seaLevelRise\)/)
  assert.match(mainSource, /normalizeNumber\(value\.transportYear, HSR_START_YEAR, HSR_END_YEAR/)
})

test('capture, playback and the offscreen mirror all apply the thematic state', () => {
  assert.match(scenePlayerSource, /ensoPhase: climateStore\.ensoPhase/)
  assert.match(scenePlayerSource, /seaLevelRise: climateStore\.seaLevelRise/)
  assert.match(scenePlayerSource, /transportYear: transportStore\.year/)
  assert.match(scenePlayerSource, /climateStore\.setEnsoPhase\(snapshot\.ensoPhase\)/)
  assert.match(scenePlayerSource, /climateStore\.setSeaLevelRise\(snapshot\.seaLevelRise\)/)
  assert.match(scenePlayerSource, /transportStore\.setYear\(snapshot\.transportYear\)/)
  assert.match(offscreenSource, /climateStore\.setEnsoPhase\(snapshot\.ensoPhase\)/)
  assert.match(offscreenSource, /climateStore\.setSeaLevelRise\(snapshot\.seaLevelRise\)/)
  assert.match(offscreenSource, /transportStore\.setYear\(snapshot\.transportYear\)/)
})

test('AI recording scripts can set the thematic state per step', () => {
  assert.match(appSource, /ensoPhase: \{ type: 'string'/)
  assert.match(appSource, /seaLevelRise: \{ type: 'number'/)
  assert.match(appSource, /transportYear: \{ type: 'number'/)
  assert.match(appSource, /ensoPhase,\r?\n\s+seaLevelRise,\r?\n\s+transportYear,/)
  assert.match(scenePlayerSource, /seaLevelRise: step\.seaLevelRise/)
})
