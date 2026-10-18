import { computed, ref } from 'vue'

export interface CoastalZone {
  id: string
  name: string
  west: number
  south: number
  east: number
  north: number
  step: number
  center: [number, number, number]
  note: string
}

export const SEA_LEVEL_SCENARIOS = [0.5, 1, 2, 5] as const
export type SeaLevelScenario = (typeof SEA_LEVEL_SCENARIOS)[number]

export const SEA_COLOR = '#1677ff'

export const coastalZones: CoastalZone[] = [
  {
    id: 'bohai-ring',
    name: '环渤海沿海（天津—唐山—沧州）',
    west: 117.4,
    south: 38.3,
    east: 119.2,
    north: 39.4,
    step: 0.1,
    center: [118.3, 38.85, 420000],
    note: '渤海湾淤泥质海岸，地势极低平，天津大部分市区海拔不足 5 米，风暴潮与地面沉降叠加放大风险'
  },
  {
    id: 'yellow-river-delta',
    name: '黄河三角洲',
    west: 118.7,
    south: 37.2,
    east: 119.7,
    north: 38.1,
    step: 0.1,
    center: [119.2, 37.65, 280000],
    note: '黄河泥沙堆积的新生三角洲湿地，造陆与海侵并存，生态与油田设施集中'
  },
  {
    id: 'subei-coast',
    name: '苏北沿海低地',
    west: 119.4,
    south: 32.6,
    east: 120.9,
    north: 34.2,
    step: 0.1,
    center: [120.15, 33.4, 520000],
    note: '里下河洼地与滨海平原，排水不畅，历史上频受台风风暴潮与潮灾影响'
  },
  {
    id: 'yangtze-delta',
    name: '长江三角洲（含上海）',
    west: 119.9,
    south: 30.6,
    east: 121.9,
    north: 31.9,
    step: 0.1,
    center: [121.0, 31.25, 480000],
    note: '中国经济密度最高的三角洲，上海中心城区平均海拔仅约 4 米，且存在地面沉降'
  },
  {
    id: 'pearl-river-delta',
    name: '珠江三角洲',
    west: 112.7,
    south: 21.9,
    east: 114.5,
    north: 23.3,
    step: 0.1,
    center: [113.4, 22.7, 420000],
    note: '河网密布的三角洲城市群，广州、佛山、中山沿海低地广阔，咸潮上溯加剧'
  }
]

export const gridPointsOf = (zone: CoastalZone): Array<[number, number]> => {
  const points: Array<[number, number]> = []
  const columns = Math.max(1, Math.round((zone.east - zone.west) / zone.step))
  const rows = Math.max(1, Math.round((zone.north - zone.south) / zone.step))
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      points.push([
        Number((zone.west + (column + 0.5) * ((zone.east - zone.west) / columns)).toFixed(4)),
        Number((zone.south + (row + 0.5) * ((zone.north - zone.south) / rows)).toFixed(4))
      ])
    }
  }
  return points
}

export const totalGridCellCount = coastalZones.reduce((sum, zone) => {
  const columns = Math.max(1, Math.round((zone.east - zone.west) / zone.step))
  const rows = Math.max(1, Math.round((zone.north - zone.south) / zone.step))
  return sum + columns * rows
}, 0)

export interface LandMaskSource {
  polygons: number[][][][]
}

interface MaskedPolygon {
  outer: number[][]
  holes: number[][][]
  west: number
  east: number
  south: number
  north: number
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLon, currentLat] = ring[index]
    const [previousLon, previousLat] = ring[previous]
    if ((currentLat > lat) === (previousLat > lat)) continue
    const crossingLon = ((previousLon - currentLon) * (lat - currentLat)) / (previousLat - currentLat) + currentLon
    if (lon < crossingLon) inside = !inside
  }
  return inside
}

export function buildLandMask(provinces: LandMaskSource[]): (lon: number, lat: number) => boolean {
  const polygons: MaskedPolygon[] = []
  for (const province of provinces) {
    for (const rings of province.polygons) {
      const [outer, ...holes] = rings
      if (!outer || outer.length < 3) continue
      let west = Number.POSITIVE_INFINITY
      let east = Number.NEGATIVE_INFINITY
      let south = Number.POSITIVE_INFINITY
      let north = Number.NEGATIVE_INFINITY
      for (const [lon, lat] of outer) {
        if (lon < west) west = lon
        if (lon > east) east = lon
        if (lat < south) south = lat
        if (lat > north) north = lat
      }
      polygons.push({ outer, holes: holes.filter((hole) => hole.length >= 3), west, east, south, north })
    }
  }
  return (lon: number, lat: number): boolean => {
    for (const polygon of polygons) {
      if (lon < polygon.west || lon > polygon.east || lat < polygon.south || lat > polygon.north) continue
      if (pointInRing(lon, lat, polygon.outer) && !polygon.holes.some((hole) => pointInRing(lon, lat, hole))) return true
    }
    return false
  }
}

export const heightCache = new Map<string, number>()
export const sampleVersion = ref(0)

export const cacheKeyOf = (lon: number, lat: number): string => `${lon.toFixed(4)},${lat.toFixed(4)}`

export type LandMaskPredicate = (lon: number, lat: number) => boolean
export const landMask = ref<LandMaskPredicate | null>(null)

export function setLandMask(mask: LandMaskPredicate | null): void {
  landMask.value = mask
}

export type SeaSamplingStatus = 'idle' | 'sampling' | 'ready' | 'terrain-required'
export const seaSamplingStatus = ref<SeaSamplingStatus>('idle')

export const sampledCoverage = computed(() => {
  void sampleVersion.value
  let sampled = 0
  for (const zone of coastalZones) {
    for (const [lon, lat] of gridPointsOf(zone)) {
      if (heightCache.has(cacheKeyOf(lon, lat))) sampled += 1
    }
  }
  return sampled / totalGridCellCount
})

export const FALLBACK_LAND_HEIGHT = 0.05

export function isLandCell(lon: number, lat: number, height: number): boolean {
  const mask = landMask.value
  if (mask && mask(lon, lat)) return true
  return height > FALLBACK_LAND_HEIGHT
}

export function recordSamples(points: Array<[number, number]>, heights: Array<number>): void {
  points.forEach(([lon, lat], index) => {
    const height = heights[index]
    if (Number.isFinite(height)) heightCache.set(cacheKeyOf(lon, lat), height)
  })
  sampleVersion.value += 1
}

export function seaLevelGridPoints(): Array<[number, number]> {
  return coastalZones.flatMap((zone) => gridPointsOf(zone))
}

export function seedSampleHeights(heights: Array<number | null>): number {
  const points = seaLevelGridPoints()
  const seededPoints: Array<[number, number]> = []
  const seededHeights: Array<number> = []
  for (let index = 0; index < points.length && index < heights.length; index += 1) {
    const height = heights[index]
    if (typeof height !== 'number' || !Number.isFinite(height)) continue
    seededPoints.push(points[index])
    seededHeights.push(height)
  }
  if (seededPoints.length) recordSamples(seededPoints, seededHeights)
  return seededPoints.length
}

export function zoneOf(lon: number, lat: number): CoastalZone {
  return (
    coastalZones.find((zone) => lon >= zone.west && lon <= zone.east && lat >= zone.south && lat <= zone.north) ??
    coastalZones[coastalZones.length - 1]
  )
}

export function cellAreaKm2(zone: CoastalZone, lat: number): number {
  const widthKm = zone.step * 111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const heightKm = zone.step * 110.57
  return widthKm * heightKm
}

export const LAND_HEIGHT_EPSILON = -0.2

export function isInundated(height: number, rise: number): boolean {
  return height >= LAND_HEIGHT_EPSILON && height < rise
}

export interface ZoneInundation {
  zone: CoastalZone
  sampled: number
  floodedCells: number
  areaKm2: number
}

export function inundationByZone(rise: number): ZoneInundation[] {
  void sampleVersion.value
  const results: ZoneInundation[] = []
  for (const zone of coastalZones) {
    let sampled = 0
    let floodedCells = 0
    let areaKm2 = 0
    for (const [lon, lat] of gridPointsOf(zone)) {
      const height = heightCache.get(cacheKeyOf(lon, lat))
      if (height === undefined) continue
      sampled += 1
      if (!isLandCell(lon, lat, height)) continue
      if (isInundated(height, rise)) {
        floodedCells += 1
        areaKm2 += cellAreaKm2(zone, lat)
      }
    }
    results.push({ zone, sampled, floodedCells, areaKm2: Math.round(areaKm2) })
  }
  return results
}

export function totalInundatedAreaKm2(rise: number): number {
  return inundationByZone(rise).reduce((sum, item) => sum + item.areaKm2, 0)
}

export const seaLevelFacts = [
  '海平面上升的主因是冰川融水与海水热膨胀，源头是全球变暖——能源消费排放的温室气体是关键驱动',
  '1980-2023 年中国沿海海平面上升速率约 3.9 毫米/年，高于同期全球平均水平',
  '海平面上升的叠加效应：风暴潮加剧、咸潮上溯、海岸侵蚀与低地农田盐渍化',
  '三角洲大城市还需面对地面沉降，相对海平面上升更快（天津、上海曾明显沉降，现已管控）',
  '应对之策分为减缓（减排温室气体）与适应（海堤、生态海岸、退田还湿、规划避让）'
]

export function scenarioSummary(rise: number): string {
  return `海平面上升 ${rise} 米情景：格网中地面高程低于 ${rise} 米的沿海陆地将被淹没着色。海平面上升由全球变暖（冰川消融与海水热膨胀）驱动，将加剧风暴潮、咸潮与海岸侵蚀，威胁沿海低地的人口、耕地与产业。`
}
