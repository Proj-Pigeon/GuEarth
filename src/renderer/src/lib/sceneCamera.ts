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
const MIN_CENTER_PITCH_DEGREES = 5

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

export function sceneCameraDestination(rawCamera: SceneCamera, centerTarget: boolean): Cesium.Cartesian3 {
  const camera = sanitizeCamera(rawCamera)
  if (!centerTarget) return Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height)
  const downward = Math.max(Cesium.Math.toRadians(MIN_CENTER_PITCH_DEGREES), -Cesium.Math.toRadians(camera.pitch))
  const horizontal = camera.height / Math.tan(downward)
  const heading = Cesium.Math.toRadians(camera.heading)
  const offset = new Cesium.Cartesian3(-horizontal * Math.sin(heading), -horizontal * Math.cos(heading), camera.height)
  const target = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0)
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target)
  return Cesium.Matrix4.multiplyByPoint(enu, offset, new Cesium.Cartesian3())
}

export function sceneCameraOrientation(rawCamera: SceneCamera): { heading: number; pitch: number; roll: number } {
  const camera = sanitizeCamera(rawCamera)
  return {
    heading: Cesium.Math.toRadians(camera.heading),
    pitch: Cesium.Math.toRadians(camera.pitch),
    roll: 0
  }
}
