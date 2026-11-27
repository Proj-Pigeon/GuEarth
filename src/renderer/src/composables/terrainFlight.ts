import { Cartesian3, Cartographic, EllipsoidTerrainProvider, sampleTerrainMostDetailed } from 'cesium';
import type { Scene } from 'cesium';
import {
  conservativeFlightHeightM,
  destinationAt,
  FLIGHT_ARRIVAL_PITCH_RAD,
  FLIGHT_DEFAULT_FOVY_RAD,
  flightReliefOffsets,
  flightSampleCeilingM,
  planFlightCameraHeight
} from '../lib/flightFraming.ts'

const FLIGHT_TERRAIN_TIMEOUT_MS = 4000

export interface FlightDestinationRequest {
  isCancelled?: () => boolean
}

function exaggerationOf(scene: Scene): { exaggeration: number; relativeHeight: number } {
  const exaggeration = Number.isFinite(scene.verticalExaggeration) && scene.verticalExaggeration > 0 ? scene.verticalExaggeration : 1
  const relativeHeight = Number.isFinite(scene.verticalExaggerationRelativeHeight) ? scene.verticalExaggerationRelativeHeight : 0
  return { exaggeration, relativeHeight }
}

function arrivalFovY(scene: Scene): number {
  const frustum = scene.camera?.frustum as { fovy?: unknown } | undefined
  const fovy = frustum?.fovy
  if (typeof fovy === 'number' && Number.isFinite(fovy) && fovy > 0.2 && fovy < Math.PI - 0.2) {return fovy}
  return FLIGHT_DEFAULT_FOVY_RAD
}

export async function resolveFlightDestination(scene: Scene, longitude: number, latitude: number, height: number, request?: FlightDestinationRequest): Promise<Cartesian3 | undefined> {
  if (request?.isCancelled?.()) {return undefined}
  const { exaggeration, relativeHeight } = exaggerationOf(scene)
  const fovY = arrivalFovY(scene)
  const pitch = FLIGHT_ARRIVAL_PITCH_RAD
  const deliver = (altitude: number): Cartesian3 | undefined => {
    if (request?.isCancelled?.()) {return undefined}
    return Cartesian3.fromDegrees(longitude, latitude, altitude)
  }
  if (scene.terrainProvider instanceof EllipsoidTerrainProvider) {
    return deliver(planFlightCameraHeight({
      requestedHeightM: height,
      centerGroundM: 0,
      relief: [],
      verticalExaggeration: exaggeration,
      relativeHeightM: relativeHeight,
      pitchRadians: pitch,
      fovYRadians: fovY
    }))
  }
  if (height >= flightSampleCeilingM(exaggeration, relativeHeight)) {return deliver(height)}
  const offsets = flightReliefOffsets()
  const positions = [Cartographic.fromDegrees(longitude, latitude)]
  for (const offset of offsets) {
    const point = destinationAt(longitude, latitude, offset.distanceM, offset.bearingRad)
    positions.push(Cartographic.fromDegrees(point.longitude, point.latitude))
  }
  for (const position of positions) {position.height = Number.NaN}
  let clearTerrainTimeout: (() => void) | undefined
  try {
    const sampled = await Promise.race([
      sampleTerrainMostDetailed(scene.terrainProvider, positions, false),
      new Promise<undefined>((resolve) => {
        // oxlint-disable-next-line unicorn/no-useless-undefined -- `resolve` of a `Promise<undefined>` requires its argument
        const timer = setTimeout(() => resolve(undefined), FLIGHT_TERRAIN_TIMEOUT_MS)
        clearTerrainTimeout = () => clearTimeout(timer)
      })
    ])
    if (request?.isCancelled?.()) {return undefined}
    const centerGround = sampled?.[0]?.height
    if (centerGround === undefined || !Number.isFinite(centerGround)) {return deliver(conservativeFlightHeightM(height, exaggeration, relativeHeight))}
    return deliver(planFlightCameraHeight({
      requestedHeightM: height,
      centerGroundM: centerGround,
      relief: offsets.map((offset, index) => ({ distanceM: offset.distanceM, groundM: sampled?.[index + 1]?.height ?? Number.NaN })),
      verticalExaggeration: exaggeration,
      relativeHeightM: relativeHeight,
      pitchRadians: pitch,
      fovYRadians: fovY
    }))
  } catch {
    if (request?.isCancelled?.()) {return undefined}
    return deliver(conservativeFlightHeightM(height, exaggeration, relativeHeight))
  } finally {
    clearTerrainTimeout?.()
  }
}
