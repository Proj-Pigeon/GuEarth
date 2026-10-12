export type MirrorTileKind = 'vector' | 'satellite'

export const mirrorEligibleProviders: Record<string, MirrorTileKind> = {
  osm: 'vector',
  'esri-imagery': 'satellite',
  opentopomap: 'vector'
}

const mirrorSatelliteDetailBounds = { west: 73.5, east: 135, south: 18, north: 53.6 }

export function isMirrorSatelliteProvider(providerId: string): boolean {
  return mirrorEligibleProviders[providerId] === 'satellite'
}

export function withinMirrorSatelliteDetail(longitude: number, latitude: number): boolean {
  return longitude >= mirrorSatelliteDetailBounds.west && longitude <= mirrorSatelliteDetailBounds.east
    && latitude >= mirrorSatelliteDetailBounds.south && latitude <= mirrorSatelliteDetailBounds.north
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
  private mode: TileMirrorMode = 'auto'
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
