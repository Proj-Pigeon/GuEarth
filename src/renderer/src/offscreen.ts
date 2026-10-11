import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

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

viewer.scene.backgroundColor = Cesium.Color.BLACK
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(105, 35, 15_000_000) })
window.addEventListener('beforeunload', () => viewer.destroy())
