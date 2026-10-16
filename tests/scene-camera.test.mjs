import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Cesium from 'cesium'

import { sanitizeCamera, sceneCameraDestination, sceneCameraOrientation } from '../src/renderer/src/lib/sceneCamera.ts'

function targetAnglesFromCamera(destination, target) {
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(destination)
  const local = Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4()), target, new Cesium.Cartesian3())
  return {
    heading: Cesium.Math.toDegrees(Math.atan2(local.x, local.y)),
    pitch: Cesium.Math.toDegrees(Math.atan2(local.z, Math.hypot(local.x, local.y))),
    distance: Cesium.Cartesian3.distance(destination, target),
    local
  }
}

function lessonTarget(camera) {
  return Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0)
}

test('centred destination keeps the lesson target near the centre of the view', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const angles = targetAnglesFromCamera(sceneCameraDestination(camera, true), lessonTarget(camera))
  assert.ok(Math.abs(angles.pitch - camera.pitch) < 3.5, `俯仰偏差应在曲率近似范围内，实际 ${angles.pitch.toFixed(2)}°`)
  assert.ok(Math.abs(angles.heading - camera.heading) < 1.5, `朝向偏差应很小，实际 ${angles.heading.toFixed(2)}°`)
})

test('without centring the target falls far outside the view centre', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const angles = targetAnglesFromCamera(sceneCameraDestination(camera, false), lessonTarget(camera))
  assert.ok(Math.abs(angles.pitch + 90) < 0.5, `未居中时目标应在正下方（-90°），实际 ${angles.pitch.toFixed(2)}°`)
  assert.ok(Math.abs(angles.pitch - camera.pitch) > 25, '未居中时目标应远离画面中心')
})

test('non-centred destination keeps the camera exactly above the point', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const grounded = sceneCameraDestination(camera, false)
  const expected = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height)
  assert.ok(Cesium.Cartesian3.equalsEpsilon(expected, grounded, 0.001))
})

test('centred camera keeps the requested altitude above the surface', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 0, pitch: -45 }
  const carto = Cesium.Cartographic.fromCartesian(sceneCameraDestination(camera, true))
  assert.ok(Math.abs(carto.height - camera.height) < camera.height * 0.05, `高度应接近请求值，实际 ${Math.round(carto.height)} 米`)
})

test('a nearly vertical pitch does not collapse the centred offset', () => {
  const camera = { longitude: 0, latitude: 0, height: 100_000, heading: 0, pitch: -89.9 }
  const distance = Cesium.Cartesian3.distance(sceneCameraDestination(camera, true), lessonTarget(camera))
  assert.ok(Number.isFinite(distance))
  assert.ok(distance < 120_000, `俯视时应几乎位于目标点上空，实际距离 ${Math.round(distance)} 米`)
})

test('orientation converts degrees to radians for the given camera', () => {
  const orientation = sceneCameraOrientation({ longitude: 0, latitude: 0, height: 10_000, heading: 90, pitch: -45 })
  assert.ok(Math.abs(orientation.heading - Math.PI / 2) < 1e-9)
  assert.ok(Math.abs(orientation.pitch + Math.PI / 4) < 1e-9)
  assert.equal(orientation.roll, 0)
})

test('sanitizeCamera clamps hostile input', () => {
  const sanitized = sanitizeCamera({ longitude: 300, latitude: -120, height: 1, heading: -90, pitch: -200 })
  assert.equal(sanitized.longitude, 180)
  assert.equal(sanitized.latitude, -90)
  assert.equal(sanitized.height, 1000)
  assert.equal(sanitized.heading, 270)
  assert.equal(sanitized.pitch, -89.9)
})
