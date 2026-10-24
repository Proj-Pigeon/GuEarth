import { rmSync } from 'fs'
import { mkdtemp, open, rename as renameFile, rm, stat, writeFile, type FileHandle } from 'fs/promises'
import { randomUUID } from 'crypto'
import { format, join } from 'path'
import { BrowserWindow, shell } from 'electron'
import { logger } from '../common/logger'
import type { OffscreenRecordingScript, RecordingSaveResult } from '../preload'
import { offscreenFrameRate, offscreenScriptDurationMs } from './offscreenTiming'

export interface OffscreenMacSessionHost {
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
  appendVideoChunk: (bytes: Uint8Array, position: number) => void
  completeVideo: () => void
}

const OFFSCREEN_TEMP_PREFIX = '.guearth-offscreen-'
const OFFSCREEN_OWNER_FILE = '.owner'
const OFFSCREEN_PLAY_TIMEOUT_MARGIN_MS = 90_000
const OFFSCREEN_PREPARE_TIMEOUT_MS = 180_000
const OFFSCREEN_MIN_FLUENT_FPS = 24
const OFFSCREEN_MAX_PENDING_FRAMES = 24
const OFFSCREEN_ENCODE_TIMEOUT_MS = 120_000
const OFFSCREEN_ENCODE_MS_PER_FRAME = 50
const OFFSCREEN_ACK_DRAIN_TIMEOUT_MS = 10_000
const OFFSCREEN_MAC_BITRATE = 2_000_000

function recordingPath(directory: string, name: string): string {
  return format({ dir: directory, base: name })
}

let activeMacSession: OffscreenMacIpcSession | null = null

export function noteMacOffscreenFrameAck(count: unknown): void {
  const session = activeMacSession
  if (!session || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return
  session.noteFrameAck(Math.min(1024, Math.round(count)))
}

export function deliverMacOffscreenVideo(value: unknown, position: unknown): void {
  const session = activeMacSession
  if (!session || !ArrayBuffer.isView(value)) return
  if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) return
  session.appendVideoChunk(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), position)
}

export function deliverMacOffscreenVideoComplete(): void {
  activeMacSession?.completeVideo()
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
  return new Promise((resolve, reject) => {
    let settled = false
    let tempDir: string | null = null
    let recorderWindow: BrowserWindow | null = null
    let videoFile: FileHandle | null = null
    let videoWrite = Promise.resolve()
    let videoCompleteResolve: (() => void) | null = null
    let videoCompleteReject: ((error: unknown) => void) | null = null
    let pendingFrames = 0
    let frameDrainResolve: (() => void) | null = null
    const release = (): void => {
      host.clearCancelHook(cancel)
      host.clearTeardownHook(teardown)
      activeMacSession = null
      host.dropWindow()
      if (videoFile) void videoFile.close().catch(() => undefined)
      if (tempDir) void rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
    const teardown = (): void => {
      const pending = !settled
      settled = true
      host.clearCancelHook(cancel)
      host.clearTeardownHook(teardown)
      activeMacSession = null
      host.dropWindow()
      if (videoFile) void videoFile.close().catch(() => undefined)
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
      appendVideoChunk: (bytes, position) => {
        if (!videoFile) return
        const copy = new Uint8Array(bytes)
        videoWrite = videoWrite.then(() => videoFile!.write(copy, 0, copy.byteLength, position)).then(() => undefined)
      },
      completeVideo: () => {
        void videoWrite.then(() => videoCompleteResolve?.(), (error) => videoCompleteReject?.(error))
      }
    }
    void (async () => {
      const directory = await host.usableDirectory()
      if (settled) return
      if (!directory) throw new Error('请先选择可用的视频保存文件夹')
      await host.sweepStaleDirectories(directory)
      if (settled) return
      const createdTempDir = await mkdtemp(recordingPath(directory, OFFSCREEN_TEMP_PREFIX))
      if (settled) {
        void rm(createdTempDir, { recursive: true, force: true }).catch(() => undefined)
        return
      }
      tempDir = createdTempDir
      await writeFile(recordingPath(tempDir, OFFSCREEN_OWNER_FILE), String(process.pid), 'utf8')
      if (settled) return
      const temporaryPath = recordingPath(tempDir, 'recording.mp4.part')
      videoFile = await open(temporaryPath, 'w')
      const now = new Date()
      const pad = (value: number): string => String(value).padStart(2, '0')
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const outputPath = recordingPath(directory, `GuEarth-${stamp}-${randomUUID().slice(0, 8)}.mp4`)
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
        const timer = setTimeout(() => {
          frameDrainResolve = null
          if (!settled) logger.warn('recording', '部分离屏帧尚未送达编码页，已按已到达帧继续编码')
          resolveDrain()
        }, OFFSCREEN_ACK_DRAIN_TIMEOUT_MS)
        timer.unref?.()
        frameDrainResolve = (): void => {
          clearTimeout(timer)
          frameDrainResolve = null
          resolveDrain()
        }
      })
      if (settled) return
      if (frameIndex === 0) {
        fail(new Error('离屏渲染未产生有效视频帧'))
        return
      }
      const measuredFps = offscreenFrameRate(frameIndex, recordingElapsedMs)
      logger.info('recording', `离屏录制 ${frameIndex} 帧 / ${(recordingElapsedMs / 1000).toFixed(1)} 秒，实测约 ${measuredFps.toFixed(1)} FPS`)
      if (measuredFps < OFFSCREEN_MIN_FLUENT_FPS) logger.warn('recording', `离屏采集帧率偏低（${measuredFps.toFixed(1)} FPS），画面可能不够流畅`)
      const videoReady = new Promise<void>((resolveVideo, rejectVideo) => {
        videoCompleteResolve = resolveVideo
        videoCompleteReject = rejectVideo
      })
      const encodeStartedAt = Date.now()
      const encodeBudgetMs = Math.max(OFFSCREEN_ENCODE_TIMEOUT_MS, frameIndex * OFFSCREEN_ENCODE_MS_PER_FRAME)
      await Promise.all([
        withOffscreenTimeout(
          window.webContents.executeJavaScript('window.guEarthOffscreenMacEncoder.finish()'),
          encodeBudgetMs,
          '离屏视频编码超时，已中止录制'
        ),
        withOffscreenTimeout(videoReady, encodeBudgetMs, '离屏视频编码超时，已中止录制')
      ])
      if (settled) return
      await videoWrite
      await videoFile?.close()
      videoFile = null
      const bytes = await readFileSize(temporaryPath)
      if (settled) return
      await renameFile(temporaryPath, outputPath)
      if (settled) {
        await rm(outputPath, { force: true }).catch(() => undefined)
        return
      }
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      if (settled) {
        await rm(outputPath, { force: true }).catch(() => undefined)
        return
      }
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
