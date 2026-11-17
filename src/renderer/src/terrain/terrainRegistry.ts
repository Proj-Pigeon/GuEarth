import * as Cesium from 'cesium'
import { withoutTileAvailability } from '../../../common/terrainAvailability'
import type { TerrainProviderId } from '../../../common/terrainProviders'
import { EDGEONE_ARCGIS_TERRAIN_URL } from '../../../common/tileMirror'
import { useGlobeStore } from '@renderer/stores/globe'

const arcgisTerrainUrl = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

function isTerrainMirrorEnabled(): boolean {
  try {
    return useGlobeStore().tileMirrorMode === 'on'
  } catch {
    return false
  }
}

async function createArcGisTerrain(): Promise<Cesium.ArcGISTiledElevationTerrainProvider> {
  if (isTerrainMirrorEnabled()) {
    try {
      return await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(EDGEONE_ARCGIS_TERRAIN_URL)
    } catch {
      return Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(arcgisTerrainUrl)
    }
  }
  return Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(arcgisTerrainUrl)
}

export const terrainRegistry: Record<TerrainProviderId, () => Promise<Cesium.TerrainProvider>> = {
  ellipsoid: async () => new Cesium.EllipsoidTerrainProvider(),
  'arcgis-terrain': async () => withoutTileAvailability(await createArcGisTerrain()),
  'cesium-world-terrain': () => Cesium.CesiumTerrainProvider.fromUrl(Cesium.IonResource.fromAssetId(1), { requestVertexNormals: true })
}

const detailedSamplingTerrains: Partial<Record<TerrainProviderId, () => Promise<Cesium.TerrainProvider>>> = {
  'arcgis-terrain': () => createArcGisTerrain()
}

export function detailedSamplingTerrain(id: string): (() => Promise<Cesium.TerrainProvider>) | undefined {
  return detailedSamplingTerrains[id as TerrainProviderId]
}

export function terrainProviderFactory(id: string): () => Promise<Cesium.TerrainProvider> {
  const registry: Record<string, (() => Promise<Cesium.TerrainProvider>) | undefined> = terrainRegistry
  return registry[id] ?? terrainRegistry.ellipsoid
}
