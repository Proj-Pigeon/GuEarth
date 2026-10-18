import * as Cesium from 'cesium'
import type { OffscreenPrewarmQuality, SceneCamera, TeachingScene } from '../../../preload'

export interface PrewarmView {
  camera: SceneCamera
  sceneIndex: number
}

export const RECORD_PREWARM_QUALITY_CONFIG: Record<OffscreenPrewarmQuality, { screenSpaceError: number; viewTimeoutMs: number; totalTimeoutMs: number }> = {
  standard: { screenSpaceError: 4, viewTimeoutMs: 4_000, totalTimeoutMs: 24_000 },
  high: { screenSpaceError: 1, viewTimeoutMs: 6_000, totalTimeoutMs: 30_000 },
  ultra: { screenSpaceError: 0.5, viewTimeoutMs: 10_000, totalTimeoutMs: 45_000 }
}

const MIN_CAMERA_HEIGHT = 1000
const MAX_CAMERA_HEIGHT = 20_000_000

export function sanitizeCamera(camera: SceneCamera): SceneCamera {
  const clampNumber = (value: number, min: number, max: number, fallback: number): number =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  return {
    longitude: clampNumber(camera.longitude, -180, 180, 105),
    latitude: clampNumber(camera.latitude, -90, 90, 35),
    height: clampNumber(camera.height, MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT, 8_000_000),
    heading: Number.isFinite(camera.heading) ? ((camera.heading % 360) + 360) % 360 : 0,
    pitch: clampNumber(camera.pitch, -89.9, 89.9, -90)
  }
}

export function interpolateCamera(start: SceneCamera, end: SceneCamera, amount: number): SceneCamera {
  const normalizedAmount = Math.min(1, Math.max(0, amount))
  const lerp = (a: number, b: number): number => a + (b - a) * normalizedAmount
  const lerpAngle = (a: number, b: number): number => a + (((b - a + 540) % 360) - 180) * normalizedAmount
  return sanitizeCamera({
    longitude: ((lerpAngle(start.longitude, end.longitude) + 540) % 360) - 180,
    latitude: lerp(start.latitude, end.latitude),
    height: Math.exp(lerp(Math.log(Math.max(MIN_CAMERA_HEIGHT, start.height)), Math.log(Math.max(MIN_CAMERA_HEIGHT, end.height)))),
    heading: lerpAngle(start.heading, end.heading),
    pitch: lerp(start.pitch, end.pitch)
  })
}

export function recordingPrewarmViews(scenes: TeachingScene[]): PrewarmView[] {
  const views: PrewarmView[] = []
  for (let index = 0; index < scenes.length; index += 1) {
    const camera = sanitizeCamera(scenes[index].snapshot.camera)
    if (index > 0) views.push({ camera: interpolateCamera(sanitizeCamera(scenes[index - 1].snapshot.camera), camera, 0.5), sceneIndex: index })
    views.push({ camera, sceneIndex: index })
  }
  return views
}

export interface SceneCameraView {
  destination: Cesium.Cartesian3
  orientation: { heading: number; pitch: number; roll: number }
  pitchClamped: boolean
}

export function sceneCameraView(rawCamera: SceneCamera, centerTarget: boolean): SceneCameraView {
  const camera = sanitizeCamera(rawCamera)
  if (!centerTarget) {
    return {
      destination: Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height),
      orientation: { heading: Cesium.Math.toRadians(camera.heading), pitch: Cesium.Math.toRadians(camera.pitch), roll: 0 },
      pitchClamped: false
    }
  }
  const target = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0)
  const radius = Cesium.Cartesian3.magnitude(target)
  const orbit = radius + camera.height
  const horizon = Math.acos(radius / orbit)
  const requested = Cesium.Math.toRadians(-camera.pitch)
  const downward = Math.max(requested, horizon)
  const heading = Cesium.Math.toRadians(camera.heading)
  const cosSquared = Math.cos(downward) * Math.cos(downward)
  const reach = Math.max(0, radius * radius - cosSquared * orbit * orbit)
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target)
  const east = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian4())
  const north = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian4())
  const up = Cesium.Cartesian3.normalize(target, new Cesium.Cartesian3())
  const approach = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(
    -Math.sin(heading) * east.x - Math.cos(heading) * north.x,
    -Math.sin(heading) * east.y - Math.cos(heading) * north.y,
    -Math.sin(heading) * east.z - Math.cos(heading) * north.z
  ), new Cesium.Cartesian3())
  const rise = Cesium.Cartesian3.dot(approach, up)
  const axis = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(
    approach.x - rise * up.x,
    approach.y - rise * up.y,
    approach.z - rise * up.z
  ), new Cesium.Cartesian3())
  const separation = Math.acos(Math.min(1, (cosSquared * orbit + Math.sqrt((1 - cosSquared) * reach)) / radius))
  const destination = Cesium.Cartesian3.multiplyByScalar(new Cesium.Cartesian3(
    Math.cos(separation) * up.x + Math.sin(separation) * axis.x,
    Math.cos(separation) * up.y + Math.sin(separation) * axis.y,
    Math.cos(separation) * up.z + Math.sin(separation) * axis.z
  ), orbit, new Cesium.Cartesian3())
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(destination)
  const local = Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4()), target, new Cesium.Cartesian3())
  return {
    destination,
    orientation: {
      heading: Math.atan2(local.x, local.y),
      pitch: Math.atan2(local.z, Math.hypot(local.x, local.y)),
      roll: 0
    },
    pitchClamped: downward > requested
  }
}
