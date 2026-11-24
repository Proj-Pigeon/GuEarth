import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as Cesium from 'cesium'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { SHAPE_COLOR, formatArea, measurementFor, pointGraphics, polygonArea, polygonGraphics, polylineOptions, shapeColorOf, shapeLabelOptions } = await import('../src/renderer/src/lib/shapeGraphics.ts')

const STYLE = { color: '#fa541c', textColor: '#ffffff', fontFamily: 'Arial', fontSize: 15, textFrame: false, lineWidth: 4 }
const positions = [
  { longitude: 116, latitude: 39, height: 0 },
  { longitude: 117, latitude: 40, height: 0 },
  { longitude: 118, latitude: 39, height: 0 }
]

function fakeViewer(verticalExaggeration, heights = 0) {
  return {
    scene: {
      verticalExaggeration,
      globe: { getHeight: () => heights }
    }
  }
}

test('shape colour falls back to the default shape colour for invalid css', () => {
  assert.ok(Cesium.Color.equals(shapeColorOf({ color: '#fa541c' }), Cesium.Color.fromCssColorString('#fa541c')))
  assert.ok(Cesium.Color.equals(shapeColorOf({ color: 'not-a-colour' }), SHAPE_COLOR))
})

test('point graphics match the in-app drawing style', () => {
  const graphics = pointGraphics(Cesium.Color.fromCssColorString('#fa541c'))
  assert.equal(graphics.pixelSize, 10)
  assert.equal(graphics.outlineWidth, 2)
  assert.ok(Cesium.Color.equals(graphics.outlineColor, Cesium.Color.WHITE))
  assert.equal(graphics.heightReference, Cesium.HeightReference.CLAMP_TO_GROUND)
  assert.equal(graphics.disableDepthTestDistance, Number.POSITIVE_INFINITY)
})

test('polygon fill uses a quarter opacity of the shape colour', () => {
  const color = Cesium.Color.fromCssColorString('#fa541c')
  const graphics = polygonGraphics(color, positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude)))
  const material = graphics.material
  assert.ok(!(material instanceof Cesium.ColorMaterialProperty))
  assert.ok(Math.abs(material.alpha - 0.25) < 1e-9)
  assert.ok(Math.abs(material.red - color.red) < 1e-9)
})

test('polylines clamp to ground only when the scene is not exaggerated', () => {
  const cartesians = positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude))
  const color = Cesium.Color.fromCssColorString('#fa541c')

  const ground = polylineOptions(fakeViewer(1), cartesians, 4, color)
  assert.equal(ground.graphics.clampToGround, true)
  assert.equal(ground.graphics.width, 4)
  assert.ok(Cesium.Color.equals(ground.graphics.material, color))
  assert.equal(ground.drapedPath, undefined)

  const draped = polylineOptions(fakeViewer(2, 1500), cartesians, 4, color)
  assert.equal(draped.graphics.clampToGround, undefined)
  assert.ok(draped.graphics.depthFailMaterial)
  assert.ok(draped.drapedPath.length >= cartesians.length)
  assert.ok(draped.graphics.positions.length >= cartesians.length)
})

test('labels follow the authored font, colour and contrast outline', () => {
  const shape = { kind: 'point', positions, annotation: '珠峰大本营', ...STYLE }
  const cartesians = positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude))
  const label = shapeLabelOptions(shape, cartesians)
  assert.equal(label.text, '珠峰大本营')
  assert.equal(label.font, '15px Arial')
  assert.ok(Cesium.Color.equals(label.fillColor, Cesium.Color.fromCssColorString('#ffffff')))
  assert.ok(Cesium.Color.equals(label.outlineColor, Cesium.Color.BLACK))
  assert.equal(label.showBackground, false)
  assert.equal(label.verticalOrigin, Cesium.VerticalOrigin.BOTTOM)
})

test('polyline labels fall back to the measured distance when unnamed', () => {
  const cartesians = positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude))
  const shape = { kind: 'polyline', positions, annotation: '', ...STYLE }
  const label = shapeLabelOptions(shape, cartesians)
  assert.match(String(label.text), /km$/)
  assert.equal(measurementFor('polyline', cartesians), label.text)
})

test('text frames only enable a background for text shapes', () => {
  const cartesians = positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude))
  const framed = shapeLabelOptions({ kind: 'text', positions, annotation: '标题', ...STYLE, textFrame: true }, cartesians)
  assert.equal(framed.showBackground, true)
  assert.ok(Math.abs(framed.backgroundColor.alpha - 0.94) < 1e-9)
  const plain = shapeLabelOptions({ kind: 'text', positions, annotation: '标题', ...STYLE, textFrame: false }, cartesians)
  assert.equal(plain.showBackground, false)
})

test('shapes without any label text produce no label graphics', () => {
  const cartesians = [Cesium.Cartesian3.fromDegrees(116, 39)]
  const label = shapeLabelOptions({ kind: 'point', positions: [{ longitude: 116, latitude: 39, height: 0 }], annotation: '', ...STYLE }, cartesians)
  assert.equal(label, undefined)
})

const ringCartesians = (ring, height = 0) => ring.map(([longitude, latitude]) => Cesium.Cartesian3.fromDegrees(longitude, latitude, height))

function labelTolerance(squareMeters) {
  return squareMeters >= 1_000_000 ? 5_000 : 0.5
}

function assertReportedArea(actual, reference, tolerance = labelTolerance(reference)) {
  assert.ok(Number.isFinite(actual), String(actual))
  assert.ok(Math.abs(actual - reference) <= tolerance, `${actual} vs ${reference} (tolerance ${tolerance})`)
  assert.equal(formatArea(actual), formatArea(reference))
}

function parallelCellArea(south, north, west, east) {
  const equatorialRadius = 6378137
  const flattening = 1 / 298.257223563
  const eccentricitySquared = flattening * (2 - flattening)
  const eccentricity = Math.sqrt(eccentricitySquared)
  const integral = (latitude) => {
    const sine = Math.sin((latitude * Math.PI) / 180)
    return sine / (2 * (1 - eccentricitySquared * sine * sine)) + Math.atanh(eccentricity * sine) / (2 * eccentricity)
  }
  return Math.abs(equatorialRadius ** 2 * (1 - eccentricitySquared) * ((east - west) * Math.PI / 180) * (integral(north) - integral(south)))
}

const concave = [
  [116, 39], [116.03, 39], [116.03, 39.03], [116.02, 39.03],
  [116.02, 39.01], [116.01, 39.01], [116.01, 39.03], [116, 39.03]
]
const CONCAVE_GEODESIC_M2 = 6730374.918290138
const HIGH_LATITUDE_CELL = [[10, 60], [10.05, 60], [10.05, 60.05], [10, 60.05]]
const HIGH_LATITUDE_GEODESIC_M2 = 15530344.38269806
const ONE_DEGREE_CELL = [[10, 60], [11, 60], [11, 61], [10, 61]]
const ONE_DEGREE_GEODESIC_M2 = 6122943163.071289
const ANTIMERIDIAN_GEODESIC_M2 = 24619443759.277203
const ANTARCTICA = [
  [-58, -63.1], [-74, -72.9], [-102, -71.9], [-102, -74.9], [-131, -74.3], [-163, -77.5],
  [163, -77.4], [172, -71.7], [140, -65.9], [113, -65.7], [88, -66.6], [59, -66.9],
  [25, -69.8], [-4, -70], [-14, -71], [-33, -77.3], [-46, -77.9], [-61, -74.7]
]
const PUBLISHED_ANTARCTICA_M2 = 13662703680020.1

test('polygon area matches the WGS84 geodesic area of a concave outline', () => {
  const area = polygonArea(ringCartesians(concave))
  assertReportedArea(area, CONCAVE_GEODESIC_M2)
  assert.equal(measurementFor('polygon', ringCartesians(concave)), formatArea(area))
})

test('polygon area is unchanged by winding, start vertex, closure and repeated vertices', () => {
  const area = polygonArea(ringCartesians(concave))
  const rotated = [concave[3], ...concave.slice(4), ...concave.slice(0, 3)]
  assertReportedArea(polygonArea(ringCartesians([...concave].reverse())), area, 0.05)
  assertReportedArea(polygonArea(ringCartesians(rotated)), area, 0.05)
  assertReportedArea(polygonArea(ringCartesians([...concave, concave[0]])), area, 0.05)
  assertReportedArea(polygonArea(ringCartesians([concave[0], concave[0], ...concave.slice(1)])), area, 0.05)
  assert.equal(polygonArea(ringCartesians([concave[0], concave[1], concave[0]])), 0)
})

test('polygon area at high latitude stays within the displayed step of the ellipsoidal parallel-cell integral', () => {
  const area = polygonArea(ringCartesians(HIGH_LATITUDE_CELL))
  const parallelCell = parallelCellArea(60, 60.05, 10, 10.05)
  assertReportedArea(area, parallelCell, 100)
  assert.ok(Math.abs(parallelCell - HIGH_LATITUDE_GEODESIC_M2) < 100)
  const polarCell = polygonArea(ringCartesians([[10, 80], [10.05, 80], [10.05, 80.05], [10, 80.05]]))
  assertReportedArea(polarCell, parallelCellArea(80, 80.05, 10, 10.05), 100)
})

test('polygon area of a one-degree quadrilateral follows the geodesic boundary', () => {
  const area = polygonArea(ringCartesians(ONE_DEGREE_CELL))
  const parallelCell = parallelCellArea(60, 61, 10, 11)
  assertReportedArea(area, ONE_DEGREE_GEODESIC_M2)
  assert.ok(Math.abs(parallelCell - ONE_DEGREE_GEODESIC_M2) > labelTolerance(ONE_DEGREE_GEODESIC_M2))
})

test('polygon area keeps the ellipsoidal footprint when vertices have different elevations', () => {
  const flat = ringCartesians([[116, 40], [116.2, 40], [116.2, 40.2], [116, 40.2]])
  const elevated = [
    Cesium.Cartesian3.fromDegrees(116, 40, 0),
    Cesium.Cartesian3.fromDegrees(116.2, 40, 1800),
    Cesium.Cartesian3.fromDegrees(116.2, 40.2, 4200),
    Cesium.Cartesian3.fromDegrees(116, 40.2, 900)
  ]
  const seaLevel = Cesium.Cartesian3.fromDegrees(116, 39, 0)
  const raised = Cesium.Cartesian3.fromDegrees(116, 39, 2500)
  assert.ok(Cesium.Cartesian3.angleBetween(seaLevel, raised) > Cesium.Math.EPSILON12)
  const clean = [
    seaLevel,
    Cesium.Cartesian3.fromDegrees(116.2, 39, 0),
    Cesium.Cartesian3.fromDegrees(116.2, 39.2, 0),
    Cesium.Cartesian3.fromDegrees(116, 39.2, 0)
  ]
  const withRaisedDuplicate = [seaLevel, raised, ...clean.slice(1)]
  assertReportedArea(polygonArea(elevated), polygonArea(flat), 0.05)
  assertReportedArea(polygonArea(withRaisedDuplicate), polygonArea(clean), 0.05)
  assertReportedArea(polygonArea(flat), 378719458.75068665)
})

test('polygon area drops a true duplicate geocentric direction', () => {
  const origin = Cesium.Cartesian3.fromDegrees(10, 60)
  const duplicateDirection = Cesium.Cartesian3.multiplyByScalar(origin, 1 + 1e-8, new Cesium.Cartesian3())
  assert.ok(Cesium.Cartesian3.angleBetween(origin, duplicateDirection) < Cesium.Math.EPSILON12)
  const cell = [
    origin,
    duplicateDirection,
    Cesium.Cartesian3.fromDegrees(10.05, 60),
    Cesium.Cartesian3.fromDegrees(10.05, 60.05),
    Cesium.Cartesian3.fromDegrees(10, 60.05)
  ]
  assertReportedArea(polygonArea(cell), HIGH_LATITUDE_GEODESIC_M2)
  const farRadial = [
    origin,
    Cesium.Cartesian3.multiplyByScalar(origin, 1.001, new Cesium.Cartesian3()),
    Cesium.Cartesian3.fromDegrees(10.05, 60),
    Cesium.Cartesian3.fromDegrees(10.05, 60.05),
    Cesium.Cartesian3.fromDegrees(10, 60.05)
  ]
  assert.ok(Cesium.Cartesian3.angleBetween(origin, farRadial[1]) < Cesium.Math.EPSILON12)
  assert.ok(Math.abs(polygonArea(farRadial) - HIGH_LATITUDE_GEODESIC_M2) > labelTolerance(HIGH_LATITUDE_GEODESIC_M2))
  const equatorial = [
    Cesium.Cartesian3.fromDegrees(0, 0, 0),
    Cesium.Cartesian3.fromDegrees(0, 0, 5000),
    Cesium.Cartesian3.fromDegrees(0.2, 0, 0),
    Cesium.Cartesian3.fromDegrees(0.2, 0.2, 0)
  ]
  assert.equal(Cesium.Cartesian3.angleBetween(equatorial[0], equatorial[1]), 0)
  assertReportedArea(polygonArea(equatorial), 246181951.57871842)
})

test('self-intersecting polygons report the rendered fill instead of cancelling opposite lobes', () => {
  const symmetric = [[116, 39], [116.2, 39], [116, 39.2], [116.2, 39.2]]
  const symmetricFilled = 192340903.5258026
  const symmetricCancelled = 542658.3645782471
  const symmetricArea = polygonArea(ringCartesians(symmetric))
  assertReportedArea(symmetricArea, symmetricFilled)
  assert.ok(Math.abs(symmetricArea - symmetricCancelled) > labelTolerance(symmetricFilled))
  assertReportedArea(polygonArea(ringCartesians([...symmetric].reverse())), symmetricFilled)
  const rotated = [symmetric[2], symmetric[3], symmetric[0], symmetric[1]]
  assertReportedArea(polygonArea(ringCartesians(rotated)), symmetricFilled)

  const asymmetric = [[116, 40], [116.4, 40], [116.05, 40.25], [116.15, 40.3]]
  const asymmetricFilled = 568609657.5216141
  const asymmetricCancelled = 367815848.036705
  const asymmetricArea = polygonArea(ringCartesians(asymmetric))
  assertReportedArea(asymmetricArea, asymmetricFilled)
  assert.ok(Math.abs(asymmetricArea - asymmetricCancelled) > labelTolerance(asymmetricFilled))
  assert.ok(Math.abs(asymmetricFilled - asymmetricCancelled) > 1_000_000)

  const starFilled = 68317813710.74405
  const starCancelled = 59699228587.22718
  const star = polygonArea(ringCartesians([[0, 0], [2, -1], [0.5, -3], [-1.5, -1], [0.5, -0.2]]))
  assertReportedArea(star, starFilled)
  assert.ok(Math.abs(star - starCancelled) > labelTolerance(starFilled))
})

test('a ring that meets only at a repeated vertex reports the rendered lobe', () => {
  const touch = [[-1, -1], [0, 0], [1, 1], [-1, 1], [0, 0], [1, -1]]
  const area = polygonArea(ringCartesians(touch))
  assertReportedArea(area, 12309734185.834341)
  assert.ok(area > labelTolerance(area))
})

test('separated collinear edges stay on the geodesic area', () => {
  const stepped = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 0], [3, 0], [3, 2], [0, 2]]
  assertReportedArea(polygonArea(ringCartesians(stepped)), 61548025574.44525)
})

test('a simple ring outside the tangent hemisphere keeps the geodesic area', () => {
  assertReportedArea(polygonArea(ringCartesians([[-170, 20], [-10, 20], [10, -10], [170, -10]])), 227054440823306.5, 1)
})

test('a ring that revisits a vertex keeps the simple polygon area', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const pinched = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [0, 1]]
  assertReportedArea(polygonArea(ringCartesians(pinched)), polygonArea(ringCartesians(square)), 0.05)
  assertReportedArea(polygonArea(ringCartesians(square)), 12308778361.469452)
})

test('polygon area of an antimeridian rectangle is the small geodesic quadrilateral', () => {
  assertReportedArea(polygonArea(ringCartesians([[179, 0], [-179, 0], [-179, 1], [179, 1]])), ANTIMERIDIAN_GEODESIC_M2)
})

test('polygon area matches the published GeographicLib area of the Antarctica outline', () => {
  assertReportedArea(polygonArea(ringCartesians(ANTARCTICA)), PUBLISHED_ANTARCTICA_M2, 1)
})

test('degenerate rings report no area', () => {
  assert.equal(polygonArea([]), 0)
  assert.equal(polygonArea(ringCartesians([[116, 40], [117, 41]])), 0)
  const start = Cesium.Cartographic.fromDegrees(116, 40)
  const end = Cesium.Cartographic.fromDegrees(117.2, 41.4)
  const middle = new Cesium.EllipsoidGeodesic(start, end).interpolateUsingFraction(0.4)
  const collinear = [start, middle, end].map((point) => Cesium.Cartesian3.fromRadians(point.longitude, point.latitude))
  assert.ok(polygonArea(collinear) < 0.5, String(polygonArea(collinear)))
  assert.equal(formatArea(polygonArea(collinear)), '0 m²')
})
