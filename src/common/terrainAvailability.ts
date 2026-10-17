export interface TileAvailabilitySource {
  getTileDataAvailable: (x: number, y: number, level: number) => boolean | undefined
}

interface AvailabilityFlagged {
  _hasAvailability?: boolean
}

export function withoutTileAvailability<Terrain extends TileAvailabilitySource>(terrain: Terrain): Terrain {
  const flagged = terrain as Terrain & AvailabilityFlagged
  flagged._hasAvailability = false
  flagged.getTileDataAvailable = () => undefined
  return terrain
}
