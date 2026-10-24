import type { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export interface OffscreenMacEncoderConfig {
  width: number
  height: number
  framerate: number
  bitrate: number
}

export interface OffscreenMacEncoderStats {
  received: number
  encoded: number
  failure: string
}

interface OffscreenMacFrameEntry {
  captureTimeMs: number
  jpeg: Uint8Array
}

interface OffscreenMacEncoderSession {
  config: OffscreenMacEncoderConfig
  queue: OffscreenMacFrameEntry[]
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  encoder: VideoEncoder
  muxer: Muxer<ArrayBufferTarget>
  drainWaiters: Array<() => void>
  pumping: boolean
  received: number
  encoded: number
  lastTimestampUs: number
  failure: string
  finished: boolean
}

const OFFSCREEN_MAC_CODEC = 'avc1.64002A'
const OFFSCREEN_MAC_KEYFRAME_INTERVAL = 60
const OFFSCREEN_MAC_MIN_FRAME_GAP_US = Math.ceil(1_000_000 / 240)
const OFFSCREEN_MAC_MAX_ENCODE_QUEUE = 8

let session: OffscreenMacEncoderSession | null = null

async function begin(config: OffscreenMacEncoderConfig): Promise<void> {
  if (session) throw new Error('macOS 编码会话已在进行')
  if (typeof VideoEncoder === 'undefined') throw new Error('当前系统缺少 H.264 视频编码器（VideoEncoder 不可用），无法录制视频')
  const support = await VideoEncoder.isConfigSupported({
    codec: OFFSCREEN_MAC_CODEC,
    width: config.width,
    height: config.height,
    bitrate: config.bitrate,
    framerate: config.framerate,
    avc: { format: 'avc' }
  })
  if (!support.supported) throw new Error(`当前系统缺少 H.264 视频编码器（${OFFSCREEN_MAC_CODEC} 不可用），无法录制视频`)
  const canvas = document.createElement('canvas')
  canvas.width = config.width
  canvas.height = config.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 macOS 编码合成画布')
  const { Muxer: MuxerCtor, ArrayBufferTarget: ArrayBufferTargetCtor } = await import('mp4-muxer')
  const muxer = new MuxerCtor({
    target: new ArrayBufferTargetCtor(),
    video: { codec: 'avc', width: config.width, height: config.height, frameRate: config.framerate },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  })
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (error) => {
      if (session?.failure) return
      if (session) session.failure = `离屏视频编码失败（${error.message}）`
    }
  })
  encoder.configure({
    codec: OFFSCREEN_MAC_CODEC,
    width: config.width,
    height: config.height,
    bitrate: config.bitrate,
    framerate: config.framerate,
    avc: { format: 'avc' }
  })
  session = {
    config,
    queue: [],
    canvas,
    context,
    encoder,
    muxer,
    drainWaiters: [],
    pumping: false,
    received: 0,
    encoded: 0,
    lastTimestampUs: -OFFSCREEN_MAC_MIN_FRAME_GAP_US,
    failure: '',
    finished: false
  }
}

async function decodeJpegFrame(jpeg: Uint8Array): Promise<VideoFrame> {
  const decoder = new ImageDecoder({ data: jpeg, type: 'image/jpeg' })
  const { image } = await decoder.decode({ frameIndex: 0 })
  decoder.close()
  return image
}

function drainEncodeQueue(encoder: VideoEncoder, maxQueue: number): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueue) return Promise.resolve()
  return new Promise((resolve) => {
    const check = (): void => {
      if (encoder.encodeQueueSize <= maxQueue) {
        encoder.removeEventListener('dequeue', check)
        resolve()
      }
    }
    encoder.addEventListener('dequeue', check)
  })
}

function settleDrainWaiters(active: OffscreenMacEncoderSession): void {
  if (active.drainWaiters.length === 0) return
  const waiters = active.drainWaiters
  active.drainWaiters = []
  for (const waiter of waiters) waiter()
}

function pump(active: OffscreenMacEncoderSession): void {
  if (active.pumping) return
  active.pumping = true
  void (async () => {
    try {
      while (active.queue.length > 0 && !active.failure) {
        const entry = active.queue.shift()
        if (!entry) break
        await encodeFrame(active, entry)
        active.encoded += 1
        window.guEarth?.recordings?.sendOffscreenFrameAck(1)
      }
    } catch (error) {
      if (!active.failure) active.failure = error instanceof Error ? error.message : String(error)
    } finally {
      active.pumping = false
      if (active.queue.length === 0 || active.failure) settleDrainWaiters(active)
    }
  })()
}

async function encodeFrame(active: OffscreenMacEncoderSession, entry: OffscreenMacFrameEntry): Promise<void> {
  if (active.failure) throw new Error(active.failure)
  const { config, canvas, context, encoder } = active
  const image = await decodeJpegFrame(entry.jpeg)
  context.fillStyle = '#000'
  context.fillRect(0, 0, config.width, config.height)
  const scale = Math.min(config.width / image.displayWidth, config.height / image.displayHeight)
  const drawWidth = Math.max(1, Math.round(image.displayWidth * scale))
  const drawHeight = Math.max(1, Math.round(image.displayHeight * scale))
  context.drawImage(image, Math.round((config.width - drawWidth) / 2), Math.round((config.height - drawHeight) / 2), drawWidth, drawHeight)
  image.close()
  const capturedUs = Math.round(entry.captureTimeMs * 1000)
  const timestampUs = capturedUs > active.lastTimestampUs + OFFSCREEN_MAC_MIN_FRAME_GAP_US ? capturedUs : active.lastTimestampUs + OFFSCREEN_MAC_MIN_FRAME_GAP_US
  active.lastTimestampUs = timestampUs
  const frame = new VideoFrame(canvas, { timestamp: timestampUs })
  encoder.encode(frame, { keyFrame: active.encoded % OFFSCREEN_MAC_KEYFRAME_INTERVAL === 0 })
  frame.close()
  await drainEncodeQueue(encoder, OFFSCREEN_MAC_MAX_ENCODE_QUEUE)
}

function whenDrained(active: OffscreenMacEncoderSession): Promise<void> {
  if (!active.pumping && (active.queue.length === 0 || active.failure)) return Promise.resolve()
  return new Promise((resolve) => {
    active.drainWaiters.push(resolve)
  })
}

async function finish(): Promise<{ frames: number }> {
  const active = session
  if (!active) throw new Error('macOS 编码会话尚未开始')
  if (active.finished) throw new Error('macOS 编码会话已结束')
  active.finished = true
  await whenDrained(active)
  if (active.failure) throw new Error(active.failure)
  const { encoder, muxer } = active
  await encoder.flush()
  encoder.close()
  muxer.finalize()
  const bytes = muxer.target.buffer
  if (!bytes || bytes.byteLength === 0) throw new Error(active.failure || '未能生成离屏视频数据')
  window.guEarth?.recordings?.sendOffscreenVideo(bytes)
  return { frames: active.encoded }
}

function stats(): OffscreenMacEncoderStats {
  return {
    received: session?.received ?? 0,
    encoded: session?.encoded ?? 0,
    failure: session?.failure ?? ''
  }
}

window.guEarth?.recordings?.onOffscreenFrame((_index, captureTimeMs, jpeg) => {
  const active = session
  if (!active || active.finished) return
  active.received += 1
  active.queue.push({ captureTimeMs, jpeg })
  pump(active)
})

Object.assign(window, { guEarthOffscreenMacEncoder: { begin, finish, stats } })
