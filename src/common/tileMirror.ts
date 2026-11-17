export type MirrorTileKind = 'vector' | 'satellite' | 'night'

export const EDGEONE_MIRROR_BASE_URL = 'https://earth.proxy.nexaorion.cn'
export const EDGEONE_ARCGIS_TERRAIN_URL = `${EDGEONE_MIRROR_BASE_URL}/arcgis`
export const EDGEONE_EARTHQUAKES_URL = `${EDGEONE_MIRROR_BASE_URL}/datasets/earthquakes`
export const EDGEONE_MODELS_DEV_URL = `${EDGEONE_MIRROR_BASE_URL}/modelsdev`

export const mirrorEligibleProviders: Record<string, MirrorTileKind> = {
  osm: 'vector',
  'esri-imagery': 'satellite',
  opentopomap: 'vector',
  'viirs-night': 'night'
}

const mirrorMaxZoomByProvider: Record<string, number> = {
  osm: 19,
  'esri-imagery': 23,
  opentopomap: 17,
  'viirs-night': 8
}

const mainlandChinaTimeZones = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'PRC'
])

const mirrorSatelliteDetailBounds = { west: 73.5, east: 135, south: 18, north: 53.6 }

export function isMirrorSatelliteProvider(providerId: string): boolean {
  return mirrorEligibleProviders[providerId] === 'satellite'
}

export function withinMirrorSatelliteDetail(longitude: number, latitude: number): boolean {
  return longitude >= mirrorSatelliteDetailBounds.west && longitude <= mirrorSatelliteDetailBounds.east
    && latitude >= mirrorSatelliteDetailBounds.south && latitude <= mirrorSatelliteDetailBounds.north
}

export function isValidTileCoordinate(level: number, x: number, y: number, maxLevel: number): boolean {
  if (!Number.isInteger(level) || !Number.isInteger(x) || !Number.isInteger(y)) return false
  if (level < 0 || level > maxLevel || x < 0 || y < 0) return false
  const span = 2 ** level
  return x < span && y < span
}

export function edgeOneTileMirrorUrl(
  providerId: string,
  level: number,
  x: number,
  y: number,
  granuleDate?: string
): string | undefined {
  const maxLevel = mirrorMaxZoomByProvider[providerId]
  if (maxLevel === undefined || !isValidTileCoordinate(level, x, y, maxLevel)) return undefined
  if (providerId === 'osm') return `${EDGEONE_MIRROR_BASE_URL}/tiles/osm/${level}/${x}/${y}.png`
  if (providerId === 'esri-imagery') return `${EDGEONE_MIRROR_BASE_URL}/tiles/esri/${level}/${y}/${x}`
  if (providerId === 'opentopomap') return `${EDGEONE_MIRROR_BASE_URL}/tiles/opentopo/${level}/${x}/${y}.png`
  if (providerId === 'viirs-night') {
    if (typeof granuleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(granuleDate)) return undefined
    return `${EDGEONE_MIRROR_BASE_URL}/tiles/viirs/${granuleDate}/${level}/${y}/${x}.jpeg`
  }
  return undefined
}

export function isLikelyMainlandChinaEnv(locale?: string, timeZone?: string): boolean {
  const normalizedLocale = typeof locale === 'string' ? locale.trim().toLowerCase().replaceAll('_', '-') : ''
  if (
    normalizedLocale === 'zh-cn'
    || normalizedLocale.startsWith('zh-cn-')
    || normalizedLocale === 'zh-hans'
    || normalizedLocale.startsWith('zh-hans-cn')
  ) {
    return true
  }
  const normalizedZone = typeof timeZone === 'string' ? timeZone.trim() : ''
  return mainlandChinaTimeZones.has(normalizedZone)
}

export type TileMirrorMode = 'auto' | 'on' | 'off'

export type TileSource = 'mirror' | 'origin'

export type OriginReachability = 'unknown' | 'reachable' | 'blocked'

export const tileMirrorModes: readonly TileMirrorMode[] = ['auto', 'on', 'off']

export const ORIGIN_FAILURES_BEFORE_MIRROR = 2

const MIRROR_CACHE_STYLE_SUFFIX = '-mirror'

export function isTileMirrorMode(value: unknown): value is TileMirrorMode {
  return value === 'auto' || value === 'on' || value === 'off'
}

export function normalizeTileMirrorMode(value: unknown, legacyEnabled?: unknown): TileMirrorMode {
  if (isTileMirrorMode(value)) return value
  return legacyEnabled === true ? 'on' : 'auto'
}

export function resolveStoredTileMirrorSettings(
  value: unknown,
  legacyEnabled: unknown,
  consentPrompted: unknown
): { tileMirrorMode: TileMirrorMode; mirrorConsentPrompted: boolean } {
  if (consentPrompted !== true) {
    return { tileMirrorMode: 'off', mirrorConsentPrompted: false }
  }
  const normalized = normalizeTileMirrorMode(value, legacyEnabled)
  return {
    tileMirrorMode: normalized === 'on' ? 'on' : 'off',
    mirrorConsentPrompted: true
  }
}

export function hasLegacyTileMirrorSetting(value: unknown, legacyEnabled: unknown): boolean {
  return !isTileMirrorMode(value) && typeof legacyEnabled === 'boolean'
}

export function mirrorCacheStyleId(styleId: string): string {
  return `${styleId}${MIRROR_CACHE_STYLE_SUFFIX}`
}

export function originProbeReachable(status: number): boolean {
  return status !== 403 && status !== 451
}

export class TileMirrorRouter {
  private mode: TileMirrorMode = 'off'
  private readonly reachability = new Map<string, OriginReachability>()
  private readonly originFailures = new Map<string, number>()
  private readonly originFallbacks = new Set<string>()

  setMode(mode: TileMirrorMode): void {
    this.mode = mode
    this.originFailures.clear()
    this.originFallbacks.clear()
  }

  sourceFor(providerId: string): TileSource {
    if (this.mode === 'off') return 'origin'
    if (this.mode === 'on') return this.originFallbacks.has(providerId) ? 'origin' : 'mirror'
    return this.reachability.get(providerId) === 'blocked' ? 'mirror' : 'origin'
  }

  mirroredProviders(providerIds: readonly string[]): string[] {
    return providerIds.filter((providerId) => this.sourceFor(providerId) === 'mirror')
  }

  reachabilityFor(providerId: string): OriginReachability {
    return this.reachability.get(providerId) ?? 'unknown'
  }

  noteOriginSuccess(providerId: string): boolean {
    this.originFailures.set(providerId, 0)
    if (this.mode !== 'auto') return false
    if (this.reachability.get(providerId) !== 'blocked') return false
    this.reachability.set(providerId, 'reachable')
    return true
  }

  noteOriginFailure(providerId: string): boolean {
    const failures = (this.originFailures.get(providerId) ?? 0) + 1
    this.originFailures.set(providerId, failures)
    if (this.mode !== 'auto') return false
    if (failures < ORIGIN_FAILURES_BEFORE_MIRROR) return false
    if (this.reachability.get(providerId) === 'blocked') return false
    this.reachability.set(providerId, 'blocked')
    return true
  }

  noteProbeResult(providerId: string, reachable: boolean): boolean {
    this.originFailures.set(providerId, 0)
    const next: OriginReachability = reachable ? 'reachable' : 'blocked'
    const previous = this.reachability.get(providerId) ?? 'unknown'
    this.reachability.set(providerId, next)
    if (this.mode !== 'auto') return false
    return previous !== next
  }

  noteMirrorFailure(providerId: string): boolean {
    if (this.mode === 'on') {
      if (this.originFallbacks.has(providerId)) return false
      this.originFallbacks.add(providerId)
      return true
    }
    if (this.mode !== 'auto') return false
    if (this.reachability.get(providerId) !== 'blocked') return false
    this.originFailures.set(providerId, 0)
    this.reachability.set(providerId, 'reachable')
    return true
  }
}
