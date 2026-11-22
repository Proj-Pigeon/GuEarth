import * as Cesium from 'cesium'

export function createPolarCaps(terrain: Cesium.TerrainProvider): Cesium.Primitive | undefined {
  const { rectangle, ellipsoid } = terrain.tilingScheme
  const caps: Cesium.Rectangle[] = []
  if (rectangle.north < Cesium.Math.PI_OVER_TWO) {
    caps.push(new Cesium.Rectangle(-Math.PI, rectangle.north, Math.PI, Cesium.Math.PI_OVER_TWO))
  }
  if (rectangle.south > -Cesium.Math.PI_OVER_TWO) {
    caps.push(new Cesium.Rectangle(-Math.PI, -Cesium.Math.PI_OVER_TWO, Math.PI, rectangle.south))
  }
  if (!caps.length) return undefined

  return new Cesium.Primitive({
    geometryInstances: caps.flatMap(cap =>
      [-Math.PI, -Cesium.Math.PI_OVER_TWO, 0, Cesium.Math.PI_OVER_TWO].map(
        west =>
          new Cesium.GeometryInstance({
            geometry: new Cesium.RectangleGeometry({
              rectangle: new Cesium.Rectangle(
                west,
                cap.south,
                west + Cesium.Math.PI_OVER_TWO,
                cap.north
              ),
              ellipsoid,
              granularity: Cesium.Math.toRadians(0.25),
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.WHITE)
            }
          })
      )
    ),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false }),
    asynchronous: false,
    allowPicking: false
  })
}
