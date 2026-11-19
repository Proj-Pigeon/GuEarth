import * as Cesium from 'cesium'
import { logger } from '../../../common/logger'
import { attachOriginTerrainFallback, withoutTileAvailability } from '../../../common/terrainAvailability'
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
  const createOrigin = (): Promise<Cesium.ArcGISTiledElevationTerrainProvider> =>
    Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(arcgisTerrainUrl)
  if (isTerrainMirrorEnabled()) {
    try {
      const mirrorProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(EDGEONE_ARCGIS_TERRAIN_URL)
      return attachOriginTerrainFallback<
        Cesium.TerrainData,
        Cesium.Request,
        Cesium.ArcGISTiledElevationTerrainProvider
      >(mirrorProvider, createOrigin)
    } catch (error) {
      logger.warn('terrain', '全球 3D 地形镜像源不可用，已回退到原地形源', error)
      return createOrigin()
    }
  }
  return createOrigin()
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
