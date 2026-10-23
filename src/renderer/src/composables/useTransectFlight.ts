import * as Cesium from 'cesium'
import { bearingDeg, interpolateWaypoints, safeFlightAltitudeM, transectLegsKm, transectTotalKm, type TransectWaypoint } from '@renderer/lib/transect'

const SAMPLE_TIMEOUT_MS = 5000
const FLIGHT_CLEARANCE_M = 1500
const MIN_FLIGHT_ALTITUDE_M = 9000
const TRANSECT_LINE_COLOR = '#1677ff'
const MAX_TOTAL_SAMPLES = 40
const LEG_DURATION_PER_KM = 25
const MIN_LEG_DURATION_S = 1.6
const MAX_LEG_DURATION_S = 4.2

export interface TransectFlightResult {
  status: 'ok' | 'interrupted'
  totalKm: number
  flightAltitudeM: number
  legs: number
  completedLegs: number
}

export interface TransectFlightOptions {
  altitudeM?: number
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
  return Math.min(10, Math.max(3, Math.floor(MAX_TOTAL_SAMPLES / Math.max(1, waypointCount - 1))))
}

async function sampleGroundHeights(viewer: Cesium.Viewer, points: TransectWaypoint[]): Promise<number[]> {
  const cartographics = points.map(([longitude, latitude]) => Cesium.Cartographic.fromDegrees(longitude, latitude))
  let sampled: number[] | undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    sampled = await Promise.race([
      Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics).then((items) => items.map((item) => (Number.isFinite(item.height) ? item.height : Number.NaN))),
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), SAMPLE_TIMEOUT_MS)
      })
    ])
  } catch {
    sampled = undefined
  } finally {
    clearTimeout(timeoutId)
  }
  return points.map((_, index) => {
    const fromSample = sampled?.[index]
    if (fromSample !== undefined && Number.isFinite(fromSample)) return fromSample
    const [longitude, latitude] = points[index]
    return viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(longitude, latitude)) ?? 0
  })
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
  const path = interpolateWaypoints(waypoints, samplesPerLeg(waypoints.length))
  const groundHeights = await sampleGroundHeights(viewer, path)
  const scene = viewer.scene
  const flightAltitudeM = Math.round(
    safeFlightAltitudeM(groundHeights, scene.verticalExaggeration, scene.verticalExaggerationRelativeHeight, FLIGHT_CLEARANCE_M, MIN_FLIGHT_ALTITUDE_M, requestedAltitude)
  )
  const entities = replaceOverlay(viewer, path, flightAltitudeM)
  const legDistances = transectLegsKm(waypoints)
  let completedLegs = 0
  for (let index = 1; index < waypoints.length; index += 1) {
    const [fromLon, fromLat] = waypoints[index - 1]
    const [toLon, toLat] = waypoints[index]
    const heading = bearingDeg(fromLon, fromLat, toLon, toLat)
    const duration = Math.min(MAX_LEG_DURATION_S, Math.max(MIN_LEG_DURATION_S, legDistances[index - 1] / LEG_DURATION_PER_KM))
    const finished = await flyLeg(viewer, toLon, toLat, heading, flightAltitudeM, duration)
    if (!finished) {
      return { status: 'interrupted', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs }
    }
    completedLegs += 1
  }
  return { status: 'ok', totalKm: Math.round(transectTotalKm(waypoints)), flightAltitudeM, legs: waypoints.length - 1, completedLegs }
}
