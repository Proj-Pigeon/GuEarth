export interface TileAvailabilitySource {
  getTileDataAvailable: (x: number, y: number, level: number) => boolean | undefined
}

interface AvailabilityFlagged {
  _hasAvailability?: boolean
}

const availabilityStripped = new WeakSet<object>()

export function withoutTileAvailability<Terrain extends TileAvailabilitySource>(terrain: Terrain): Terrain {
  availabilityStripped.add(terrain)
  const flagged = terrain as Terrain & AvailabilityFlagged
  flagged._hasAvailability = false
  flagged.getTileDataAvailable = () => undefined
  return terrain
}

export function isAvailabilityStripped(terrain: object): boolean {
  return availabilityStripped.has(terrain)
}
