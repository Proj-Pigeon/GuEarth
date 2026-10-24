import * as Cesium from 'cesium'
import { bearingDeg, interpolateWaypoints, safeFlightAltitudeM, transectLegsKm, transectTotalKm, type TransectWaypoint } from '@renderer/lib/transect'

const SAMPLE_DEADLINE_MS = 15000
const SAMPLE_RETRY_DEADLINE_MS = 8000
const FLIGHT_CLEARANCE_M = 2000
const MIN_FLIGHT_ALTITUDE_M = 9000
const TRANSECT_LINE_COLOR = '#1677ff'
const MAX_TOTAL_SAMPLES = 64
const LEG_DURATION_PER_KM = 25
const MIN_LEG_DURATION_S = 1.6
const MAX_LEG_DURATION_S = 4.2
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
}

export interface TransectFlightProgress {
  stage: 'sampling' | 'prewarm' | 'flying'
  completed: number
  total: number
}

export interface TransectFlightOptions {
  altitudeM?: number
  onProgress?: (progress: TransectFlightProgress) => void
}

let activeTransect: { viewer: Cesium.Viewer; entities: Cesium.Entity[] } | null = null

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
  return Math.min(16, Math.max(4, Math.floor(MAX_TOTAL_SAMPLES / Math.max(1, waypointCount - 1))))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sampleGroundHeights(viewer: Cesium.Viewer, points: TransectWaypoint[], onProgress?: (progress: TransectFlightProgress) => void): Promise<{ heights: number[]; degraded: boolean }> {
  const cartographics = points.map(([longitude, latitude]) => Cesium.Cartographic.fromDegrees(longitude, latitude))
  onProgress?.({ stage: 'sampling', completed: 0, total: points.length })
  await Promise.race([
    Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics).catch(() => undefined),
    delay(SAMPLE_DEADLINE_MS)
  ])
  const missing = cartographics.filter((item) => !Number.isFinite(item.height))
  if (missing.length > 0 && missing.length < cartographics.length) {
    await Promise.race([
      Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, missing).catch(() => undefined),
      delay(SAMPLE_RETRY_DEADLINE_MS)
    ])
  }
  let degraded = false
  const heights = points.map(([longitude, latitude], index) => {
    const sampled = cartographics[index].height
    if (Number.isFinite(sampled)) return sampled
    const fallback = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(longitude, latitude))
    if (fallback !== undefined && Number.isFinite(fallback)) return fallback
    degraded = true
    return 0
  })
  return { heights, degraded }
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

async function sweepTransectTiles(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudeM: number, started: number, waitPerHop: boolean, onProgress?: (progress: TransectFlightProgress) => void): Promise<void> {
  const scene = viewer.scene
  const headingAt = (index: number): number => {
    const neighbor = index < path.length - 1 ? path[index + 1] : path[index - 1]
    return bearingDeg(path[index][0], path[index][1], neighbor[0], neighbor[1])
  }
  const stride = Math.max(1, Math.ceil(path.length / PREWARM_MAX_HOPS))
  const hops: number[] = []
  for (let index = path.length - 1; index >= 0; index -= stride) hops.push(index)
  if (hops[hops.length - 1] !== 0) hops.push(0)
  for (let done = 0; done < hops.length; done += 1) {
    if (Date.now() - started > PREWARM_TOTAL_BUDGET_MS) break
    const index = hops[done]
    const [longitude, latitude] = path[index]
    scene.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudeM),
      orientation: { heading: Cesium.Math.toRadians(headingAt(index)), pitch: Cesium.Math.toRadians(-18), roll: 0 }
    })
    scene.requestRender()
    onProgress?.({ stage: 'prewarm', completed: done, total: hops.length })
    if (waitPerHop) await waitForTilesLoaded(viewer, PREWARM_HOP_TIMEOUT_MS)
    else await delay(PREWARM_SWEEP_HOP_MS)
  }
  onProgress?.({ stage: 'prewarm', completed: hops.length, total: hops.length })
}

async function prewarmTransectTiles(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudeM: number, onProgress?: (progress: TransectFlightProgress) => void): Promise<void> {
  const canvas = viewer.canvas
  const previousOpacity = canvas.style.opacity
  canvas.style.opacity = '0.15'
  const started = Date.now()
  try {
    await sweepTransectTiles(viewer, path, altitudeM, started, false, onProgress)
    await sweepTransectTiles(viewer, path, altitudeM, started, true, onProgress)
  } finally {
    canvas.style.opacity = previousOpacity
    viewer.scene.requestRender()
  }
}

function replaceOverlay(viewer: Cesium.Viewer, path: TransectWaypoint[], altitudeM: number): Cesium.Entity[] {
  clearTransectOverlay()
  const entities: Cesium.Entity[] = []
  entities.push(
    viewer.entities.add({
      polyline: {
        positions: path.map(([longitude, latitude]) => Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudeM)),
        width: 3,
        material: Cesium.Color.fromCssColorString(TRANSECT_LINE_COLOR).withAlpha(0.75),
        clampToGround: false
      }
    })
  )
  for (const endpoint of [path[0], path[path.length - 1]]) {
    entities.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(endpoint[0], endpoint[1], altitudeM),
        point: { pixelSize: 9, color: Cesium.Color.fromCssColorString(TRANSECT_LINE_COLOR), outlineColor: Cesium.Color.WHITE.withAlpha(0.9), outlineWidth: 2 }
      })
    )
  }
  viewer.scene.requestRender()
  return entities
}

function flyLeg(viewer: Cesium.Viewer, longitude: number, latitude: number, headingDeg: number, altitudeM: number, durationS: number): Promise<boolean> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitudeM),
      orientation: { heading: Cesium.Math.toRadians(headingDeg), pitch: Cesium.Math.toRadians(-18), roll: 0 },
      duration: durationS,
      complete: () => resolve(true),
      cancel: () => resolve(false)
    })
  })
}

export async function flyTransect(viewer: Cesium.Viewer, waypoints: TransectWaypoint[], options: TransectFlightOptions = {}): Promise<TransectFlightResult | { error: string }> {
  if (viewer.isDestroyed()) return { error: '地球尚未就绪' }
  const invalid = validateWaypoints(waypoints)
  if (invalid) return { error: invalid }
  const requestedAltitude = options.altitudeM
  if (requestedAltitude !== undefined && (!Number.isFinite(requestedAltitude) || requestedAltitude < 1000 || requestedAltitude > 20000000)) {
    return { error: 'altitudeM 需为 1000-20000000 的海拔高度（米）' }
  }
  const onProgress = options.onProgress
  const path = interpolateWaypoints(waypoints, samplesPerLeg(waypoints.length))
  const { heights: groundHeights, degraded } = await sampleGroundHeights(viewer, path, onProgress)
  const scene = viewer.scene
  const minimumAltitudeM = degraded ? MIN_FLIGHT_ALTITUDE_M * scene.verticalExaggeration + FLIGHT_CLEARANCE_M : MIN_FLIGHT_ALTITUDE_M
  const flightAltitudeM = Math.round(
    safeFlightAltitudeM(groundHeights, scene.verticalExaggeration, scene.verticalExaggerationRelativeHeight, FLIGHT_CLEARANCE_M, minimumAltitudeM, requestedAltitude)
  )
  replaceOverlay(viewer, path, flightAltitudeM)
  await prewarmTransectTiles(viewer, path, flightAltitudeM, onProgress)
  const legDistances = transectLegsKm(waypoints)
  let completedLegs = 0
  for (let index = 1; index < waypoints.length; index += 1) {
    const [fromLon, fromLat] = waypoints[index - 1]
    const [toLon, toLat] = waypoints[index]
    const heading = bearingDeg(fromLon, fromLat, toLon, toLat)
    const duration = Math.min(MAX_LEG_DURATION_S, Math.max(MIN_LEG_DURATION_S, legDistances[index - 1] / LEG_DURATION_PER_KM))
    onProgress?.({ stage: 'flying', completed: index, total: waypoints.length - 1 })
    const finished = await flyLeg(viewer, toLon, toLat, heading, flightAltitudeM, duration)
    if (!finished) {
      return { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs }
    }
    completedLegs += 1
  }
  return { status: 'ok', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs }
}
