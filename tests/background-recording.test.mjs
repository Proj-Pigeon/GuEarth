import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')
const recorderSource = await readFile(new URL('../src/renderer/src/composables/useVideoRecorder.ts', import.meta.url), 'utf8')

test('recording window disables Chromium background timer throttling', () => {
  assert.match(mainSource, /backgroundThrottling:\s*false/)
})

test('automatic scene advancement keeps an explicit deadline timer', () => {
  assert.match(scenePlayerSource, /if \(timeoutMs !== null\) advanceTimer = setTimeout\(\(\) => advanceResolver\?\.\(\), timeoutMs\)/)
})

test('recording enables continuous Cesium rendering and restores the previous mode', () => {
  assert.match(scenePlayerSource, /scene\.requestRenderMode = false/)
  assert.match(scenePlayerSource, /scene\.requestRenderMode = originalRequestRenderMode/)
  assert.match(scenePlayerSource, /scene\.maximumRenderTimeChange = originalMaximumRenderTimeChange/)
})

test('AI micro-lesson recording uses the offscreen encoder', () => {
  assert.match(scenePlayerSource, /const script: OffscreenRecordingScript = \{ title, scenes, width: 1920, height: 1080, fps: 30 \}/)
  assert.match(scenePlayerSource, /window\.guEarth\.recordings\.offscreenEncode\(script\)/)
  assert.match(scenePlayerSource, /正在启动离屏录制渲染/)
})

test('manual capture keeps scheduling frames while the recorder is active', () => {
  assert.match(recorderSource, /pacingTimer = window\.setTimeout\(frameTick, Math\.max\(0, nextFrameAt - performance\.now\(\)\)\)/)
})
