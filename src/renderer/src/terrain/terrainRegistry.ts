import * as Cesium from 'cesium'

export const terrainRegistry: Record<string, () => Promise<Cesium.TerrainProvider>> = {
  ellipsoid: async () => new Cesium.EllipsoidTerrainProvider(),
  'arcgis-terrain': () => Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'),
  'cesium-world-terrain': () => Cesium.CesiumTerrainProvider.fromUrl(Cesium.IonResource.fromAssetId(1), { requestVertexNormals: true })
}
