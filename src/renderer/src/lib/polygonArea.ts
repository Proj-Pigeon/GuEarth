import * as Cesium from 'cesium'
import geodesic from 'geographiclib-geodesic'

const wgs84 = geodesic.Geodesic.WGS84

function usablePosition(position: Cesium.Cartesian3 | undefined): position is Cesium.Cartesian3 {
  if (!position) return false
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z) && Cesium.Cartesian3.magnitudeSquared(position) > 0
}

function sameSurfacePoint(left: Cesium.Cartesian3, right: Cesium.Cartesian3): boolean {
  return Cesium.Cartesian3.equalsEpsilon(left, right, Cesium.Math.EPSILON10)
}

function surfaceRing(cartesians: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  const ring: Cesium.Cartesian3[] = []
  for (const cartesian of cartesians) {
    if (!usablePosition(cartesian)) continue
    const surface = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(cartesian)
    if (!usablePosition(surface)) continue
    const previous = ring[ring.length - 1]
    if (previous && sameSurfacePoint(previous, surface)) continue
    ring.push(surface)
  }
  if (ring.length > 1 && sameSurfacePoint(ring[0], ring[ring.length - 1])) ring.pop()
  return ring
}

function longitudesAndLatitudes(ring: Cesium.Cartesian3[]): Array<[number, number]> {
  return ring.map((cartesian) => {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
    return [Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude)]
  })
}

function geodesicRingArea(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) return 0
  const polygon = wgs84.Polygon(false)
  for (const [longitude, latitude] of coordinates) polygon.AddPoint(latitude, longitude)
  const area = polygon.Compute(false, true).area
  return typeof area === 'number' && Number.isFinite(area) ? Math.abs(area) : 0
}

interface ProjectedRing {
  cartesians: Cesium.Cartesian3[]
  planar: Cesium.Cartesian2[]
}

function projectRing(ring: Cesium.Cartesian3[]): ProjectedRing | undefined {
  try {
    const plane = Cesium.EllipsoidTangentPlane.fromPoints(ring)
    const planar: Cesium.Cartesian2[] = []
    for (const cartesian of ring) {
      if (Cesium.Cartesian3.dot(cartesian, plane.zAxis) <= 0) return undefined
      const projected = plane.projectPointOntoPlane(cartesian)
      if (!projected) return undefined
      planar.push(projected)
    }
    return { cartesians: ring, planar }
  } catch {
    return undefined
  }
}

function orient(origin: Cesium.Cartesian2, first: Cesium.Cartesian2, second: Cesium.Cartesian2): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
}

function pointOnSegment(origin: Cesium.Cartesian2, end: Cesium.Cartesian2, point: Cesium.Cartesian2): boolean {
  const edgeX = end.x - origin.x
  const edgeY = end.y - origin.y
  const lengthSquared = edgeX * edgeX + edgeY * edgeY
  if (!(lengthSquared > 0)) return false
  const cross = edgeX * (point.y - origin.y) - edgeY * (point.x - origin.x)
  if (cross * cross > lengthSquared * 1e-20) return false
  const dot = (point.x - origin.x) * edgeX + (point.y - origin.y) * edgeY
  return dot >= 0 && dot <= lengthSquared
}

function edgesCross(planar: Cesium.Cartesian2[]): boolean {
  const count = planar.length
  for (let start = 0; start < count; start += 1) {
    const startEnd = (start + 1) % count
    for (let other = start + 1; other < count; other += 1) {
      const otherEnd = (other + 1) % count
      if (startEnd === other || start === otherEnd || startEnd === otherEnd) continue
      const startEdge = planar[start]
      const startEdgeEnd = planar[startEnd]
      const otherEdge = planar[other]
      const otherEdgeEnd = planar[otherEnd]
      const acrossStart = orient(startEdge, startEdgeEnd, otherEdge) * orient(startEdge, startEdgeEnd, otherEdgeEnd)
      const acrossOther = orient(otherEdge, otherEdgeEnd, startEdge) * orient(otherEdge, otherEdgeEnd, startEdgeEnd)
      if (acrossStart < 0 && acrossOther < 0) return true
      if (
        pointOnSegment(startEdge, startEdgeEnd, otherEdge) ||
        pointOnSegment(startEdge, startEdgeEnd, otherEdgeEnd) ||
        pointOnSegment(otherEdge, otherEdgeEnd, startEdge) ||
        pointOnSegment(otherEdge, otherEdgeEnd, startEdgeEnd)
      ) return true
    }
  }
  return false
}

function counterClockwise(projected: ProjectedRing): ProjectedRing {
  let signed = 0
  for (let index = 0; index < projected.planar.length; index += 1) {
    const current = projected.planar[index]
    const next = projected.planar[(index + 1) % projected.planar.length]
    signed += current.x * next.y - next.x * current.y
  }
  if (signed >= 0) return projected
  return { cartesians: projected.cartesians.slice().reverse(), planar: projected.planar.slice().reverse() }
}

function triangulate(planar: Cesium.Cartesian2[]): number[] {
  const pipeline = (Cesium as unknown as { PolygonPipeline: { triangulate(positions: Cesium.Cartesian2[]): number[] } }).PolygonPipeline
  return pipeline.triangulate(planar)
}

function renderedFillArea(projected: ProjectedRing): number | undefined {
  const oriented = counterClockwise(projected)
  const indices = triangulate(oriented.planar)
  if (indices.length < 3 || indices.length % 3 !== 0) return undefined
  const coordinates = longitudesAndLatitudes(oriented.cartesians)
  let total = 0
  for (let index = 0; index < indices.length; index += 3) {
    const first = indices[index]
    const second = indices[index + 1]
    const third = indices[index + 2]
    if (first < 0 || second < 0 || third < 0 || first >= coordinates.length || second >= coordinates.length || third >= coordinates.length) return undefined
    if (first === second || second === third || third === first) continue
    total += geodesicRingArea([coordinates[first], coordinates[second], coordinates[third]])
  }
  return total
}

export function polygonArea(cartesians: Cesium.Cartesian3[]): number {
  const ring = surfaceRing(cartesians)
  if (ring.length < 3) return 0
  const geodesicArea = geodesicRingArea(longitudesAndLatitudes(ring))
  const projected = projectRing(ring)
  if (!projected || !edgesCross(projected.planar)) return geodesicArea
  return renderedFillArea(projected) ?? geodesicArea
}
