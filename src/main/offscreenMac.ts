import { rmSync } from 'fs'
import { mkdtemp, rename as renameFile, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { BrowserWindow, shell } from 'electron'
import { logger } from '../common/logger'
import type { OffscreenRecordingScript, RecordingSaveResult } from '../preload'
import { offscreenFrameRate, offscreenScriptDurationMs } from './offscreenTiming'

export interface OffscreenMacSessionHost {
  assertIdle(): void
  setCancelHook(hook: () => void): void
  clearCancelHook(hook: () => void): void
  setTeardownHook(hook: () => void): void
  clearTeardownHook(hook: () => void): void
  adoptWindow(window: BrowserWindow): void
  dropWindow(): void
  notePaintFrame(): void
  resetPaintStats(): void
  resetPrewarnWarned(): void
  usableDirectory(): Promise<string | null>
  sweepStaleDirectories(directory: string): Promise<void>
}

interface OffscreenMacIpcSession {
  noteFrameAck: (count: number) => void
  deliverVideo: (bytes: ArrayBuffer) => void
}

const OFFSCREEN_TEMP_PREFIX = '.guearth-offscreen-'
const OFFSCREEN_OWNER_FILE = '.owner'
const OFFSCREEN_PLAY_TIMEOUT_MARGIN_MS = 90_000
const OFFSCREEN_PREPARE_TIMEOUT_MS = 180_000
const OFFSCREEN_MIN_FLUENT_FPS = 24
const OFFSCREEN_MAX_PENDING_FRAMES = 24
const OFFSCREEN_ENCODE_TIMEOUT_MS = 120_000
const OFFSCREEN_ACK_DRAIN_TIMEOUT_MS = 10_000
const OFFSCREEN_MAC_BITRATE = 2_000_000

let activeMacSession: OffscreenMacIpcSession | null = null

export function noteMacOffscreenFrameAck(count: unknown): void {
  const session = activeMacSession
  if (!session || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return
  session.noteFrameAck(Math.min(1024, Math.round(count)))
}

export function deliverMacOffscreenVideo(value: unknown): void {
  const session = activeMacSession
  if (!session) return
  let bytes: ArrayBuffer | null = null
  if (value instanceof ArrayBuffer) bytes = value
  else if (ArrayBuffer.isView(value)) bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
  if (!bytes || bytes.byteLength === 0) return
  session.deliverVideo(bytes)
}

async function readFileSize(path: string): Promise<number> {
  return (await stat(path)).size
}

function withOffscreenTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_resolveTimeout, rejectTimeout) => {
      const timer = setTimeout(() => rejectTimeout(new Error(message)), timeoutMs)
      timer.unref?.()
    })
  ])
}

export function encodeMacOffscreenRecording(script: OffscreenRecordingScript, host: OffscreenMacSessionHost): Promise<RecordingSaveResult> {
  host.assertIdle()
  return new Promise((resolve, reject) => {
    let settled = false
    let tempDir: string | null = null
    let recorderWindow: BrowserWindow | null = null
    let pendingFrames = 0
    let frameDrainResolve: (() => void) | null = null
    let resolveVideoBytes: ((bytes: ArrayBuffer) => void) | null = null
    const release = (): void => {
      host.clearCancelHook(cancel)
      host.clearTeardownHook(teardown)
      activeMacSession = null
      host.dropWindow()
      if (tempDir) void rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
    const teardown = (): void => {
      const pending = !settled
      settled = true
      host.clearCancelHook(cancel)
      host.clearTeardownHook(teardown)
      activeMacSession = null
      host.dropWindow()
      const directory = tempDir
      tempDir = null
      if (directory) rmSync(directory, { recursive: true, force: true })
      logger.info('recording', pending ? '应用退出，已中止离屏录制并清理临时文件' : '应用退出，已清理离屏录制临时文件')
      if (pending) resolve({ path: '', bytes: 0, cancelled: true })
    }
    host.setTeardownHook(teardown)
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      release()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const cancel = (): void => {
      if (settled) return
      settled = true
      release()
      logger.info('recording', '离屏录制已取消，未生成视频文件')
      resolve({ path: '', bytes: 0, cancelled: true })
    }
    host.resetPrewarnWarned()
    host.setCancelHook(cancel)
    activeMacSession = {
      noteFrameAck: (count) => {
        pendingFrames = Math.max(0, pendingFrames - count)
        if (pendingFrames === 0) frameDrainResolve?.()
      },
      deliverVideo: (bytes) => resolveVideoBytes?.(bytes)
    }
    void (async () => {
      const directory = await host.usableDirectory()
      if (settled) return
      if (!directory) throw new Error('请先选择可用的视频保存文件夹')
      await host.sweepStaleDirectories(directory)
      if (settled) return
      const createdTempDir = await mkdtemp(join(directory, OFFSCREEN_TEMP_PREFIX))
      if (settled) {
        void rm(createdTempDir, { recursive: true, force: true }).catch(() => undefined)
        return
      }
      tempDir = createdTempDir
      await writeFile(join(tempDir, OFFSCREEN_OWNER_FILE), String(process.pid), 'utf8')
      if (settled) return
      const temporaryPath = join(tempDir, 'recording.mp4.part')
      const now = new Date()
      const pad = (value: number): string => String(value).padStart(2, '0')
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const outputPath = join(directory, `GuEarth-${stamp}-${randomUUID().slice(0, 8)}.mp4`)
      const targetFps = script.fps
      recorderWindow = new BrowserWindow({
        show: false,
        width: script.width,
        height: script.height,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          offscreen: true,
          backgroundThrottling: false,
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      const window = recorderWindow
      host.adoptWindow(window)
      window.webContents.on('render-process-gone', (_event, details) => {
        fail(new Error(`离屏录制渲染进程异常退出（${details.reason}）`))
      })
      window.on('unresponsive', () => {
        fail(new Error('离屏录制渲染进程无响应，已中止录制'))
      })
      host.resetPaintStats()
      let capturing = false
      let captureLogged = false
      let recordingStartedAt = 0
      let frameIndex = 0
      window.webContents.on('paint', (_event, _dirty, image) => {
        host.notePaintFrame()
        if (settled || !capturing || image.isEmpty() || pendingFrames >= OFFSCREEN_MAX_PENDING_FRAMES) return
        const size = image.getSize()
        if (!captureLogged) {
          captureLogged = true
          logger.info('recording', `离屏采集 ${size.width}x${size.height}，输出 ${script.width}x${script.height}`, `窗口 ${script.width}x${script.height}（未按工作区缩放）`)
          if (Math.abs(size.width / size.height - script.width / script.height) > 0.02) logger.warn('recording', '离屏采集比例与输出比例不一致，将以补边方式适配')
        }
        const frame = image.toJPEG(95)
        if (frame.length === 0) return
        const captureTimeMs = Date.now() - recordingStartedAt
        pendingFrames += 1
        window.webContents.send('recordings:offscreen-frame', frameIndex, captureTimeMs, frame)
        frameIndex += 1
      })
      const ready = new Promise<void>((resolveReady, rejectReady) => {
        window.webContents.once('did-finish-load', () => resolveReady())
        window.webContents.once('did-fail-load', (_event, code, description) => rejectReady(new Error(`${code}: ${description}`)))
      })
      const loading = process.env['ELECTRON_RENDERER_URL']
        ? window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/offscreen.html`)
        : window.loadFile(join(__dirname, '../renderer/offscreen.html'))
      await Promise.all([loading, ready])
      if (settled) return
      window.webContents.setFrameRate(targetFps)
      const serialized = JSON.stringify(script).replace(/</g, '\\u003c')
      const encoderConfig = JSON.stringify({ width: script.width, height: script.height, framerate: targetFps, bitrate: OFFSCREEN_MAC_BITRATE })
      host.resetPaintStats()
      window.webContents.startPainting()
      await withOffscreenTimeout(
        window.webContents.executeJavaScript(`window.guEarthOffscreenMacEncoder.begin(${encoderConfig})`),
        OFFSCREEN_PREPARE_TIMEOUT_MS,
        '离屏视频编码器初始化超时，已中止录制'
      )
      if (settled) return
      const prepareStartedAt = Date.now()
      await withOffscreenTimeout(
        window.webContents.executeJavaScript(`window.guEarthOffscreenRecorder.prepare(${serialized})`),
        OFFSCREEN_PREPARE_TIMEOUT_MS,
        '离屏渲染初始化超时，已中止录制'
      )
      logger.info('recording', `离屏渲染准备完成，耗时 ${((Date.now() - prepareStartedAt) / 1000).toFixed(1)} 秒`)
      if (settled) return
      const captureBudgetMs = offscreenScriptDurationMs(script.scenes) + OFFSCREEN_PLAY_TIMEOUT_MARGIN_MS
      host.resetPaintStats()
      recordingStartedAt = Date.now()
      capturing = true
      await withOffscreenTimeout(
        window.webContents.executeJavaScript(`window.guEarthOffscreenRecorder.play(${serialized})`),
        captureBudgetMs,
        '离屏渲染超时，已中止录制'
      )
      const recordingElapsedMs = Math.max(1, Date.now() - recordingStartedAt)
      capturing = false
      if (settled) return
      window.webContents.stopPainting()
      await new Promise<void>((resolveDrain) => {
        if (pendingFrames === 0) {
          resolveDrain()
          return
        }
        frameDrainResolve = resolveDrain
        const timer = setTimeout(() => {
          if (frameDrainResolve === resolveDrain) {
            frameDrainResolve = null
            logger.warn('recording', '部分离屏帧尚未送达编码页，已按已到达帧继续编码')
            resolveDrain()
          }
        }, OFFSCREEN_ACK_DRAIN_TIMEOUT_MS)
        timer.unref?.()
      })
      if (settled) return
      if (frameIndex === 0) {
        fail(new Error('离屏渲染未产生有效视频帧'))
        return
      }
      const measuredFps = offscreenFrameRate(frameIndex, recordingElapsedMs)
      logger.info('recording', `离屏录制 ${frameIndex} 帧 / ${(recordingElapsedMs / 1000).toFixed(1)} 秒，实测约 ${measuredFps.toFixed(1)} FPS`)
      if (measuredFps < OFFSCREEN_MIN_FLUENT_FPS) logger.warn('recording', `离屏采集帧率偏低（${measuredFps.toFixed(1)} FPS），画面可能不够流畅`)
      const videoPromise = new Promise<ArrayBuffer>((resolveVideo) => {
        resolveVideoBytes = resolveVideo
      })
      const encodeStartedAt = Date.now()
      const [, videoBytes] = await Promise.all([
        withOffscreenTimeout(
          window.webContents.executeJavaScript('window.guEarthOffscreenMacEncoder.finish()'),
          OFFSCREEN_ENCODE_TIMEOUT_MS,
          '离屏视频编码超时，已中止录制'
        ),
        withOffscreenTimeout(videoPromise, OFFSCREEN_ENCODE_TIMEOUT_MS, '离屏视频编码超时，已中止录制')
      ])
      if (settled) return
      logger.info('recording', `离屏编码完成，耗时 ${((Date.now() - encodeStartedAt) / 1000).toFixed(1)} 秒，产物 ${(videoBytes.byteLength / 1024 / 1024).toFixed(1)} MB`)
      if (videoBytes.byteLength === 0) {
        fail(new Error('未能生成离屏视频数据'))
        return
      }
      await writeFile(temporaryPath, Buffer.from(videoBytes))
      if (settled) return
      const bytes = await readFileSize(temporaryPath)
      if (settled) return
      await renameFile(temporaryPath, outputPath)
      if (settled) return
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      if (settled) return
      settled = true
      host.clearCancelHook(cancel)
      host.clearTeardownHook(teardown)
      activeMacSession = null
      tempDir = null
      host.dropWindow()
      logger.info('recording', `离屏录制完成：${outputPath}`, `${(bytes / 1024 / 1024).toFixed(1)} MB`)
      shell.showItemInFolder(outputPath)
      resolve({ path: outputPath, bytes, fps: measuredFps })
    })().catch((error) => fail(error))
  })
}
