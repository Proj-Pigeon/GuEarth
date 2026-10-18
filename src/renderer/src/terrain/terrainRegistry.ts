import * as Cesium from 'cesium'
import { withoutTileAvailability } from '../../../common/terrainAvailability'
import type { TerrainProviderId } from '../../../common/terrainProviders'

export const terrainRegistry: Record<TerrainProviderId, () => Promise<Cesium.TerrainProvider>> = {
  ellipsoid: async () => new Cesium.EllipsoidTerrainProvider(),
  'arcgis-terrain': async () => withoutTileAvailability(await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer')),
  'cesium-world-terrain': () => Cesium.CesiumTerrainProvider.fromUrl(Cesium.IonResource.fromAssetId(1), { requestVertexNormals: true })
}

export function terrainProviderFactory(id: string): () => Promise<Cesium.TerrainProvider> {
  const registry: Record<string, (() => Promise<Cesium.TerrainProvider>) | undefined> = terrainRegistry
  return registry[id] ?? terrainRegistry.ellipsoid
}
