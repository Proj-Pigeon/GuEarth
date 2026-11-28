export interface CoriolisDemo {
  id: 'north' | 'south'
  label: string
  start: [number, number]
  inertial: [number, number][]
  deflected: [number, number][]
}

const DEG = Math.PI / 180
const EARTH_RADIUS_KM = 6371
const EARTH_ANGULAR_VELOCITY = 7.292e-5
const DEMO_SPEED_KM_PER_HOUR = 800
const DEMO_HOURS = 3

function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceKm: number
): [number, number] {
  const angular = distanceKm / EARTH_RADIUS_KM
  const bearing = bearingDeg * DEG
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const sinLat =
    Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing)
  const clamped = Math.min(1, Math.max(-1, sinLat))
  const nextLat = Math.asin(clamped)
  const nextLon =
    lon +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
      Math.cos(angular) - Math.sin(lat) * clamped
    )
  return [((nextLon / DEG + 540) % 360) - 180, nextLat / DEG]
}

function integrateTrack(
  start: [number, number],
  bearingDeg: number,
  coriolis: boolean
): [number, number][] {
  const stepSeconds = 120
  const steps = Math.round((DEMO_HOURS * 3600) / stepSeconds)
  let lat = start[1]
  let lon = start[0]
  let bearing = bearingDeg
  const points: [number, number][] = [[lon, lat]]
  for (let step = 0; step < steps; step += 1) {
    const distance = (DEMO_SPEED_KM_PER_HOUR * stepSeconds) / 3600
    const [nextLon, nextLat] = destinationPoint(lat, lon, bearing, distance)
    lon = nextLon
    lat = nextLat
    if (coriolis) {
      const coriolisParameter = 2 * EARTH_ANGULAR_VELOCITY * Math.sin(lat * DEG)
      bearing += (coriolisParameter * stepSeconds) / DEG
    }
    points.push([lon, lat])
  }
  return points
}

export const coriolisDemos: CoriolisDemo[] = [
  {
    id: 'north',
    label: '北半球 · 沿经线南移',
    start: [100, 45],
    inertial: integrateTrack([100, 45], 180, false),
    deflected: integrateTrack([100, 45], 180, true)
  },
  {
    id: 'south',
    label: '南半球 · 沿经线南移',
    start: [100, -45],
    inertial: integrateTrack([100, -45], 180, false),
    deflected: integrateTrack([100, -45], 180, true)
  }
]

export function sampleTrack(points: [number, number][], fraction: number): [number, number] {
  if (points.length === 0) {
    return [0, 0]
  }
  const scaled = Math.min(1, Math.max(0, fraction)) * (points.length - 1)
  const index = Math.floor(scaled)
  const ratio = scaled - index
  const from = points[index]
  const to = points[Math.min(index + 1, points.length - 1)]
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
}
