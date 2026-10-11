import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const offscreenHtml = await readFile(new URL('../src/renderer/offscreen.html', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')

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
  assert.match(mainSource, /'-f', 'image2pipe'/)
  assert.match(mainSource, /image\.toPNG\(\)/)
  assert.match(mainSource, /ffmpegStdin\.on\('error'/)
  assert.match(mainSource, /image\.toPNG\(\)/)
})

test('offscreen recording exposes a local encode self-test', () => {
  assert.match(mainSource, /function createOffscreenSelfTestScript\(\): OffscreenRecordingScript/)
  assert.match(mainSource, /ipcMain\.handle\('recordings:offscreen-self-test'/)
  assert.match(preloadSource, /offscreenSelfTest: \(\): Promise<RecordingSaveResult>/)
})

test('offscreen recording controls stay behind typed preload IPC', () => {
  assert.match(preloadSource, /offscreenProbe: \(script\?: OffscreenRecordingScript\): Promise<OffscreenRecordingProbeResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-probe', script\)/)
  assert.match(preloadSource, /offscreenEncode: \(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-encode', script\)/)
})
