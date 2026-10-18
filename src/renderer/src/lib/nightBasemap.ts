export const NIGHT_BASEMAP_ID = 'viirs-night'

export function hidesThematicLayers(basemapId: string): boolean {
  return basemapId === NIGHT_BASEMAP_ID
}

export function visibleThematicLayers(basemapId: string, requested: readonly string[]): string[] {
  return hidesThematicLayers(basemapId) ? [] : [...requested]
}
