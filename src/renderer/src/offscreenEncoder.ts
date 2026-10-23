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
  frames: Map<number, OffscreenMacFrameEntry>
  encoder: VideoEncoder
  muxer: Muxer<ArrayBufferTarget>
  received: number
  encoded: number
  failure: string
  finished: boolean
}

const OFFSCREEN_MAC_CODEC = 'avc1.640028'
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
  session = { config, frames: new Map(), encoder, muxer, received: 0, encoded: 0, failure: '', finished: false }
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

async function finish(): Promise<{ frames: number }> {
  const active = session
  if (!active) throw new Error('macOS 编码会话尚未开始')
  if (active.finished) throw new Error('macOS 编码会话已结束')
  active.finished = true
  if (active.failure) throw new Error(active.failure)
  const { config, frames, encoder, muxer } = active
  const canvas = document.createElement('canvas')
  canvas.width = config.width
  canvas.height = config.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 macOS 编码合成画布')
  const indexes = [...frames.keys()].sort((first, second) => first - second)
  let lastTimestampUs = -OFFSCREEN_MAC_MIN_FRAME_GAP_US
  for (let position = 0; position < indexes.length; position += 1) {
    if (active.failure) throw new Error(active.failure)
    const entry = frames.get(indexes[position])
    if (!entry) continue
    const image = await decodeJpegFrame(entry.jpeg)
    context.fillStyle = '#000'
    context.fillRect(0, 0, config.width, config.height)
    const scale = Math.min(config.width / image.displayWidth, config.height / image.displayHeight)
    const drawWidth = Math.max(1, Math.round(image.displayWidth * scale))
    const drawHeight = Math.max(1, Math.round(image.displayHeight * scale))
    context.drawImage(image, Math.round((config.width - drawWidth) / 2), Math.round((config.height - drawHeight) / 2), drawWidth, drawHeight)
    image.close()
    const capturedUs = Math.round(entry.captureTimeMs * 1000)
    const timestampUs = capturedUs > lastTimestampUs + OFFSCREEN_MAC_MIN_FRAME_GAP_US ? capturedUs : lastTimestampUs + OFFSCREEN_MAC_MIN_FRAME_GAP_US
    lastTimestampUs = timestampUs
    const frame = new VideoFrame(canvas, { timestamp: timestampUs })
    encoder.encode(frame, { keyFrame: position % OFFSCREEN_MAC_KEYFRAME_INTERVAL === 0 })
    frame.close()
    active.encoded += 1
    await drainEncodeQueue(encoder, OFFSCREEN_MAC_MAX_ENCODE_QUEUE)
  }
  if (active.failure) throw new Error(active.failure)
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

window.guEarth?.recordings?.onOffscreenFrame((index, captureTimeMs, jpeg) => {
  const active = session
  if (!active || active.finished) return
  active.frames.set(index, { captureTimeMs, jpeg })
  active.received += 1
  window.guEarth?.recordings?.sendOffscreenFrameAck(1)
})

Object.assign(window, { guEarthOffscreenMacEncoder: { begin, finish, stats } })
