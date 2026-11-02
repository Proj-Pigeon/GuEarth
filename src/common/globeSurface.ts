export interface SurfaceSize {
  clientWidth: number
  clientHeight: number
  drawingBufferWidth: number
  drawingBufferHeight: number
}

export interface BufferGapState {
  since: number
  reported: boolean
}

export type RenderFrameDecision =
  | { action: 'render' }
  | { action: 'recover-resize' }
  | { action: 'tick'; reason: 'awaiting-layout' | 'buffer-missing' }

export type SurfaceFrameKind = 'rendered' | 'awaiting-layout' | 'buffer-missing'

export type RenderFaultKind = 'recover' | 'report'

export interface WebGlContextAttempt {
  id: 'webgl2' | 'webgl2-relaxed' | 'webgl1' | 'webgl1-fallback'
  requestWebgl1: boolean
  preserveDrawingBuffer: boolean
  antialias: boolean
  powerPreference: 'high-performance' | 'default' | 'low-power'
  failIfMajorPerformanceCaveat: boolean
}

export interface WebGlContextOptions {
  requestWebgl1?: true
  webgl: {
    preserveDrawingBuffer: boolean
    antialias: boolean
    powerPreference: WebGlContextAttempt['powerPreference']
    failIfMajorPerformanceCaveat: boolean
  }
}

export const BUFFER_MISSING_REPORT_MS = 8000
export const RENDER_FAULT_LIMIT = 3

export const WEBGL_UNAVAILABLE_MESSAGE = '三维地球无法启动'
export const WEBGL_UNAVAILABLE_DETAIL = '显卡加速暂时不可用。请更新显卡驱动，或关闭其他占用显卡的程序后点击重试。使用远程桌面或虚拟机时，请在本机直接打开。'
export const SURFACE_UNAVAILABLE_MESSAGE = '地球画面无法创建'
export const SURFACE_UNAVAILABLE_DETAIL = '图形表面尺寸为 0。请先还原窗口再点击重试；若窗口已经正常显示仍是空白，请更新显卡驱动。'
export const RENDER_HALTED_MESSAGE = '三维地球渲染已停止'
export const RENDER_HALTED_DETAIL = '画面渲染遇到无法恢复的图形错误。请更新显卡驱动后点击重试。'
export const WEBGL_RETRY_STAGE = '显卡上下文未就绪，正在重试…'

export const WEBGL_CONTEXT_ATTEMPTS: readonly WebGlContextAttempt[] = [
  { id: 'webgl2', requestWebgl1: false, preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false },
  { id: 'webgl2-relaxed', requestWebgl1: false, preserveDrawingBuffer: true, antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
  { id: 'webgl1', requestWebgl1: true, preserveDrawingBuffer: true, antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
  { id: 'webgl1-fallback', requestWebgl1: true, preserveDrawingBuffer: false, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false }
]

const WEBGL_RETRY_DELAYS_MS = [0, 700, 1800, 4000]

export function webGlRetryDelayMs(attempt: number): number {
  return WEBGL_RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), WEBGL_RETRY_DELAYS_MS.length - 1)] ?? 0
}

export function contextOptionsForAttempt(attempt: WebGlContextAttempt): WebGlContextOptions {
  const webgl = {
    preserveDrawingBuffer: attempt.preserveDrawingBuffer,
    antialias: attempt.antialias,
    powerPreference: attempt.powerPreference,
    failIfMajorPerformanceCaveat: attempt.failIfMajorPerformanceCaveat
  }
  return attempt.requestWebgl1 ? { requestWebgl1: true, webgl } : { webgl }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name
  return typeof error === 'string' ? error : ''
}

export function isZeroFramebufferError(error: unknown): boolean {
  return /Expected (width|height) to be greater than 0/.test(errorText(error))
}

export function isWebGlInitializationError(error: unknown): boolean {
  const text = errorText(error)
  return text.includes('initialization failed') || text.includes('does not support WebGL')
}

export function isContextLostError(error: unknown): boolean {
  return /context lost|context_lost|webglcontextlost/i.test(errorText(error))
}

export function classifyRenderFault(error: unknown, contextLost: boolean): RenderFaultKind {
  if (contextLost || isZeroFramebufferError(error) || isContextLostError(error)) return 'recover'
  return 'report'
}

export function shouldStopRenderLoop(kind: RenderFaultKind, consecutiveFaults: number): boolean {
  return kind === 'report' || consecutiveFaults >= RENDER_FAULT_LIMIT
}

export function surfaceFailureCopy(contextLost: boolean): { message: string; detail: string } {
  if (contextLost) return { message: WEBGL_UNAVAILABLE_MESSAGE, detail: WEBGL_UNAVAILABLE_DETAIL }
  return { message: SURFACE_UNAVAILABLE_MESSAGE, detail: SURFACE_UNAVAILABLE_DETAIL }
}

export function surfaceIsRenderable(size: SurfaceSize): boolean {
  return size.clientWidth >= 1 && size.clientHeight >= 1 && size.drawingBufferWidth >= 1 && size.drawingBufferHeight >= 1
}

export function decideRenderFrame(size: SurfaceSize, recoveryAttempted: boolean): RenderFrameDecision {
  if (size.clientWidth < 1 || size.clientHeight < 1) return { action: 'tick', reason: 'awaiting-layout' }
  if (size.drawingBufferWidth >= 1 && size.drawingBufferHeight >= 1) return { action: 'render' }
  if (!recoveryAttempted) return { action: 'recover-resize' }
  return { action: 'tick', reason: 'buffer-missing' }
}

export function advanceBufferGap(state: BufferGapState, kind: SurfaceFrameKind, now: number, limitMs: number): 'ok' | 'waiting' | 'report' {
  if (kind === 'rendered') {
    state.since = 0
    state.reported = false
    return 'ok'
  }
  if (kind === 'awaiting-layout') {
    state.since = 0
    return 'ok'
  }
  if (!state.since) state.since = now
  if (state.reported) return 'waiting'
  if (now - state.since < limitMs) return 'waiting'
  state.reported = true
  return 'report'
}

export function backingStoreSize(clientWidth: number, clientHeight: number, pixelRatio: number, resolutionScale: number): { width: number; height: number } {
  return {
    width: Math.trunc(clientWidth * pixelRatio * resolutionScale),
    height: Math.trunc(clientHeight * pixelRatio * resolutionScale)
  }
}

export function nudgedCanvasSize(currentWidth: number, currentHeight: number, targetWidth: number, targetHeight: number): { width: number; height: number } {
  if (currentWidth === targetWidth && currentHeight === targetHeight) return { width: targetWidth + 1, height: targetHeight }
  return { width: targetWidth, height: targetHeight }
}

export function shouldUseSoftwareMsaaWorkaround(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|basic render|microsoft basic/i.test(renderer)
}

export interface GlRendererSource {
  RENDERER: number
  getExtension(name: string): { UNMASKED_RENDERER_WEBGL: number } | null
  getParameter(parameter: number): unknown
}

export function glRendererName(gl: GlRendererSource | null): string {
  if (!gl) return ''
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const value = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

export function surfaceFailureAlreadyShown(extra: unknown): boolean {
  return typeof extra === 'object' && extra !== null && 'surfaceNotified' in extra && extra.surfaceNotified === true
}
