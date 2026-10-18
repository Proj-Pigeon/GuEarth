export const TERRAIN_PROVIDER_IDS = ['ellipsoid', 'arcgis-terrain', 'cesium-world-terrain'] as const

export type TerrainProviderId = (typeof TERRAIN_PROVIDER_IDS)[number]

export const TERRAIN_PROVIDER_ID_SET: ReadonlySet<string> = new Set(TERRAIN_PROVIDER_IDS)
