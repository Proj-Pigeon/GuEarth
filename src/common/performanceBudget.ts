export const PERFORMANCE_MODES = ['fluent', 'balanced', 'quality'] as const

export type PerformanceMode = (typeof PERFORMANCE_MODES)[number]

export type PrewarmQualityCap = 'standard' | 'high' | 'ultra'

export interface PerformanceBudget {
  screenSpaceError: number
  tileCacheSize: number
  flightTileCacheSize: number
  resolutionScale: number
  msaaSamples: number | null
  antialias: boolean
  depthTestAgainstTerrain: boolean
  maxWindParticles: number
  minWindParticles: number
  windFrameIntervalMs: number
  terrainSampleCap: number
  maxPrewarmQuality: PrewarmQualityCap
  recordingWidth: number
  recordingHeight: number
  recordingFps: number
}

const PREWARM_RANK: Record<PrewarmQualityCap, number> = { standard: 0, high: 1, ultra: 2 }

export const PERFORMANCE_BUDGETS: Record<PerformanceMode, PerformanceBudget> = {
  fluent: {
    screenSpaceError: 3,
    tileCacheSize: 100,
    flightTileCacheSize: 160,
    resolutionScale: 0.7,
    msaaSamples: 1,
    antialias: false,
    depthTestAgainstTerrain: false,
    maxWindParticles: 400,
    minWindParticles: 80,
    windFrameIntervalMs: 1000 / 18,
    terrainSampleCap: 64,
    maxPrewarmQuality: 'standard',
    recordingWidth: 1280,
    recordingHeight: 720,
    recordingFps: 24
  },
  balanced: {
    screenSpaceError: 2,
    tileCacheSize: 256,
    flightTileCacheSize: 600,
    resolutionScale: 1,
    msaaSamples: null,
    antialias: true,
    depthTestAgainstTerrain: true,
    maxWindParticles: 1100,
    minWindParticles: 250,
    windFrameIntervalMs: 1000 / 60,
    terrainSampleCap: 128,
    maxPrewarmQuality: 'ultra',
    recordingWidth: 1920,
    recordingHeight: 1080,
    recordingFps: 30
  },
  quality: {
    screenSpaceError: 1.5,
    tileCacheSize: 384,
    flightTileCacheSize: 600,
    resolutionScale: 1,
    msaaSamples: 4,
    antialias: true,
    depthTestAgainstTerrain: true,
    maxWindParticles: 1100,
    minWindParticles: 250,
    windFrameIntervalMs: 1000 / 60,
    terrainSampleCap: 128,
    maxPrewarmQuality: 'ultra',
    recordingWidth: 1920,
    recordingHeight: 1080,
    recordingFps: 30
  }
}

export function isPerformanceMode(value: unknown): value is PerformanceMode {
  return value === 'fluent' || value === 'balanced' || value === 'quality'
}

export function normalizePerformanceMode(value: unknown): PerformanceMode {
  return isPerformanceMode(value) ? value : 'balanced'
}

export function performanceBudget(mode: unknown): PerformanceBudget {
  return PERFORMANCE_BUDGETS[normalizePerformanceMode(mode)]
}

export function clampPrewarmQuality(mode: unknown, quality: unknown): PrewarmQualityCap {
  const cap = performanceBudget(mode).maxPrewarmQuality
  const normalized: PrewarmQualityCap =
    quality === 'standard' || quality === 'ultra' ? quality : 'high'
  return PREWARM_RANK[normalized] > PREWARM_RANK[cap] ? cap : normalized
}
