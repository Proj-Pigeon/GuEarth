const MIN_TERRAIN_CLEARANCE_M = 1000
const UNKNOWN_TERRAIN_GROUND_M = 9000
const RELIEF_RING_RADII_M = [800, 2400, 7200]
const RELIEF_BEARING_COUNT = 8
const GENTLE_SLOPE_RAD = (6 * Math.PI) / 180
const STEEP_SLOPE_RAD = (26 * Math.PI) / 180
const FRAME_WIDTH_FACTOR = 2.5
const MAX_RELIEF_FRAMING_CLEARANCE_M = 12000
const DEFAULT_FOVY_RAD = Math.PI / 3
const EARTH_RADIUS_M = 6378137

export const FLIGHT_ARRIVAL_PITCH_RAD = -Math.PI / 2
export const FLIGHT_DEFAULT_FOVY_RAD = DEFAULT_FOVY_RAD

export interface ReliefSample {
  distanceM: number
  groundM: number
}

export interface FlightFramingInput {
  requestedHeightM: number
  centerGroundM: number
  relief: readonly ReliefSample[]
  verticalExaggeration: number
  relativeHeightM: number
  pitchRadians: number
  fovYRadians: number
}

export interface FlightArrivalInput {
  requestSequence: number
  activeSequence: number
  viewerAlive: boolean
  userSteered: boolean
}

export function exaggeratedFlightGroundM(groundM: number, verticalExaggeration: number, relativeHeightM: number): number {
  const exaggeration = Number.isFinite(verticalExaggeration) && verticalExaggeration > 0 ? verticalExaggeration : 1
  const relative = Number.isFinite(relativeHeightM) ? relativeHeightM : 0
  return (groundM - relative) * exaggeration + relative
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const span = edge1 - edge0
  const t = clampUnit(span === 0 ? 1 : (value - edge0) / span)
  return t * t * (3 - 2 * t)
}

function usableFovY(fovYRadians: number): number {
  if (Number.isFinite(fovYRadians) && fovYRadians > 0.2 && fovYRadians < Math.PI - 0.2) return fovYRadians
  return DEFAULT_FOVY_RAD
}

function depressionRadians(pitchRadians: number): number {
  const pitch = Number.isFinite(pitchRadians) ? Math.abs(pitchRadians) : Math.abs(FLIGHT_ARRIVAL_PITCH_RAD)
  return Math.min(Math.PI / 2, Math.max(0.2, pitch))
}

export function flightReliefOffsets(): Array<{ distanceM: number; bearingRad: number }> {
  const offsets: Array<{ distanceM: number; bearingRad: number }> = []
  for (const distanceM of RELIEF_RING_RADII_M) {
    for (let index = 0; index < RELIEF_BEARING_COUNT; index += 1) {
      offsets.push({ distanceM, bearingRad: (2 * Math.PI * index) / RELIEF_BEARING_COUNT })
    }
  }
  return offsets
}

export function destinationAt(longitudeDeg: number, latitudeDeg: number, distanceM: number, bearingRad: number): { longitude: number; latitude: number } {
  const lat1 = (latitudeDeg * Math.PI) / 180
  const lon1 = (longitudeDeg * Math.PI) / 180
  const angular = distanceM / EARTH_RADIUS_M
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad))
  const lon2 = lon1 + Math.atan2(Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  const longitude = ((((lon2 * 180) / Math.PI + 180) % 360) + 360) % 360 - 180
  return { longitude, latitude: (lat2 * 180) / Math.PI }
}

export function planFlightCameraHeight(input: FlightFramingInput): number {
  const center = exaggeratedFlightGroundM(input.centerGroundM, input.verticalExaggeration, input.relativeHeightM)
  let maxSurface = center
  let cameraHeight = center + MIN_TERRAIN_CLEARANCE_M
  const tanHalf = Math.tan(usableFovY(input.fovYRadians) / 2)
  const pitchScale = 1 / Math.sin(depressionRadians(input.pitchRadians))
  for (const sample of input.relief) {
    if (!Number.isFinite(sample.groundM) || !Number.isFinite(sample.distanceM) || sample.distanceM <= 0) continue
    const surface = exaggeratedFlightGroundM(sample.groundM, input.verticalExaggeration, input.relativeHeightM)
    maxSurface = Math.max(maxSurface, surface)
    const rise = Math.abs(surface - center)
    const slope = Math.atan(rise / sample.distanceM)
    const weight = smoothstep(GENTLE_SLOPE_RAD, STEEP_SLOPE_RAD, slope)
    const viewRadius = sample.distanceM * FRAME_WIDTH_FACTOR
    const contextClearance = Math.min(MAX_RELIEF_FRAMING_CLEARANCE_M, (viewRadius / tanHalf) * pitchScale)
    const highPoint = Math.max(center, surface)
    const framedClearance = MIN_TERRAIN_CLEARANCE_M + weight * (contextClearance - MIN_TERRAIN_CLEARANCE_M)
    cameraHeight = Math.max(cameraHeight, highPoint + framedClearance)
    const uphill = surface - center
    if (uphill > 0 && slope >= GENTLE_SLOPE_RAD) {
      const unseen = Math.max(0, viewRadius - sample.distanceM)
      const continuedClearance = Math.min(MAX_RELIEF_FRAMING_CLEARANCE_M, unseen * (uphill / sample.distanceM) + MIN_TERRAIN_CLEARANCE_M)
      cameraHeight = Math.max(cameraHeight, surface + continuedClearance)
    }
  }
  return Math.max(input.requestedHeightM, cameraHeight, maxSurface + MIN_TERRAIN_CLEARANCE_M)
}

export function conservativeFlightHeightM(requestedHeightM: number, verticalExaggeration: number, relativeHeightM: number): number {
  return Math.max(requestedHeightM, exaggeratedFlightGroundM(UNKNOWN_TERRAIN_GROUND_M, verticalExaggeration, relativeHeightM) + MIN_TERRAIN_CLEARANCE_M)
}

export function flightSampleCeilingM(verticalExaggeration: number, relativeHeightM: number): number {
  return exaggeratedFlightGroundM(UNKNOWN_TERRAIN_GROUND_M, verticalExaggeration, relativeHeightM) + MAX_RELIEF_FRAMING_CLEARANCE_M
}

export function flightArrivalAllowed(input: FlightArrivalInput): boolean {
  return input.viewerAlive && !input.userSteered && input.requestSequence === input.activeSequence
}
