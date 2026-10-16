export interface OffscreenSceneTiming {
  dwellMs: number
  flyDurationMs: number
}

export function offscreenScriptDurationMs(scenes: OffscreenSceneTiming[]): number {
  return Math.max(1000, scenes.reduce((total, scene, index) => total + (index > 0 ? Math.max(0, scene.flyDurationMs) : 0) + Math.max(0, scene.dwellMs), 0))
}

export function offscreenFrameRate(frameCount: number, elapsedMs: number): number {
  if (!Number.isFinite(frameCount) || frameCount <= 0) return 1
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1
  return Math.max(1, frameCount * 1000 / elapsedMs)
}

export interface OffscreenCaptureSize {
  width: number
  height: number
}

export function offscreenCaptureSize(requestedWidth: number, requestedHeight: number, workAreaWidth: number, workAreaHeight: number, margin = 2): OffscreenCaptureSize {
  const aspect = requestedWidth / requestedHeight
  const maxWidth = Math.max(160, Math.min(requestedWidth, Math.floor(workAreaWidth) - margin))
  const maxHeight = Math.max(120, Math.min(requestedHeight, Math.floor(workAreaHeight) - margin))
  let width = maxWidth
  let height = Math.round(width / aspect)
  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * aspect)
  }
  return { width, height }
}

export function offscreenFrameDurations(frameTimesMs: number[], totalMs: number): number[] {
  const minimumSeconds = 1 / 240
  return frameTimesMs.map((capturedAt, index) => {
    const next = index + 1 < frameTimesMs.length ? frameTimesMs[index + 1] : totalMs
    const seconds = (next - capturedAt) / 1000
    return Number.isFinite(seconds) && seconds > minimumSeconds ? seconds : minimumSeconds
  })
}

export function offscreenConcatPlaylist(frameNames: string[], durations: number[]): string {
  const lines = ['ffconcat version 1.0']
  frameNames.forEach((name, index) => {
    lines.push(`file '${name}'`)
    lines.push(`duration ${(durations[index] ?? 1 / 30).toFixed(6)}`)
  })
  if (frameNames.length) lines.push(`file '${frameNames[frameNames.length - 1]}'`)
  return `${lines.join('\n')}\n`
}

