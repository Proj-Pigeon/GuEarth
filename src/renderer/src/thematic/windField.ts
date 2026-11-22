export interface WindVector {
  u: number
  v: number
}

export const WIND_RAMP_MAX_SPEED = 16
export const windRampStops = ['#69b1ff', '#36cfc9', '#95de64', '#fadb14', '#ff9c6e', '#ff7875']

export function summerFactor(month: number): number {
  const deviation = month - 7
  return Math.exp(-(deviation * deviation) / 10.58)
}

export function winterFactor(month: number): number {
  const wrapped = Math.abs(month - 1)
  const deviation = Math.min(wrapped, 12 - wrapped)
  return Math.exp(-(deviation * deviation) / 8.82)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function bump(
  lon: number,
  lat: number,
  lonCenter: number,
  latCenter: number,
  lonSpread: number,
  latSpread: number
): number {
  let lonDelta = lon - lonCenter
  lonDelta = ((lonDelta + 540) % 360) - 180
  const latDelta = lat - latCenter
  return Math.exp(
    -(lonDelta * lonDelta) / (2 * lonSpread * lonSpread) -
      (latDelta * latDelta) / (2 * latSpread * latSpread)
  )
}

interface MonsoonCell {
  lonCenter: number
  latCenter: number
  lonSpread: number
  latSpread: number
  speed: number
  dirU: number
  dirV: number
  season: 'summer' | 'winter'
}

const monsoonCells: MonsoonCell[] = [
  {
    lonCenter: 78,
    latCenter: 16,
    lonSpread: 24,
    latSpread: 11,
    speed: 10,
    dirU: 0.74,
    dirV: 0.67,
    season: 'summer'
  },
  {
    lonCenter: 90,
    latCenter: 14,
    lonSpread: 16,
    latSpread: 9,
    speed: 9,
    dirU: 0.71,
    dirV: 0.7,
    season: 'summer'
  },
  {
    lonCenter: 48,
    latCenter: 2,
    lonSpread: 10,
    latSpread: 9,
    speed: 12,
    dirU: 0.8,
    dirV: 0.6,
    season: 'summer'
  },
  {
    lonCenter: 116,
    latCenter: 26,
    lonSpread: 13,
    latSpread: 10,
    speed: 6.5,
    dirU: -0.5,
    dirV: 0.86,
    season: 'summer'
  },
  {
    lonCenter: 125,
    latCenter: 42,
    lonSpread: 12,
    latSpread: 9,
    speed: 6,
    dirU: 0.55,
    dirV: 0.84,
    season: 'summer'
  },
  {
    lonCenter: -2,
    latCenter: 12,
    lonSpread: 20,
    latSpread: 8,
    speed: 6,
    dirU: 0.6,
    dirV: 0.8,
    season: 'summer'
  },
  {
    lonCenter: 110,
    latCenter: 45,
    lonSpread: 18,
    latSpread: 12,
    speed: 9,
    dirU: 0.55,
    dirV: -0.84,
    season: 'winter'
  },
  {
    lonCenter: 95,
    latCenter: 20,
    lonSpread: 13,
    latSpread: 10,
    speed: 6.5,
    dirU: -0.77,
    dirV: -0.64,
    season: 'winter'
  },
  {
    lonCenter: 113,
    latCenter: 15,
    lonSpread: 8,
    latSpread: 7,
    speed: 7,
    dirU: 0.45,
    dirV: -0.89,
    season: 'winter'
  },
  {
    lonCenter: 135,
    latCenter: -15,
    lonSpread: 14,
    latSpread: 8,
    speed: 6.5,
    dirU: 0.6,
    dirV: -0.8,
    season: 'winter'
  }
]

function planetaryWind(lat: number): WindVector {
  const absLat = Math.abs(lat)
  const hemisphere = lat >= 0 ? 1 : -1
  const tradeBelt = smoothstep(30, 14, absLat)
  const tradeMeridional = smoothstep(3, 9, absLat)
  const westerlyBelt = smoothstep(26, 40, absLat) * smoothstep(70, 55, absLat)
  const polarEasterlies = smoothstep(60, 76, absLat)
  return {
    u: -3.2 * tradeBelt + westerlyBelt * (hemisphere > 0 ? 5 : 6.8) - 2.2 * polarEasterlies,
    v: -1.1 * hemisphere * tradeBelt * tradeMeridional
  }
}

export function sampleWind(lon: number, lat: number, month: number): WindVector {
  const base = planetaryWind(lat)
  const summer = summerFactor(month)
  const winter = winterFactor(month)
  let u = base.u
  let v = base.v
  for (const cell of monsoonCells) {
    const intensity = cell.season === 'summer' ? summer : winter
    if (intensity <= 0.02) continue
    const magnitude =
      bump(lon, lat, cell.lonCenter, cell.latCenter, cell.lonSpread, cell.latSpread) *
      cell.speed *
      intensity
    u += cell.dirU * magnitude
    v += cell.dirV * magnitude
  }
  return { u, v }
}
