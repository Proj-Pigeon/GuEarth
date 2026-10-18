import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Cesium from 'cesium'

import { sanitizeCamera, sceneCameraView } from '../src/renderer/src/lib/sceneCamera.ts'

function anglesFrom(from, to) {
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(from)
  const local = Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4()), to, new Cesium.Cartesian3())
  return {
    heading: Cesium.Math.toDegrees(Math.atan2(local.x, local.y)),
    pitch: Cesium.Math.toDegrees(Math.atan2(local.z, Math.hypot(local.x, local.y)))
  }
}

function shortestAngle(from, to) {
  return ((from - to + 540) % 360) - 180
}

function lessonTarget(camera) {
  return Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0)
}

function nearestEarthDistance(destination, target) {
  const axis = Cesium.Cartesian3.subtract(target, destination, new Cesium.Cartesian3())
  const along = Cesium.Cartesian3.dot(axis, Cesium.Cartesian3.negate(destination, new Cesium.Cartesian3())) / Cesium.Cartesian3.magnitudeSquared(axis)
  const closest = Cesium.Cartesian3.add(destination, Cesium.Cartesian3.multiplyByScalar(axis, Math.min(1, Math.max(0, along)), new Cesium.Cartesian3()), new Cesium.Cartesian3())
  return Cesium.Cartesian3.magnitude(closest)
}

const ORBIT_PITCH_CASES = [
  { height: 600_000, pitch: -5 },
  { height: 600_000, pitch: -20 },
  { height: 600_000, pitch: -45 },
  { height: 600_000, pitch: -60 },
  { height: 800_000, pitch: -10 },
  { height: 800_000, pitch: -45 },
  { height: 3_000_000, pitch: -20 },
  { height: 3_000_000, pitch: -65 },
  { height: 8_000_000, pitch: -5 },
  { height: 8_000_000, pitch: -20 },
  { height: 8_000_000, pitch: -75 }
]

test('centred views keep the lesson target at the centre of the view', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const view = sceneCameraView(camera, true)
  const angles = anglesFrom(view.destination, lessonTarget(camera))
  const pitch = Cesium.Math.toDegrees(view.orientation.pitch)
  const heading = Cesium.Math.toDegrees(view.orientation.heading)
  assert.ok(Math.abs(angles.pitch - pitch) < 0.1, `目标应位于画面中心，实际俯仰偏差 ${(angles.pitch - pitch).toFixed(3)}°`)
  assert.ok(Math.abs(shortestAngle(angles.heading, heading)) < 0.1, `目标应位于画面中心，实际朝向偏差 ${shortestAngle(angles.heading, heading).toFixed(3)}°`)
  assert.equal(view.pitchClamped, false)
  assert.ok(Math.abs(pitch - camera.pitch) < 0.5, `可行时俯角应接近请求值，实际 ${pitch.toFixed(2)}°`)
  assert.ok(Math.abs(shortestAngle(heading, camera.heading)) < 2, `可行时朝向应接近请求值，实际 ${heading.toFixed(2)}°`)
})

test('centred views honour or clamp the requested pitch across orbits so the target stays visible', () => {
  for (const { height, pitch } of ORBIT_PITCH_CASES) {
    const camera = { longitude: 105, latitude: 35, height, heading: 30, pitch }
    const target = lessonTarget(camera)
    const radius = Cesium.Cartesian3.magnitude(target)
    const view = sceneCameraView(camera, true)
    const angles = anglesFrom(view.destination, target)
    const downward = -Cesium.Math.toDegrees(view.orientation.pitch)
    const heading = Cesium.Math.toDegrees(view.orientation.heading)
    const scope = `h=${height} pitch=${pitch}`
    assert.ok(Math.abs(angles.pitch + downward) < 0.1, `${scope}: 目标应在画面中心，实际 ${angles.pitch.toFixed(3)}°`)
    assert.ok(Math.abs(shortestAngle(angles.heading, heading)) < 0.1, `${scope}: 目标应在画面中心，实际 ${angles.heading.toFixed(3)}°`)
    assert.ok(Math.abs(Cesium.Cartesian3.magnitude(view.destination) - (radius + height)) < 1, `${scope}: 机位应位于请求高度的轨道上`)
    assert.ok(Math.abs(shortestAngle(anglesFrom(target, view.destination).heading, camera.heading + 180)) < 0.5, `${scope}: 机位应位于请求方位的反向延伸线上`)
    assert.ok(nearestEarthDistance(view.destination, target) >= radius * 0.999, `${scope}: 目标视线不应被地球遮挡`)
    const horizon = Cesium.Math.toDegrees(Math.acos(radius / (radius + height)))
    if (view.pitchClamped) {
      assert.ok(Math.abs(downward - horizon) < 0.5, `${scope}: 钳制俯角应贴合该高度的地平上限 ${horizon.toFixed(2)}°，实际 ${downward.toFixed(2)}°`)
      assert.ok(downward >= -pitch, `${scope}: 钳制只允许更陡的俯角`)
    } else {
      assert.ok(Math.abs(downward + pitch) < 0.5, `${scope}: 可行时俯角应接近请求值，实际 ${downward.toFixed(2)}°`)
    }
    assert.ok(Math.abs(shortestAngle(heading, camera.heading)) < 7, `${scope}: 朝向应保持在大圆收敛范围内，实际 ${heading.toFixed(2)}°`)
  }
})

test('shallow pitches over high orbits curve the camera to the horizon instead of past it', () => {
  const camera = { longitude: 105, latitude: 35, height: 8_000_000, heading: 30, pitch: -20 }
  const target = lessonTarget(camera)
  const radius = Cesium.Cartesian3.magnitude(target)
  const horizon = Cesium.Math.toDegrees(Math.acos(radius / (radius + camera.height)))
  const view = sceneCameraView(camera, true)
  const angles = anglesFrom(view.destination, target)
  const downward = -Cesium.Math.toDegrees(view.orientation.pitch)
  assert.equal(view.pitchClamped, true)
  assert.ok(Math.abs(downward - horizon) < 0.5, `俯角应贴合该高度的地平上限 ${horizon.toFixed(2)}°，实际 ${downward.toFixed(2)}°`)
  assert.ok(Math.abs(angles.pitch + downward) < 0.1, '钳制后目标仍应在画面中心')
  assert.ok(nearestEarthDistance(view.destination, target) >= radius * 0.999, '钳制后视线应擦过地球而非穿出画面')
})

test('without centring the target falls far outside the view centre', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const angles = anglesFrom(sceneCameraView(camera, false).destination, lessonTarget(camera))
  assert.ok(Math.abs(angles.pitch + 90) < 0.5, `未居中时目标应在正下方（-90°），实际 ${angles.pitch.toFixed(2)}°`)
  assert.ok(Math.abs(angles.pitch - camera.pitch) > 25, '未居中时目标应远离画面中心')
})

test('non-centred destination keeps the camera exactly above the point', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 30, pitch: -60 }
  const grounded = sceneCameraView(camera, false).destination
  const expected = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height)
  assert.ok(Cesium.Cartesian3.equalsEpsilon(expected, grounded, 0.001))
})

test('centred camera keeps the requested altitude above the surface', () => {
  const camera = { longitude: 105, latitude: 35, height: 600_000, heading: 0, pitch: -45 }
  const carto = Cesium.Cartographic.fromCartesian(sceneCameraView(camera, true).destination)
  assert.ok(Math.abs(carto.height - camera.height) < camera.height * 0.05, `高度应接近请求值，实际 ${Math.round(carto.height)} 米`)
})

test('a nearly vertical pitch does not collapse the centred offset', () => {
  const camera = { longitude: 0, latitude: 0, height: 100_000, heading: 0, pitch: -89.9 }
  const distance = Cesium.Cartesian3.distance(sceneCameraView(camera, true).destination, lessonTarget(camera))
  assert.ok(Number.isFinite(distance))
  assert.ok(distance < 120_000, `俯视时应几乎位于目标点上空，实际距离 ${Math.round(distance)} 米`)
})

test('orientation converts degrees to radians for the given camera', () => {
  const orientation = sceneCameraView({ longitude: 0, latitude: 0, height: 10_000, heading: 90, pitch: -45 }, false).orientation
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
