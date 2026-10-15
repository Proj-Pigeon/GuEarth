import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const offscreenHtml = await readFile(new URL('../src/renderer/offscreen.html', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')

test('offscreen recording has an isolated Cesium entry', () => {
  assert.match(viteSource, /offscreen: resolve\('src\/renderer\/offscreen\.html'\)/)
  assert.match(offscreenHtml, /src="\/src\/offscreen\.ts"/)
  assert.match(offscreenSource, /requestRenderMode: false/)
})

test('offscreen recording requests a fixed paint rate and counts frames', () => {
  assert.match(mainSource, /offscreen: true/)
  assert.match(mainSource, /window\.webContents\.setFrameRate\(targetFps\)/)
  assert.match(mainSource, /window\.webContents\.on\('paint'/)
})

test('offscreen recording renderer can execute scene scripts', () => {
  assert.match(offscreenSource, /async function play\(script: OffscreenRecordingScript\)/)
  assert.match(offscreenSource, /viewer\.camera\.flyTo/)
  assert.match(offscreenSource, /guEarthOffscreenRecorder: \{ play \}/)
  assert.match(mainSource, /executeJavaScript\(`window\.guEarthOffscreenRecorder\.play/)
})

test('offscreen recording can encode paint frames through ffmpeg', () => {
  assert.match(mainSource, /function encodeOffscreenRecording\(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(mainSource, /const framePattern = join\(frameDirectory, 'frame-%08d\.jpg'\)/)
  assert.match(mainSource, /await frameWrite/)
  assert.match(mainSource, /'-vf', 'pad=ceil\(iw\/2\)\*2:ceil\(ih\/2\)\*2'/)
  assert.match(mainSource, /image\.resize\(\{ width: script\.width, height: script\.height \}\)\.toJPEG\(95\)/)
  assert.match(mainSource, /image\.isEmpty\(\)/)
  assert.doesNotMatch(mainSource, /image2pipe/)
})

test('offscreen recording exposes a local encode self-test', () => {
  assert.match(mainSource, /function createOffscreenSelfTestScript\(\): OffscreenRecordingScript/)
  assert.match(mainSource, /ipcMain\.handle\('recordings:offscreen-self-test'/)
  assert.match(preloadSource, /offscreenSelfTest: \(\): Promise<RecordingSaveResult>/)
})


test('offscreen recording preserves authored scene content and cancellation', () => {
  assert.match(offscreenSource, /currentTitle = script\.title/)
  assert.match(offscreenSource, /currentNarration = scene\.narration/)
  assert.match(offscreenSource, /addAnnotations\(script, scene\.id\)/)
  assert.match(offscreenSource, /climateStore\.setOverlay/)
  assert.match(offscreenSource, /solarStore\.setDate/)
  assert.match(preloadSource, /offscreenCancel: \(\): Promise<void>/)
  assert.match(mainSource, /const encodedFps = offscreenFrameRate\(frameIndex, recordingElapsedMs\)/)
  assert.match(offscreenSource, /async function delay\(ms: number\): Promise<void>/)
  assert.match(mainSource, /function ffmpegPath\(\): string/)
})
test('offscreen recording applies the authored terrain instead of a flat ellipsoid', () => {
  assert.match(offscreenSource, /viewer\.terrainProvider = await create\(\)/)
  assert.match(offscreenSource, /viewer\.scene\.verticalExaggeration = Math\.min\(5, Math\.max\(1, terrain\.exaggeration\)\)/)
  assert.match(scenePlayerSource, /terrain: \{ providerId: globeStore\.terrainProviderId, exaggeration: globeStore\.terrainExaggeration, lighting: globeStore\.terrainLighting \}/)
  assert.match(mainSource, /terrain: normalizeOffscreenTerrain\(value\.terrain\)/)
})

test('offscreen recording reports scene progress back to the renderer', () => {
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-progress'/)
  assert.match(mainSource, /target\.send\('recordings:offscreen-progress'/)
  assert.match(preloadSource, /offscreenProgress: \(progress: OffscreenRecordingProgress\): void/)
  assert.match(preloadSource, /onOffscreenProgress: \(listener: \(progress: OffscreenRecordingProgress\) => void\)/)
  assert.match(offscreenSource, /offscreenProgress\?\.\(\{ sceneIndex: index, totalScenes: script\.scenes\.length \}\)/)
})

test('offscreen recording controls stay behind typed preload IPC', () => {
  assert.match(preloadSource, /offscreenProbe: \(script\?: OffscreenRecordingScript\): Promise<OffscreenRecordingProbeResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-probe', script\)/)
  assert.match(preloadSource, /offscreenEncode: \(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-encode', script\)/)
})
