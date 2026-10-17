export interface TileAvailabilitySource {
  getTileDataAvailable: (x: number, y: number, level: number) => boolean | undefined
}

export function withoutTileAvailability<Terrain extends TileAvailabilitySource>(terrain: Terrain): Terrain {
  terrain.getTileDataAvailable = () => undefined
  return terrain
}
