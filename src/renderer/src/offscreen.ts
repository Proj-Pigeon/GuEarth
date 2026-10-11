import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { OffscreenRecordingScript, SceneCamera } from '../../preload'

const container = document.getElementById('cesium-container')
if (!container) throw new Error('Offscreen Cesium 容器不存在')

const viewer = new Cesium.Viewer(container, {
  baseLayer: false,
  baseLayerPicker: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  geocoder: false,
  animation: false,
  timeline: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  homeButton: false,
  infoBox: false,
  selectionIndicator: false,
  requestRenderMode: false,
  useBrowserRecommendedResolution: true,
  contextOptions: { webgl: { preserveDrawingBuffer: true } }
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cameraDestination(camera: SceneCamera): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height)
}

function cameraOrientation(camera: SceneCamera): { heading: number; pitch: number; roll: number } {
  return {
    heading: Cesium.Math.toRadians(camera.heading),
    pitch: Cesium.Math.toRadians(camera.pitch),
    roll: 0
  }
}

function setCamera(camera: SceneCamera): void {
  viewer.camera.setView({ destination: cameraDestination(camera), orientation: cameraOrientation(camera) })
}

function flyCamera(camera: SceneCamera, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: cameraDestination(camera),
      orientation: cameraOrientation(camera),
      duration: Math.max(0.1, durationMs / 1000),
      complete: () => resolve(),
      cancel: () => resolve()
    })
  })
}

async function play(script: OffscreenRecordingScript): Promise<void> {
  document.title = script.title || 'GuEarth Offscreen Recorder'
  viewer.resize()
  for (let index = 0; index < script.scenes.length; index += 1) {
    const scene = script.scenes[index]
    if (index === 0) {
      setCamera(scene.snapshot.camera)
    } else {
      await flyCamera(scene.snapshot.camera, scene.flyDurationMs)
    }
    await delay(Math.max(0, scene.dwellMs))
  }
}

viewer.scene.backgroundColor = Cesium.Color.BLACK
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(105, 35, 15_000_000) })
window.addEventListener('beforeunload', () => viewer.destroy())

Object.assign(window, { guEarthOffscreenRecorder: { play } })
