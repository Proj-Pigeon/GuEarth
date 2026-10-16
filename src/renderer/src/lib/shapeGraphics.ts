import * as Cesium from 'cesium'
import type { GeoPosition } from '../../../preload'

export interface ShapeVisual {
  kind: 'point' | 'polyline' | 'polygon' | 'arrow' | 'text'
  positions: GeoPosition[]
  annotation: string
  color: string
  textColor: string
  fontFamily: string
  fontSize: number
  textFrame: boolean
  lineWidth: number
}

export const SHAPE_COLOR = Cesium.Color.fromCssColorString('#1677ff')
export const LABEL_STYLE: Cesium.LabelGraphics.ConstructorOptions = {
  font: '13px SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
  fillColor: Cesium.Color.WHITE,
  outlineColor: Cesium.Color.BLACK,
  outlineWidth: 3,
  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
  pixelOffset: new Cesium.Cartesian2(0, -12),
  heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  disableDepthTestDistance: Number.POSITIVE_INFINITY
}

export function shapeColorOf(shape: { color: string }): Cesium.Color {
  return Cesium.Color.fromCssColorString(shape.color) ?? SHAPE_COLOR
}

export function toCartesian(position: GeoPosition): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude, position.height)
}

export function geodesicDistance(from: Cesium.Cartesian3, to: Cesium.Cartesian3): number {
  return new Cesium.EllipsoidGeodesic(Cesium.Cartographic.fromCartesian(from), Cesium.Cartographic.fromCartesian(to)).surfaceDistance
}

export function pathDistance(cartesians: Cesium.Cartesian3[]): number {
  let total = 0
  for (let index = 1; index < cartesians.length; index += 1) total += geodesicDistance(cartesians[index - 1], cartesians[index])
  return total
}

export function triangleArea(first: Cesium.Cartesian3, second: Cesium.Cartesian3, third: Cesium.Cartesian3): number {
  const ab = geodesicDistance(first, second)
  const bc = geodesicDistance(second, third)
  const ca = geodesicDistance(third, first)
  const semi = (ab + bc + ca) / 2
  const product = semi * (semi - ab) * (semi - bc) * (semi - ca)
  return product > 0 ? Math.sqrt(product) : 0
}

export function polygonArea(cartesians: Cesium.Cartesian3[]): number {
  let total = 0
  for (let index = 1; index < cartesians.length - 1; index += 1) total += triangleArea(cartesians[0], cartesians[index], cartesians[index + 1])
  return total
}

export function textOutlineColor(color: Cesium.Color): Cesium.Color {
  const luminance = color.red * 0.299 + color.green * 0.587 + color.blue * 0.114
  return luminance > 0.55 ? Cesium.Color.BLACK : Cesium.Color.WHITE
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`
}

export function formatArea(squareMeters: number): string {
  return squareMeters >= 1000000 ? `${(squareMeters / 1000000).toFixed(2)} km²` : `${squareMeters.toFixed(0)} m²`
}

export function centroidOf(cartesians: Cesium.Cartesian3[]): Cesium.Cartesian3 {
  const sum = cartesians.reduce((acc, cartesian) => Cesium.Cartesian3.add(acc, cartesian, new Cesium.Cartesian3()), new Cesium.Cartesian3())
  return Cesium.Cartesian3.multiplyByScalar(sum, 1 / cartesians.length, new Cesium.Cartesian3())
}

export function dedupe(cartesians: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  return cartesians.filter((cartesian, index) => index === 0 || !Cesium.Cartesian3.equalsEpsilon(cartesian, cartesians[index - 1], 0, 0.5))
}

export function isUsablePosition(position: Cesium.Cartesian3 | undefined): position is Cesium.Cartesian3 {
  if (!position) return false
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z) && Cesium.Cartesian3.magnitudeSquared(position) > 0
}

export function sanitizePositions(cartesians: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  return dedupe(cartesians.filter(isUsablePosition))
}

export function surfacePosition(cartesian: Cesium.Cartesian3): Cesium.Cartesian3 {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
  return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude)
}

export function ringOf(cartesians: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  return cartesians.length ? [...cartesians, cartesians[0]] : []
}

export function isGroundPolylineSupported(viewer: Cesium.Viewer): boolean {
  return viewer.scene.verticalExaggeration === 1
}

export function terrainPath(positions: Cesium.Cartesian3[], maxSegments: number): Cesium.Cartographic[] {
  const points = positions.map((position) => Cesium.Cartographic.fromCartesian(position))
  const spacing = Math.max(200, pathDistance(positions) / maxSegments)
  const path: Cesium.Cartographic[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const geodesic = new Cesium.EllipsoidGeodesic(from, to)
    const segments = Math.max(1, Math.ceil(geodesic.surfaceDistance / spacing))
    if (!path.length) path.push(from)
    for (let segment = 1; segment < segments; segment += 1) {
      const fraction = segment / segments
      const point = geodesic.interpolateUsingFraction(fraction)
      point.height = from.height + (to.height - from.height) * fraction
      path.push(point)
    }
    path.push(to)
  }
  return path
}

export function terrainSurfacePositions(viewer: Cesium.Viewer, path: Cesium.Cartographic[]): Cesium.Cartesian3[] {
  return path.map((cartographic) => {
    const terrainHeight = viewer.scene.globe.getHeight(cartographic)
    const exaggeration = viewer.scene.verticalExaggeration
    const height = (typeof terrainHeight === 'number' && Number.isFinite(terrainHeight) ? terrainHeight : cartographic.height / exaggeration) * exaggeration
    return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, height + 5)
  })
}

export function polylineOptions(viewer: Cesium.Viewer, positions: Cesium.Cartesian3[], width: number, color: Cesium.Color): { graphics: Cesium.PolylineGraphics.ConstructorOptions; drapedPath?: Cesium.Cartographic[] } | undefined {
  const sanitized = sanitizePositions(positions)
  if (sanitized.length < 2) return undefined
  if (isGroundPolylineSupported(viewer)) return { graphics: { positions: sanitized, width, material: color, clampToGround: true } }
  const material = new Cesium.ColorMaterialProperty(color)
  const drapedPath = terrainPath(sanitized, 512)
  return { graphics: { positions: terrainSurfacePositions(viewer, drapedPath), width, material, depthFailMaterial: material }, drapedPath }
}

export function measurementFor(kind: ShapeVisual['kind'], cartesians: Cesium.Cartesian3[]): string {
  if (kind === 'polyline' && cartesians.length >= 2) return formatDistance(pathDistance(cartesians))
  if (kind === 'polygon' && cartesians.length >= 3) return formatArea(polygonArea(cartesians))
  return ''
}

export function pointGraphics(color: Cesium.Color): Cesium.PointGraphics.ConstructorOptions {
  return {
    color,
    pixelSize: 10,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  }
}

export function polygonGraphics(color: Cesium.Color, hierarchy: Cesium.Cartesian3[]): Cesium.PolygonGraphics.ConstructorOptions {
  return { hierarchy: new Cesium.PolygonHierarchy(hierarchy), material: color.withAlpha(0.25) }
}

export function shapeLabelOptions(shape: ShapeVisual, cartesians: Cesium.Cartesian3[], textOverride?: string): Cesium.LabelGraphics.ConstructorOptions | undefined {
  const text = textOverride ?? (shape.kind === 'text' ? shape.annotation : shape.annotation || measurementFor(shape.kind, cartesians))
  if (!text) return undefined
  const textColor = Cesium.Color.fromCssColorString(shape.textColor) ?? Cesium.Color.WHITE
  return {
    ...LABEL_STYLE,
    text,
    font: `${shape.fontSize}px ${shape.fontFamily}`,
    fillColor: textColor,
    outlineColor: textOutlineColor(textColor),
    showBackground: shape.kind === 'text' && shape.textFrame,
    backgroundColor: Cesium.Color.WHITE.withAlpha(0.94),
    backgroundPadding: new Cesium.Cartesian2(8, 4)
  }
}
