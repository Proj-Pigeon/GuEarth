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
