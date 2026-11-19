export type MirrorTileKind = 'vector' | 'satellite' | 'night'

export type MirrorEndpointId = 'edgeone' | 'cloudflare'

export type MirrorEndpointPreference = 'auto' | MirrorEndpointId

export interface MirrorEndpointMeta {
  id: MirrorEndpointId
  label: string
  shortLabel: string
  baseUrl: string
}

export interface MirrorEndpointProbeResult {
  endpoint: MirrorEndpointId
  ok: boolean
  latencyMs: number | null
  error?: string
  checkedAt?: number
}

export const DEFAULT_MIRROR_ENDPOINT: MirrorEndpointId = 'edgeone'

export const mirrorEndpointIds: readonly MirrorEndpointId[] = ['edgeone', 'cloudflare']

export const mirrorEndpointPreferences: readonly MirrorEndpointPreference[] = ['auto', 'edgeone', 'cloudflare']

export const EDGEONE_MIRROR_BASE_URL = 'https://proxy.project-pigeon.com'
export const CLOUDFLARE_MIRROR_BASE_URL = 'https://cf.proxy.project-pigeon.com'

export const mirrorEndpoints: Record<MirrorEndpointId, MirrorEndpointMeta> = {
  edgeone: {
    id: 'edgeone',
    label: 'EdgeOne（奈索星联）',
    shortLabel: 'EdgeOne',
    baseUrl: EDGEONE_MIRROR_BASE_URL
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare',
    shortLabel: 'Cloudflare',
    baseUrl: CLOUDFLARE_MIRROR_BASE_URL
  }
}

export const MIRROR_ENDPOINT_PROBE_TIMEOUT_MS = 5_000

export function isMirrorEndpointId(value: unknown): value is MirrorEndpointId {
  return value === 'edgeone' || value === 'cloudflare'
}

export function isMirrorEndpointPreference(value: unknown): value is MirrorEndpointPreference {
  return value === 'auto' || isMirrorEndpointId(value)
}

export function normalizeMirrorEndpointPreference(value: unknown): MirrorEndpointPreference {
  return isMirrorEndpointPreference(value) ? value : 'auto'
}

export function mirrorBaseUrl(endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT): string {
  return mirrorEndpoints[endpoint].baseUrl
}

export function mirrorEndpointLabel(endpoint: MirrorEndpointId): string {
  return mirrorEndpoints[endpoint].label
}

export function mirrorEndpointShortLabel(endpoint: MirrorEndpointId): string {
  return mirrorEndpoints[endpoint].shortLabel
}

export function mirrorArcGisTerrainUrl(endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT): string {
  return `${mirrorBaseUrl(endpoint)}/arcgis`
}

export function mirrorEarthquakesUrl(endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT): string {
  return `${mirrorBaseUrl(endpoint)}/datasets/earthquakes`
}

export function mirrorModelsDevUrl(endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT): string {
  return `${mirrorBaseUrl(endpoint)}/modelsdev`
}

export function mirrorProbeUrl(endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT): string {
  return `${mirrorBaseUrl(endpoint)}/tiles/esri/1/0/0`
}

export function alternateMirrorEndpoint(endpoint: MirrorEndpointId): MirrorEndpointId {
  return endpoint === 'edgeone' ? 'cloudflare' : 'edgeone'
}

export function selectBestMirrorEndpoint(
  probes: readonly MirrorEndpointProbeResult[],
  fallback: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT
): MirrorEndpointId {
  const reachable = probes
    .filter((probe) => probe.ok && typeof probe.latencyMs === 'number' && Number.isFinite(probe.latencyMs))
    .sort((a, b) => {
      const diff = (a.latencyMs as number) - (b.latencyMs as number)
      if (diff !== 0) return diff
      return mirrorEndpointIds.indexOf(a.endpoint) - mirrorEndpointIds.indexOf(b.endpoint)
    })
  return reachable[0]?.endpoint ?? fallback
}

export const EDGEONE_ARCGIS_TERRAIN_URL = mirrorArcGisTerrainUrl('edgeone')
export const EDGEONE_EARTHQUAKES_URL = mirrorEarthquakesUrl('edgeone')
export const EDGEONE_MODELS_DEV_URL = mirrorModelsDevUrl('edgeone')

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

export function mirrorTileUrl(
  providerId: string,
  level: number,
  x: number,
  y: number,
  granuleDate?: string,
  endpoint: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT
): string | undefined {
  const maxLevel = mirrorMaxZoomByProvider[providerId]
  if (maxLevel === undefined || !isValidTileCoordinate(level, x, y, maxLevel)) return undefined
  const baseUrl = mirrorBaseUrl(endpoint)
  if (providerId === 'osm') return `${baseUrl}/tiles/osm/${level}/${x}/${y}.png`
  if (providerId === 'esri-imagery') return `${baseUrl}/tiles/esri/${level}/${y}/${x}`
  if (providerId === 'opentopomap') return `${baseUrl}/tiles/opentopo/${level}/${x}/${y}.png`
  if (providerId === 'viirs-night') {
    if (typeof granuleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(granuleDate)) return undefined
    return `${baseUrl}/tiles/viirs/${granuleDate}/${level}/${y}/${x}.jpeg`
  }
  return undefined
}

export function edgeOneTileMirrorUrl(
  providerId: string,
  level: number,
  x: number,
  y: number,
  granuleDate?: string
): string | undefined {
  return mirrorTileUrl(providerId, level, x, y, granuleDate, 'edgeone')
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

export const MIRROR_FAILURES_BEFORE_FALLBACK = 4

export const MIRROR_FALLBACK_COOLDOWN_MS = 60_000

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

export function isMirrorCoverageNotFound(status: number, headers: Pick<Headers, 'get'>): boolean {
  if (status !== 404) return false
  if (headers.get('x-proxy-upstream')) return true
  const contentType = headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('application/json')
}

export class TileMirrorRouter {
  private mode: TileMirrorMode = 'off'
  private modeGeneration = 0
  private readonly reachability = new Map<string, OriginReachability>()
  private readonly originFailures = new Map<string, number>()
  private readonly mirrorFailures = new Map<string, number>()
  private readonly mirrorFallbackUntil = new Map<string, number>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private isMirrorFallbackActive(providerId: string): boolean {
    const until = this.mirrorFallbackUntil.get(providerId)
    if (until === undefined) return false
    if (this.now() >= until) {
      this.mirrorFallbackUntil.delete(providerId)
      this.mirrorFailures.delete(providerId)
      return false
    }
    return true
  }

  setMode(mode: TileMirrorMode): void {
    this.mode = mode
    this.modeGeneration += 1
    this.originFailures.clear()
    this.mirrorFailures.clear()
    this.mirrorFallbackUntil.clear()
  }

  currentModeGeneration(): number {
    return this.modeGeneration
  }

  sourceFor(providerId: string): TileSource {
    if (this.mode === 'off') return 'origin'
    if (this.mode === 'on') return this.isMirrorFallbackActive(providerId) ? 'origin' : 'mirror'
    return this.reachability.get(providerId) === 'blocked' ? 'mirror' : 'origin'
  }

  mirroredProviders(providerIds: readonly string[]): string[] {
    return providerIds.filter((providerId) => this.sourceFor(providerId) === 'mirror')
  }

  fallenBackProviders(providerIds: readonly string[]): string[] {
    if (this.mode !== 'on') return []
    return providerIds.filter((providerId) => this.isMirrorFallbackActive(providerId))
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
    this.mirrorFailures.set(providerId, 0)
    return true
  }

  noteProbeResult(providerId: string, reachable: boolean): boolean {
    this.originFailures.set(providerId, 0)
    this.mirrorFailures.set(providerId, 0)
    const next: OriginReachability = reachable ? 'reachable' : 'blocked'
    const previous = this.reachability.get(providerId) ?? 'unknown'
    this.reachability.set(providerId, next)
    if (this.mode !== 'auto') return false
    return previous !== next
  }

  nextMirrorFallbackExpiryAt(): number | null {
    if (this.mode !== 'on') return null
    let earliest: number | null = null
    const current = this.now()
    for (const [providerId, until] of [...this.mirrorFallbackUntil.entries()]) {
      if (current >= until) {
        this.mirrorFallbackUntil.delete(providerId)
        continue
      }
      if (earliest === null || until < earliest) earliest = until
    }
    return earliest
  }

  noteMirrorSuccess(providerId: string, expectedGeneration?: number): void {
    if (expectedGeneration !== undefined && expectedGeneration !== this.modeGeneration) return
    this.mirrorFailures.set(providerId, 0)
    this.mirrorFallbackUntil.delete(providerId)
  }

  recordMirrorFailure(providerId: string, expectedGeneration?: number): boolean {
    if (expectedGeneration !== undefined && expectedGeneration !== this.modeGeneration) return false
    if (this.mode === 'on') {
      if (this.isMirrorFallbackActive(providerId)) return false
    } else if (this.mode === 'auto') {
      if (this.reachability.get(providerId) !== 'blocked') return false
    } else {
      return false
    }
    const failures = (this.mirrorFailures.get(providerId) ?? 0) + 1
    this.mirrorFailures.set(providerId, failures)
    if (failures < MIRROR_FAILURES_BEFORE_FALLBACK) return false
    this.mirrorFailures.set(providerId, 0)
    return true
  }

  commitMirrorFallback(providerId: string, expectedGeneration?: number): boolean {
    if (expectedGeneration !== undefined && expectedGeneration !== this.modeGeneration) return false
    if (this.mode === 'on') {
      if (this.isMirrorFallbackActive(providerId)) return false
      this.mirrorFailures.set(providerId, 0)
      this.mirrorFallbackUntil.set(providerId, this.now() + MIRROR_FALLBACK_COOLDOWN_MS)
      return true
    }
    if (this.mode !== 'auto') return false
    if (this.reachability.get(providerId) !== 'blocked') return false
    this.mirrorFailures.set(providerId, 0)
    this.originFailures.set(providerId, 0)
    this.reachability.set(providerId, 'reachable')
    return true
  }

  noteMirrorFailure(providerId: string, expectedGeneration?: number): boolean {
    if (!this.recordMirrorFailure(providerId, expectedGeneration)) return false
    return this.commitMirrorFallback(providerId, expectedGeneration)
  }

  resetMirrorFallback(providerId?: string): boolean {
    if (providerId !== undefined) {
      const hadFallback = this.isMirrorFallbackActive(providerId)
      this.mirrorFailures.delete(providerId)
      this.mirrorFallbackUntil.delete(providerId)
      return this.mode === 'on' && hadFallback
    }
    let hadFallback = false
    for (const id of [...this.mirrorFallbackUntil.keys()]) {
      if (this.isMirrorFallbackActive(id)) hadFallback = true
    }
    this.mirrorFailures.clear()
    this.mirrorFallbackUntil.clear()
    return this.mode === 'on' && hadFallback
  }
}

export class MirrorEndpointManager {
  private preference: MirrorEndpointPreference = 'auto'
  private active: MirrorEndpointId = DEFAULT_MIRROR_ENDPOINT
  private probeResults: Partial<Record<MirrorEndpointId, MirrorEndpointProbeResult>> = {}
  private readonly failedUntil = new Map<MirrorEndpointId, number>()
  private readonly failedAt = new Map<MirrorEndpointId, number>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private isEndpointFailed(endpoint: MirrorEndpointId): boolean {
    const until = this.failedUntil.get(endpoint)
    if (until === undefined) return false
    if (this.now() >= until) {
      this.failedUntil.delete(endpoint)
      this.failedAt.delete(endpoint)
      return false
    }
    return true
  }

  private applySingleProbeHealth(probe: MirrorEndpointProbeResult): void {
    this.probeResults[probe.endpoint] = probe
    if (probe.ok) {
      const failedAt = this.failedAt.get(probe.endpoint)
      const observedAt = probe.checkedAt ?? this.now()
      if (failedAt === undefined || observedAt >= failedAt) {
        this.failedUntil.delete(probe.endpoint)
        this.failedAt.delete(probe.endpoint)
      }
    }
  }

  private eligibleProbes(probes: readonly MirrorEndpointProbeResult[]): MirrorEndpointProbeResult[] {
    return probes.filter((probe) => !this.isEndpointFailed(probe.endpoint))
  }

  getPreference(): MirrorEndpointPreference {
    return this.preference
  }

  getActive(): MirrorEndpointId {
    return this.active
  }

  getProbeResults(): MirrorEndpointProbeResult[] {
    return mirrorEndpointIds
      .map((id) => this.probeResults[id])
      .filter((item): item is MirrorEndpointProbeResult => item !== undefined)
  }

  setPreference(preference: MirrorEndpointPreference): boolean {
    const previousActive = this.active
    this.preference = preference
    this.failedUntil.clear()
    this.failedAt.clear()
    if (preference !== 'auto') {
      this.active = preference
    } else {
      const probes = this.getProbeResults()
      if (probes.length > 0) this.active = selectBestMirrorEndpoint(probes, this.active)
    }
    return this.active !== previousActive
  }

  applyProbeResult(
    probe: MirrorEndpointProbeResult,
    candidates?: readonly MirrorEndpointProbeResult[]
  ): { changed: boolean; active: MirrorEndpointId } {
    this.applySingleProbeHealth(probe)
    if (this.preference !== 'auto') {
      return { changed: false, active: this.active }
    }
    const previousActive = this.active
    const pool = this.eligibleProbes(candidates ?? this.getProbeResults())
    this.active = selectBestMirrorEndpoint(pool, this.active)
    return { changed: this.active !== previousActive, active: this.active }
  }

  applyProbeResults(probes: readonly MirrorEndpointProbeResult[]): { changed: boolean; active: MirrorEndpointId } {
    for (const probe of probes) {
      this.applySingleProbeHealth(probe)
    }
    if (this.preference !== 'auto') {
      return { changed: false, active: this.active }
    }
    const previousActive = this.active
    this.active = selectBestMirrorEndpoint(this.eligibleProbes(probes), this.active)
    return { changed: this.active !== previousActive, active: this.active }
  }

  noteEndpointSuccess(endpoint: MirrorEndpointId): void {
    this.failedUntil.delete(endpoint)
    this.failedAt.delete(endpoint)
  }

  tryFailover(failedEndpoint: MirrorEndpointId): MirrorEndpointId | null {
    if (this.preference !== 'auto') return null
    if (this.active !== failedEndpoint) return null
    const now = this.now()
    this.failedUntil.set(failedEndpoint, now + MIRROR_FALLBACK_COOLDOWN_MS)
    this.failedAt.set(failedEndpoint, now)
    const candidate = alternateMirrorEndpoint(failedEndpoint)
    if (this.isEndpointFailed(candidate)) return null
    this.active = candidate
    return candidate
  }

  clearFailures(): void {
    this.failedUntil.clear()
    this.failedAt.clear()
  }
}
