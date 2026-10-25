import * as Cesium from 'cesium'
import { bearingDeg, exaggeratedSurfaceHeightM, groundProfileImplausible, interpolateWaypoints, planTransectAltitudes, transectHops, transectLegsKm, transectTotalKm, type TransectWaypoint } from '@renderer/lib/transect'
import { isAvailabilityStripped } from '../../../common/terrainAvailability'
import { detailedSamplingTerrain } from '@renderer/terrain/terrainRegistry'
import { useGlobeStore } from '@renderer/stores/globe'
import { useZonationStore } from '@renderer/stores/zonation'

const SAMPLE_DEADLINE_MS = 30000
const SAMPLE_RETRY_DEADLINE_MS = 8000
const SAMPLE_CACHE_TTL_MS = 60000
const FLIGHT_CLEARANCE_M = 2000
const MIN_FLIGHT_ALTITUDE_M = 2500
const MIN_BLIND_ALTITUDE_M = 9000
const TRANSECT_LINE_COLOR = '#1677ff'
const MAX_TOTAL_SAMPLES = 128
const FLIGHT_SPEED_KM_PER_S = 25
const MIN_FLIGHT_DURATION_S = 6
const MAX_FLIGHT_DURATION_S = 30
const FLIGHT_TILE_CACHE_SIZE = 600
const PREWARM_HOP_TIMEOUT_MS = 6000
const PREWARM_TOTAL_BUDGET_MS = 45000
const PREWARM_MAX_HOPS = 24
const PREWARM_SWEEP_HOP_MS = 50
const PREWARM_SETTLE_MS = 120

export interface TransectFlightResult {
  status: 'ok' | 'interrupted'
  totalKm: number
  flightAltitudeM: number
  legs: number
  completedLegs: number
  reason?: 'superseded' | 'cancelled' | 'exaggeration-changed'
  maxGroundM?: number
  degraded?: boolean
}

export interface TransectFlightProgress {
  stage: 'sampling' | 'prewarm' | 'flying'
  completed: number
  total: number
  altitudeM?: number
}

export interface TransectGroundSample {
  path: TransectWaypoint[]
  heights: number[]
  degraded: boolean
}

export interface TransectFlightOptions {
  altitudeM?: number
  expectedMaxGroundM?: number
  onProgress?: (progress: TransectFlightProgress) => void
}

interface ActiveRun {
  token: symbol
  cancelled: boolean
  lastPathIndex: number
  interruptReason?: 'superseded' | 'cancelled' | 'exaggeration-changed'
}

let activeRun: ActiveRun | null = null
let activeTransect: { viewer: Cesium.Viewer; entities: Cesium.Entity[]; token: symbol } | null = null
let animationInputLocks = 0
let tileCacheOriginal: number | null = null
const groundSampleCache = new WeakMap<Cesium.Viewer, { key: string; at: number; sample: TransectGroundSample }>()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function cancelTransectFlight(): void {
  if (activeRun && !activeRun.interruptReason) activeRun.interruptReason = 'cancelled'
  if (activeRun) activeRun.cancelled = true
}

export function clearTransectOverlay(viewer?: Cesium.Viewer | null): void {
  if (!activeTransect) return
  if (activeTransect.viewer.isDestroyed()) {
    activeTransect = null
    return
  }
  if (viewer && activeTransect.viewer !== viewer) return
  for (const entity of activeTransect.entities) activeTransect.viewer.entities.remove(entity)
  activeTransect.viewer.scene.requestRender()
  activeTransect = null
}

function validateWaypoints(waypoints: TransectWaypoint[]): string | null {
  if (waypoints.length < 2 || waypoints.length > 6) return '剖面途经点需要 2-6 个'
  for (const [longitude, latitude] of waypoints) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return '剖面途经点坐标无效，需要 WGS-84 经纬度'
    }
  }
  return null
}

function samplesPerLeg(waypointCount: number): number {
  return Math.min(32, Math.max(8, Math.floor(MAX_TOTAL_SAMPLES / Math.max(1, waypointCount - 1))))
}

const detailedTerrainProviders = new Map<string, Promise<Cesium.TerrainProvider>>()

function resolveSamplingTerrainProvider(viewer: Cesium.Viewer): Promise<Cesium.TerrainProvider> {
  const active = viewer.terrainProvider
  if (!isAvailabilityStripped(active)) return Promise.resolve(active)
  const id = useGlobeStore().terrainProviderId
  const create = detailedSamplingTerrain(id)
  if (!create) return Promise.resolve(active)
  let provider = detailedTerrainProviders.get(id)
  if (!provider) {
    provider = create()
    detailedTerrainProviders.set(id, provider)
    provider.catch(() => detailedTerrainProviders.delete(id))
  }
  return provider.catch(() => active)
}

export async function sampleTransectGround(viewer: Cesium.Viewer, waypoints: TransectWaypoint[], onProgress?: (progress: TransectFlightProgress) => void, expectedMaxGroundM?: number): Promise<TransectGroundSample> {
  const path = interpolateWaypoints(waypoints, samplesPerLeg(waypoints.length))
  const key = JSON.stringify({ waypoints, expectedMaxGroundM })
  const cached = groundSampleCache.get(viewer)
  if (cached && cached.key === key && Date.now() - cached.at < SAMPLE_CACHE_TTL_MS) return cached.sample
  const cartographics = path.map(([longitude, latitude]) => Cesium.Cartographic.fromDegrees(longitude, latitude))
  onProgress?.({ stage: 'sampling', completed: 0, total: path.length })
  const samplingProvider = await resolveSamplingTerrainProvider(viewer)
  const outcome = await Promise.race([
    Cesium.sampleTerrainMostDetailed(samplingProvider, cartographics)
      .then(() => 'resolved' as const)
      .catch(() => 'rejected' as const),
    delay(SAMPLE_DEADLINE_MS).then(() => 'timeout' as const)
  ])
  let heights: number[]
  let detailedSampling = outcome === 'resolved'
  if (outcome === 'rejected') {
    const retried = await Promise.race([
      Cesium.sampleTerrainMostDetailed(samplingProvider, cartographics).then(() => true).catch(() => false),
      delay(SAMPLE_RETRY_DEADLINE_MS).then(() => false)
    ])
    detailedSampling = retried
  }
  if (detailedSampling) {
    heights = path.map((_, index) => {
      const height = cartographics[index].height
      return Number.isFinite(height) ? height : Number.NaN
    })
  } else {
    heights = path.map(() => Number.NaN)
  }
  let fallbackCount = 0
  let holeCount = 0
  const finalHeights = heights.map((height, index) => {
    if (Number.isFinite(height)) return height
    const [longitude, latitude] = path[index]
    const fallback = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(longitude, latitude))
    if (fallback !== undefined && Number.isFinite(fallback)) {
      fallbackCount += 1
      return fallback
    }
    holeCount += 1
    return 0
  })
  const degraded = !detailedSampling || fallbackCount > 0 || holeCount > 0 || groundProfileImplausible(finalHeights, expectedMaxGroundM)
  const sample: TransectGroundSample = { path, heights: finalHeights, degraded }
  if (!degraded) groundSampleCache.set(viewer, { key, at: Date.now(), sample })
  return sample
}

function waitForTilesLoaded(viewer: Cesium.Viewer, timeoutMs: number): Promise<void> {
  const scene = viewer.scene
  const settle = async (): Promise<void> => {
    await delay(PREWARM_SETTLE_MS)
    scene.requestRender()
  }
  if (scene.globe.tilesLoaded) return settle()
  return new Promise((resolve) => {
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      scene.globe.tileLoadProgressEvent.removeEventListener(onProgressEvent)
      resolve()
    }
    const onProgressEvent = (): void => {
      scene.requestRender()
      if (scene.globe.tilesLoaded) finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    scene.globe.tileLoadProgressEvent.addEventListener(onProgressEvent)
  })
}

async function sweepTransectTiles(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudes: number[], started: number, run: ActiveRun, plannedExaggeration: number, waitPerHop: boolean, onProgress?: (progress: TransectFlightProgress) => void): Promise<void> {
  const scene = viewer.scene
  const headingAt = (index: number): number => {
    const neighbor = index < path.length - 1 ? path[index + 1] : path[index - 1]
    return bearingDeg(path[index][0], path[index][1], neighbor[0], neighbor[1])
  }
  const hops = transectHops(path.length, PREWARM_MAX_HOPS)
  for (let done = 0; done < hops.length; done += 1) {
    if (run.cancelled || Date.now() - started > PREWARM_TOTAL_BUDGET_MS) return
    if (scene.verticalExaggeration !== plannedExaggeration) {
      run.interruptReason = 'exaggeration-changed'
      run.cancelled = true
      return
    }
    const index = hops[done]
    const [longitude, latitude] = path[index]
    scene.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudes[index]),
      orientation: { heading: Cesium.Math.toRadians(headingAt(index)), pitch: Cesium.Math.toRadians(-18), roll: 0 }
    })
    scene.requestRender()
    onProgress?.({ stage: 'prewarm', completed: done, total: hops.length })
    if (waitPerHop) await waitForTilesLoaded(viewer, PREWARM_HOP_TIMEOUT_MS)
    else await delay(PREWARM_SWEEP_HOP_MS)
  }
  onProgress?.({ stage: 'prewarm', completed: hops.length, total: hops.length })
}

async function prewarmTransectTiles(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudes: number[], run: ActiveRun, plannedExaggeration: number, onProgress?: (progress: TransectFlightProgress) => void): Promise<void> {
  const canvas = viewer.canvas
  const previousOpacity = canvas.style.opacity
  canvas.style.opacity = '0.15'
  const started = Date.now()
  try {
    await sweepTransectTiles(viewer, path, altitudes, started, run, plannedExaggeration, false, onProgress)
    await sweepTransectTiles(viewer, path, altitudes, started, run, plannedExaggeration, true, onProgress)
  } finally {
    canvas.style.opacity = previousOpacity
    viewer.scene.requestRender()
  }
}

function replaceOverlay(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudes: number[], token: symbol): Cesium.Entity[] {
  clearTransectOverlay()
  const entities: Cesium.Entity[] = []
  entities.push(
    viewer.entities.add({
      polyline: {
        positions: path.map(([longitude, latitude], index) => Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudes[index])),
        width: 3,
        material: Cesium.Color.fromCssColorString(TRANSECT_LINE_COLOR).withAlpha(0.75),
        clampToGround: false
      }
    })
  )
  for (const index of [0, path.length - 1]) {
    entities.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(path[index][0], path[index][1], altitudes[index]),
        point: { pixelSize: 9, color: Cesium.Color.fromCssColorString(TRANSECT_LINE_COLOR), outlineColor: Cesium.Color.WHITE.withAlpha(0.9), outlineWidth: 2 }
      })
    )
  }
  viewer.scene.requestRender()
  activeTransect = { viewer, entities, token }
  return entities
}

async function animateAlongTransect(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudes: number[], totalPathKm: number, run: ActiveRun, plannedExaggeration: number, onProgress?: (progress: TransectFlightProgress) => void): Promise<boolean> {
  const scene = viewer.scene
  animationInputLocks += 1
  if (animationInputLocks === 1) scene.screenSpaceCameraController.enableInputs = false
  const globeStore = useGlobeStore()
  const refreshCameraReadout = (): void => {
    const cartographic = scene.camera.positionCartographic
    const headingDegrees = Cesium.Math.toDegrees(scene.camera.heading) % 360
    globeStore.setCameraReadout({
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
      heading: headingDegrees < 0 ? headingDegrees + 360 : headingDegrees,
      pitch: Cesium.Math.toDegrees(scene.camera.pitch)
    })
  }
  const legKm = transectLegsKm(path)
  const cumulativeKm: number[] = [0]
  for (const leg of legKm) cumulativeKm.push(cumulativeKm[cumulativeKm.length - 1] + leg)
  const durationMs = Math.min(MAX_FLIGHT_DURATION_S, Math.max(MIN_FLIGHT_DURATION_S, totalPathKm / FLIGHT_SPEED_KM_PER_S)) * 1000
  const headingAt = (index: number): number => {
    const neighbor = index < path.length - 1 ? path[index + 1] : path[index - 1]
    return bearingDeg(path[index][0], path[index][1], neighbor[0], neighbor[1])
  }
  const start = performance.now()
  let reportedIndex = -1
  try {
    while (true) {
      if (run.cancelled) return false
      if (scene.verticalExaggeration !== plannedExaggeration) {
        run.interruptReason = 'exaggeration-changed'
        return false
      }
      const t = Math.min(1, (performance.now() - start) / durationMs)
      const distanceKm = easeInOutCubic(t) * totalPathKm
      let index = 0
      while (index < legKm.length - 1 && cumulativeKm[index + 1] < distanceKm) index += 1
      const legStart = cumulativeKm[index]
      const fraction = legKm[index] > 0 ? Math.min(1, Math.max(0, (distanceKm - legStart) / legKm[index])) : 1
      const [fromLon, fromLat] = path[index]
      const [toLon, toLat] = path[index + 1]
      const longitude = fromLon + (toLon - fromLon) * fraction
      const latitude = fromLat + (toLat - fromLat) * fraction
      const altitude = altitudes[index] + (altitudes[index + 1] - altitudes[index]) * fraction
      scene.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
        orientation: { heading: Cesium.Math.toRadians(headingAt(index)), pitch: Cesium.Math.toRadians(-18), roll: 0 }
      })
      scene.requestRender()
      run.lastPathIndex = index
      if (index !== reportedIndex) {
        reportedIndex = index
        refreshCameraReadout()
        onProgress?.({ stage: 'flying', completed: index, total: path.length - 1, altitudeM: Math.round(altitude) })
      }
      if (t >= 1) {
        refreshCameraReadout()
        return true
      }
      await nextFrame()
    }
  } finally {
    animationInputLocks -= 1
    if (animationInputLocks === 0) scene.screenSpaceCameraController.enableInputs = true
  }
}

export async function flyTransect(viewer: Cesium.Viewer, waypoints: TransectWaypoint[], options: TransectFlightOptions = {}): Promise<TransectFlightResult | { error: string }> {
  if (viewer.isDestroyed()) return { error: '地球尚未就绪' }
  const invalid = validateWaypoints(waypoints)
  if (invalid) return { error: invalid }
  const requestedAltitude = options.altitudeM
  if (requestedAltitude !== undefined && (!Number.isFinite(requestedAltitude) || requestedAltitude < 1000 || requestedAltitude > 20000000)) {
    return { error: 'altitudeM 需为 1000-20000000 的海拔高度（米）' }
  }
  if (activeRun) activeRun.interruptReason = 'superseded'
  cancelTransectFlight()
  const run: ActiveRun = { token: Symbol('transect-run'), cancelled: false, lastPathIndex: 0 }
  activeRun = run
  const onProgress = options.onProgress
  const zonationStore = useZonationStore()
  const report = (progress: TransectFlightProgress): void => {
    onProgress?.(progress)
    zonationStore.setFlightHud({ stage: progress.stage, completed: progress.completed, total: progress.total, altitudeM: progress.altitudeM })
  }
  const scene = viewer.scene
  if (tileCacheOriginal === null) tileCacheOriginal = scene.globe.tileCacheSize
  scene.globe.tileCacheSize = Math.max(scene.globe.tileCacheSize, FLIGHT_TILE_CACHE_SIZE)
  const [startLon, startLat] = waypoints[0]
  scene.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(startLon, startLat, Math.min(2000000, Math.max(MIN_FLIGHT_ALTITUDE_M, scene.camera.positionCartographic.height))),
    orientation: { heading: Cesium.Math.toRadians(bearingDeg(startLon, startLat, waypoints[1][0], waypoints[1][1])), pitch: Cesium.Math.toRadians(-18), roll: 0 },
    duration: 1.6
  })
  try {
    const exaggerationBeforeSampling = scene.verticalExaggeration
    const { path, heights, degraded } = await sampleTransectGround(viewer, waypoints, report, options.expectedMaxGroundM)
    if (run.cancelled) return { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM: 0, legs: waypoints.length - 1, completedLegs: 0, reason: run.interruptReason }
    if (scene.verticalExaggeration !== exaggerationBeforeSampling) {
      return { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM: 0, legs: waypoints.length - 1, completedLegs: 0, reason: 'exaggeration-changed' }
    }
    const exaggeration = exaggerationBeforeSampling
    const relativeHeight = scene.verticalExaggerationRelativeHeight
    const surfaces = heights.map((height) => exaggeratedSurfaceHeightM(height, exaggeration, relativeHeight))
    const minimumAltitudeM = degraded ? MIN_BLIND_ALTITUDE_M * exaggeration + FLIGHT_CLEARANCE_M : MIN_FLIGHT_ALTITUDE_M
    const altitudes = planTransectAltitudes(surfaces, FLIGHT_CLEARANCE_M, minimumAltitudeM, requestedAltitude)
    const flightAltitudeM = Math.round(Math.max(...altitudes))
    const maxGroundM = Math.round(Math.max(...heights))
    const diagnostics = { maxGroundM, degraded }
    replaceOverlay(viewer, path, altitudes, run.token)
    await prewarmTransectTiles(viewer, path, altitudes, run, exaggeration, report)
    if (run.cancelled) {
      return { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs: 0, reason: run.interruptReason, ...diagnostics }
    }
    const completed = await animateAlongTransect(viewer, path, altitudes, transectTotalKm(path), run, exaggeration, report)
    const completedLegs = completed ? waypoints.length - 1 : Math.min(waypoints.length - 1, Math.round((run.lastPathIndex / Math.max(1, path.length - 1)) * (waypoints.length - 1)))
    return completed
      ? { status: 'ok', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs, ...diagnostics }
      : { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs, reason: run.interruptReason ?? 'cancelled', ...diagnostics }
  } finally {
    zonationStore.setFlightHud(null)
    if (activeRun === run) {
      activeRun = null
      if (tileCacheOriginal !== null) {
        scene.globe.tileCacheSize = tileCacheOriginal
        tileCacheOriginal = null
      }
    }
    if (activeTransect && activeTransect.token === run.token) clearTransectOverlay(viewer)
  }
}
