export const EARTH_RADIUS_KM = 6371

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function greatCircleKm(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const dLat = lat2 - lat1
  const dLon = toRadians(toLon - fromLon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const dLon = toRadians(toLon - fromLon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export type TransectWaypoint = [number, number]

export function interpolateWaypoints(waypoints: TransectWaypoint[], samplesPerLeg: number): TransectWaypoint[] {
  const perLeg = Math.max(1, Math.floor(samplesPerLeg))
  const points: TransectWaypoint[] = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const [x0, y0] = waypoints[index]
    const [x1, y1] = waypoints[index + 1]
    for (let step = 0; step < perLeg; step += 1) {
      points.push([x0 + ((x1 - x0) * step) / perLeg, y0 + ((y1 - y0) * step) / perLeg])
    }
  }
  points.push(waypoints[waypoints.length - 1])
  return points
}

export function transectLegsKm(points: TransectWaypoint[]): number[] {
  const legs: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const [lon0, lat0] = points[index - 1]
    const [lon1, lat1] = points[index]
    legs.push(greatCircleKm(lon0, lat0, lon1, lat1))
  }
  return legs
}

export function transectTotalKm(points: TransectWaypoint[]): number {
  return transectLegsKm(points).reduce((sum, leg) => sum + leg, 0)
}

export function exaggeratedSurfaceHeightM(groundM: number, verticalExaggeration: number, relativeHeightM: number): number {
  return (groundM - relativeHeightM) * verticalExaggeration + relativeHeightM
}

export function safeFlightAltitudeM(
  groundHeightsM: number[],
  verticalExaggeration: number,
  relativeHeightM: number,
  clearanceM: number,
  minimumM: number,
  requestedM?: number
): number {
  const maxSurface = groundHeightsM.reduce((max, ground) => Math.max(max, exaggeratedSurfaceHeightM(ground, verticalExaggeration, relativeHeightM)), 0)
  const safe = maxSurface + clearanceM
  const floor = Math.max(minimumM, safe)
  if (requestedM === undefined) return floor
  return Math.max(floor, requestedM)
}

export function transectHops(sampleCount: number, maxHops: number): number[] {
  if (sampleCount <= 0) return []
  const stride = Math.max(1, Math.ceil(sampleCount / Math.max(1, maxHops)))
  const hops: number[] = []
  for (let index = sampleCount - 1; index >= 0; index -= stride) hops.push(index)
  if (hops[hops.length - 1] !== 0) hops.push(0)
  return hops
}

export function planTransectAltitudes(surfaceHeightsM: number[], clearanceM: number, minimumM: number, requestedM?: number): number[] {
  if (surfaceHeightsM.length === 0) return []
  const floorAt = (surfaceM: number): number => {
    const floor = Math.max(surfaceM + clearanceM, minimumM)
    return requestedM === undefined ? floor : Math.max(floor, requestedM)
  }
  const localMax = surfaceHeightsM.map((surface, index) => {
    let max = surface
    if (index > 0) max = Math.max(max, surfaceHeightsM[index - 1])
    if (index < surfaceHeightsM.length - 1) max = Math.max(max, surfaceHeightsM[index + 1])
    return max
  })
  const planned = localMax.map((surface) => floorAt(surface))
  const smoothed = planned.map((altitude, index) => {
    let sum = altitude
    let count = 1
    if (index > 0) {
      sum += planned[index - 1]
      count += 1
    }
    if (index < planned.length - 1) {
      sum += planned[index + 1]
      count += 1
    }
    return sum / count
  })
  return smoothed.map((altitude, index) => Math.max(altitude, floorAt(surfaceHeightsM[index])))
}
