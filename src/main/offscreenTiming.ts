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
