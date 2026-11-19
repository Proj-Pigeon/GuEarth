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

const { SHAPE_COLOR, measurementFor, pointGraphics, polygonArea, polygonGraphics, polylineOptions, shapeColorOf, shapeLabelOptions } = await import('../src/renderer/src/lib/shapeGraphics.ts')

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

const ringCartesians = (ring) => ring.map(([longitude, latitude]) => Cesium.Cartesian3.fromDegrees(longitude, latitude))
const planarAreaM2 = (ring) => {
  const points = ring.map(([longitude, latitude]) => [
    longitude * 111320 * Math.cos((latitude * Math.PI) / 180),
    latitude * 110570
  ])
  let twice = 0
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % points.length]
    twice += x1 * y2 - x2 * y1
  }
  return Math.abs(twice) / 2
}

test('polygon area follows concave outlines instead of fanning from the first vertex', () => {
  const concave = [
    [116, 39], [116.03, 39], [116.03, 39.03], [116.02, 39.03],
    [116.02, 39.01], [116.01, 39.01], [116.01, 39.03], [116, 39.03]
  ]
  const area = polygonArea(ringCartesians(concave))
  const planar = planarAreaM2(concave)
  assert.ok(Math.abs(area - planar) / planar < 0.01, `${area} vs ${planar}`)
})

test('polygon area is stable across winding, duplicate vertices and a closed ring', () => {
  const concave = [
    [116, 39], [116.03, 39], [116.03, 39.03], [116.02, 39.03],
    [116.02, 39.01], [116.01, 39.01], [116.01, 39.03], [116, 39.03]
  ]
  const area = polygonArea(ringCartesians(concave))
  const tolerance = area * 1e-7
  assert.ok(Math.abs(area - polygonArea(ringCartesians([...concave].reverse()))) < tolerance)
  assert.ok(Math.abs(area - polygonArea(ringCartesians([...concave, concave[0]]))) < tolerance)
  assert.ok(Math.abs(area - polygonArea(ringCartesians([concave[0], concave[0], ...concave.slice(1)]))) < tolerance)
  assert.equal(polygonArea(ringCartesians([concave[0], concave[1], concave[0]])), 0)
})

test('polygon area ignores adjacent vertices that share a direction but differ in height', () => {
  const ring = [
    Cesium.Cartesian3.fromDegrees(116, 39, 0),
    Cesium.Cartesian3.fromDegrees(116, 39, 1200),
    Cesium.Cartesian3.fromDegrees(116.01, 39, 0),
    Cesium.Cartesian3.fromDegrees(116, 39.01, 0)
  ]
  const area = polygonArea(ring)
  assert.ok(Number.isFinite(area) && area > 0, String(area))
})
