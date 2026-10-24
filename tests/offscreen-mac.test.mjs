import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const macSource = await readFile(new URL('../src/main/offscreenMac.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const encoderSource = await readFile(new URL('../src/renderer/src/offscreenEncoder.ts', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const agentSource = await readFile(new URL('../src/main/ai/agent.ts', import.meta.url), 'utf8')

test('darwin encodes through the WebCodecs path while Windows keeps the ffmpeg path', () => {
  const encodeBody = mainSource.slice(mainSource.indexOf("ipcMain.handle('recordings:offscreen-encode'"), mainSource.indexOf("ipcMain.on('recordings:offscreen-progress'"))
  assert.match(encodeBody, /if \(process\.platform === 'darwin'\) \{/)
  assert.match(encodeBody, /encodeMacOffscreenRecording\(normalizeOffscreenRecordingScript\(script\), macRecordingHost\)/)
  assert.match(encodeBody, /assertOffscreenRecordingSupported\(process\.platform\)/)
  assert.match(encodeBody, /assertOffscreenRecordingIdle\(\)/)
  assert.match(encodeBody, /return await encodeOffscreenRecording\(normalizeOffscreenRecordingScript\(script\)\)/)
})

test('the macOS encoder pins the measured High-profile codec and never requests prefer-hardware', () => {
  assert.match(encoderSource, /avc1\.64002A/)
  assert.doesNotMatch(encoderSource, /prefer-hardware/)
  assert.match(encoderSource, /avc: \{ format: 'avc' \}/)
  assert.match(encoderSource, /VideoEncoder\.isConfigSupported\(/)
})

test('the macOS muxer mirrors the ffmpeg faststart and wall-clock frame timing', () => {
  assert.match(encoderSource, /fastStart: 'in-memory'/)
  assert.match(encoderSource, /firstTimestampBehavior: 'offset'/)
  assert.match(encoderSource, /captureTimeMs \* 1000/)
  assert.match(encoderSource, /sendOffscreenVideo\(bytes\)/)
})

test('the offscreen frame channel is appended to the shared preload', () => {
  assert.match(preloadSource, /onOffscreenFrame: \(listener: \(index: number, captureTimeMs: number, jpeg: Uint8Array\) => void\): \(\(\) => void\) => \{/)
  assert.match(preloadSource, /ipcRenderer\.on\('recordings:offscreen-frame', wrapped\)/)
  assert.match(preloadSource, /sendOffscreenFrameAck: \(count: number\): void => ipcRenderer\.send\('recordings:offscreen-frame-ack', count\)/)
  assert.match(preloadSource, /sendOffscreenVideo: \(bytes: ArrayBuffer\): void => ipcRenderer\.send\('recordings:offscreen-video', bytes\)/)
})

test('the offscreen page mounts the macOS encoder module', () => {
  assert.match(offscreenSource, /import '\.\/offscreenEncoder'/)
})

test('main forwards frame acks and encoded video only from the offscreen window', () => {
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-frame-ack', \(event, count: unknown\): void => \{/)
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-video', \(event, bytes: unknown\): void => \{/)
  const frameAckBody = mainSource.slice(mainSource.indexOf("ipcMain.on('recordings:offscreen-frame-ack'"), mainSource.indexOf('function assertOffscreenRecordingIdle'))
  assert.match(frameAckBody, /if \(event\.sender !== offscreenRecordingWindow\?\.webContents\) return/)
  assert.match(frameAckBody, /noteMacOffscreenFrameAck\(count\)/)
  assert.match(frameAckBody, /deliverMacOffscreenVideo\(bytes\)/)
})

test('the macOS session reuses the Windows temp-directory, ownership and naming contract', () => {
  assert.match(macSource, /const OFFSCREEN_TEMP_PREFIX = '\.guearth-offscreen-'/)
  assert.match(macSource, /const OFFSCREEN_OWNER_FILE = '\.owner'/)
  assert.match(macSource, /GuEarth-\$\{stamp\}-\$\{randomUUID\(\)\.slice\(0, 8\)\}\.mp4/)
  assert.match(macSource, /writeFile\(recordingPath\(tempDir, OFFSCREEN_OWNER_FILE\), String\(process\.pid\), 'utf8'\)/)
  assert.match(macSource, /'请先选择可用的视频保存文件夹'/)
  assert.match(macSource, /'recording\.mp4\.part'/)
})

test('the macOS session mirrors the Windows capture gating and failure semantics', () => {
  assert.match(macSource, /const OFFSCREEN_MAX_PENDING_FRAMES = 24/)
  assert.match(macSource, /const OFFSCREEN_MIN_FLUENT_FPS = 24/)
  assert.match(macSource, /image\.toJPEG\(95\)/)
  assert.match(macSource, /image\.isEmpty\(\)/)
  assert.match(macSource, /'离屏渲染未产生有效视频帧'/)
  assert.match(macSource, /'离屏渲染超时，已中止录制'/)
  assert.match(macSource, /'离屏录制已取消，未生成视频文件'/)
  assert.match(macSource, /`离屏录制渲染进程异常退出（\$\{details\.reason\}）`/)
  assert.match(macSource, /const OFFSCREEN_ENCODE_TIMEOUT_MS = 120_000/)
})

test('the macOS capture window skips the work-area clamp and waits for the page-side encoder', () => {
  assert.doesNotMatch(macSource, /offscreenCaptureSize/)
  assert.doesNotMatch(macSource, /workArea/)
  assert.match(macSource, /width: script\.width,\r?\n\s*height: script\.height,/)
  assert.match(macSource, /window\.guEarthOffscreenMacEncoder\.begin\(\$\{encoderConfig\}\)/)
  assert.match(macSource, /window\.guEarthOffscreenMacEncoder\.finish\(\)/)
  assert.match(macSource, /webContents\.send\('recordings:offscreen-frame', frameIndex, captureTimeMs, frame\)/)
})

test('the macOS encode deadline scales with the captured frame count', () => {
  assert.match(macSource, /const OFFSCREEN_ENCODE_MS_PER_FRAME = 50/)
  assert.match(macSource, /const encodeBudgetMs = Math\.max\(OFFSCREEN_ENCODE_TIMEOUT_MS, frameIndex \* OFFSCREEN_ENCODE_MS_PER_FRAME\)/)
})

test('the macOS frame-drain wait clears its timer once acks settle the queue', () => {
  assert.match(macSource, /clearTimeout\(timer\)/)
  assert.match(macSource, /if \(!settled\) logger\.warn\('recording', '部分离屏帧尚未送达编码页，已按已到达帧继续编码'\)/)
  assert.match(macSource, /frameDrainResolve = \(\): void => \{/)
  assert.match(macSource, /frameDrainResolve = null/)
})

test('record_video no longer advertises a fixed Movies save location', () => {
  assert.doesNotMatch(agentSource, /「影片/)
  assert.match(agentSource, /录制前会请你选择保存文件夹/)
})

test('the macOS encoder streams frames through a serial queue and acks after encoding', () => {
  const listenerBody = encoderSource.slice(encoderSource.indexOf('onOffscreenFrame(('), encoderSource.indexOf('Object.assign(window'))
  assert.match(listenerBody, /active\.queue\.push\(\{ captureTimeMs, jpeg \}\)/)
  assert.doesNotMatch(listenerBody, /sendOffscreenFrameAck/)
  const pumpBody = encoderSource.slice(encoderSource.indexOf('function pump'), encoderSource.indexOf('async function encodeFrame'))
  assert.match(pumpBody, /sendOffscreenFrameAck\(1\)/)
  const finishBody = encoderSource.slice(encoderSource.indexOf('async function finish'), encoderSource.indexOf('function stats'))
  assert.match(finishBody, /await whenDrained\(active\)/)
  assert.doesNotMatch(encoderSource, /frames: Map/)
})

test('mp4-muxer ships under the MIT license inventory', async () => {
  await access(new URL('../resources/licenses/mit/mp4-muxer.txt', import.meta.url))
  const notices = await readFile(new URL('../THIRD-PARTY-NOTICES.md', import.meta.url), 'utf8')
  assert.match(notices, /mp4-muxer（macOS 录制的 MP4 封装）/)
})
