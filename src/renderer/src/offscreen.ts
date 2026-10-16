import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { OffscreenRecordingScript, SceneCamera, TeachingScene } from '../../preload'
import { createBasemapImageryProvider } from './composables/basemapImagery'
import { createApp, h, shallowRef } from 'vue'
import { createPinia } from 'pinia'
import { useClimateStore, thematicLayerCatalog } from './stores/climate'
import { useSolarStore } from './stores/solar'
import { useThematicLayers } from './composables/useThematicLayers'
import { terrainRegistry } from './terrain/terrainRegistry'
import WindParticles from './components/WindParticles.vue'
import FrontalCyclone from './components/FrontalCyclone.vue'
import TyphoonOverlay from './components/TyphoonOverlay.vue'
import WalkerCirculationOverlay from './components/WalkerCirculationOverlay.vue'
import HuLineOverlay from './components/HuLineOverlay.vue'

const container = document.getElementById('cesium-container')
if (!container) throw new Error('Offscreen Cesium 容器不存在')

const overlayLayer = document.getElementById('recording-overlays')
if (!overlayLayer) throw new Error('Offscreen 叠加层容器不存在')

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

const offscreenPinia = createPinia()
const offscreenViewer = shallowRef(viewer)
createApp({
  setup() {
    useThematicLayers(offscreenViewer)
    const climate = useClimateStore()
    return () => [
      climate.overlays['wind-particles'] ? h(WindParticles, { viewer }) : null,
      climate.overlays['frontal-cyclone'] ? h(FrontalCyclone, { viewer }) : null,
      climate.overlays['typhoon'] ? h(TyphoonOverlay, { viewer }) : null,
      climate.overlays['enso'] ? h(WalkerCirculationOverlay, { viewer, phase: climate.ensoPhase }) : null,
      climate.overlays['hu-line'] ? h(HuLineOverlay, { viewer }) : null
    ]
  }
}).use(offscreenPinia).mount(overlayLayer)
const climateStore = useClimateStore(offscreenPinia)
const solarStore = useSolarStore(offscreenPinia)

const imageryLayers = new Map<string, Cesium.ImageryLayer>()
let visibleAnnotations: Cesium.Entity[] = []
const overlayCanvas = document.getElementById('recording-overlay') as HTMLCanvasElement | null
const overlayContext = overlayCanvas?.getContext('2d') ?? null
const OFFSCREEN_PREPARE_TILE_TIMEOUT_MS = 15000
const OFFSCREEN_STABLE_SURFACE_MS = 400
let currentTitle = ''
let currentNarration = ''

function resizeOverlay(): void {
  if (!overlayCanvas) return
  const width = Math.max(2, viewer.canvas.clientWidth || window.innerWidth)
  const height = Math.max(2, viewer.canvas.clientHeight || window.innerHeight)
  if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
    overlayCanvas.width = width
    overlayCanvas.height = height
  }
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\\n') {
      lines.push(line)
      line = ''
      continue
    }
    const candidate = line + character
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = character
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

function drawOverlay(): void {
  resizeOverlay()
  if (!overlayContext || !overlayCanvas) return
  const { width, height } = overlayCanvas
  overlayContext.clearRect(0, 0, width, height)
  if (currentTitle) {
    const size = Math.max(18, Math.round(height * 0.026))
    overlayContext.font = `600 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
    overlayContext.textBaseline = 'top'
    overlayContext.textAlign = 'left'
    overlayContext.lineWidth = Math.max(3, size * 0.16)
    overlayContext.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    overlayContext.fillStyle = 'rgba(255, 255, 255, 0.95)'
    overlayContext.strokeText(currentTitle, width * 0.04, height * 0.045)
    overlayContext.fillText(currentTitle, width * 0.04, height * 0.045)
  }
  if (!currentNarration) return
  const size = Math.max(22, Math.round(height * 0.036))
  overlayContext.font = `600 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
  overlayContext.textBaseline = 'bottom'
  overlayContext.textAlign = 'center'
  const lines = wrapText(overlayContext, currentNarration, width * 0.82)
  const lineHeight = size * 1.4
  const boxHeight = lines.length * lineHeight + size * 0.7
  const boxTop = height - height * 0.05 - boxHeight
  const gradient = overlayContext.createLinearGradient(0, boxTop - lineHeight, 0, height)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.62)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.72)')
  overlayContext.fillStyle = gradient
  overlayContext.fillRect(0, boxTop - lineHeight, width, height - boxTop + lineHeight)
  overlayContext.lineWidth = Math.max(3, size * 0.14)
  overlayContext.strokeStyle = 'rgba(0, 0, 0, 0.85)'
  overlayContext.fillStyle = 'rgba(255, 255, 255, 0.97)'
  lines.forEach((line, index) => {
    const y = boxTop + (index + 1) * lineHeight
    overlayContext.strokeText(line, width / 2, y)
    overlayContext.fillText(line, width / 2, y)
  })
}

function clearAnnotations(): void {
  for (const entity of visibleAnnotations) viewer.entities.remove(entity)
  visibleAnnotations = []
}

function addAnnotations(script: OffscreenRecordingScript, sceneId: string): void {
  clearAnnotations()
  const entities: Cesium.Entity[] = []
  for (const annotation of script.annotations.filter((entry) => entry.sceneId === sceneId)) {
    const positions = annotation.positions.map((position) => Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude, position.height))
    if (annotation.kind === 'point') {
      entities.push(viewer.entities.add({
        position: positions[0],
        point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: annotation.name, font: '600 16px Microsoft YaHei', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }
      }))
    } else if (positions.length > 1) {
      const entity = annotation.kind === 'polygon'
        ? viewer.entities.add({ polygon: { hierarchy: new Cesium.PolygonHierarchy(positions), material: Cesium.Color.CYAN.withAlpha(0.3), outline: true, outlineColor: Cesium.Color.CYAN }, label: { text: annotation.name, font: '600 16px Microsoft YaHei', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY }, position: positions[0] })
        : viewer.entities.add({ polyline: { positions, width: 5, material: Cesium.Color.YELLOW, clampToGround: true }, label: { text: annotation.name, font: '600 16px Microsoft YaHei', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY }, position: positions[0] })
      entities.push(entity)
    }
  }
  visibleAnnotations = entities
}

async function delay(ms: number): Promise<void> {
  const deadline = Date.now() + Math.max(0, ms)
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(200, remaining)))
  }
}

async function applySnapshot(snapshot: TeachingScene['snapshot']): Promise<void> {
  const basemapId = snapshot.basemapId || 'osm'
  if (!imageryLayers.has(basemapId)) {
    try {
      const provider = createBasemapImageryProvider(basemapId, 'standard')
      imageryLayers.set(basemapId, viewer.imageryLayers.addImageryProvider(provider, 0))
    } catch {
      return
    }
  }
  imageryLayers.forEach((layer, id) => { layer.show = id === basemapId })
  for (const layer of thematicLayerCatalog) {
    climateStore.setOverlay(layer.id, snapshot.overlays.includes(layer.id))
  }
  climateStore.setMonth(snapshot.month)
  if (snapshot.simTime) {
    solarStore.setDate(snapshot.simTime.date)
    solarStore.setHour(snapshot.simTime.hour)
    solarStore.setActive(true)
  } else {
    solarStore.setActive(false)
  }
  solarStore.setMotionPanel(snapshot.motionPanel as Parameters<typeof solarStore.setMotionPanel>[0] ?? null)
  viewer.scene.requestRender()
}

function applySceneState(snapshot: TeachingScene['snapshot']): void {
  viewer.scene.globe.enableLighting = snapshot.simTime !== null
  if (snapshot.simTime) viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(solarStore.utcMs))
  viewer.scene.requestRender()
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

async function applyTerrain(terrain: OffscreenRecordingScript['terrain']): Promise<void> {
  const create = terrainRegistry[terrain.providerId] ?? terrainRegistry.ellipsoid
  try {
    viewer.terrainProvider = await create()
  } catch {
    viewer.terrainProvider = await terrainRegistry.ellipsoid()
  }
  viewer.scene.verticalExaggeration = Math.min(5, Math.max(1, terrain.exaggeration))
  viewer.scene.requestRender()
}

async function waitTilesLoaded(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let stableSince = 0
  while (Date.now() < deadline) {
    viewer.scene.requestRender()
    await delay(120)
    if (viewer.scene.globe.tilesLoaded) {
      if (!stableSince) stableSince = Date.now()
      if (Date.now() - stableSince >= OFFSCREEN_STABLE_SURFACE_MS) return
    } else {
      stableSince = 0
    }
  }
}

async function prepare(script: OffscreenRecordingScript): Promise<void> {
  document.title = script.title || 'GuEarth Offscreen Recorder'
  viewer.resize()
  const first = script.scenes[0]
  if (first) {
    currentTitle = script.title
    currentNarration = first.narration
    applySceneState(first.snapshot)
    setCamera(first.snapshot.camera)
    drawOverlay()
  }
  await applyTerrain(script.terrain)
  if (first) {
    await applySnapshot(first.snapshot)
    applySceneState(first.snapshot)
    addAnnotations(script, first.id)
    setCamera(first.snapshot.camera)
    drawOverlay()
  }
  viewer.scene.requestRender()
  await waitTilesLoaded(OFFSCREEN_PREPARE_TILE_TIMEOUT_MS)
}

async function play(script: OffscreenRecordingScript): Promise<void> {
  document.title = script.title || 'GuEarth Offscreen Recorder'
  viewer.resize()
  for (let index = 0; index < script.scenes.length; index += 1) {
    const scene = script.scenes[index]
    window.guEarth?.recordings?.offscreenProgress?.({ sceneIndex: index, totalScenes: script.scenes.length })
    currentTitle = script.title
    currentNarration = scene.narration
    await applySnapshot(scene.snapshot)
    applySceneState(scene.snapshot)
    addAnnotations(script, scene.id)
    drawOverlay()
    viewer.scene.requestRender()
    if (index === 0) {
      setCamera(scene.snapshot.camera)
    } else {
      await flyCamera(scene.snapshot.camera, scene.flyDurationMs)
    }
    drawOverlay()
    await delay(Math.max(0, scene.dwellMs))
  }
  currentNarration = ''
  drawOverlay()
}

viewer.scene.backgroundColor = Cesium.Color.BLACK
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(105, 35, 15_000_000) })
window.addEventListener('beforeunload', () => viewer.destroy())

Object.assign(window, { guEarthOffscreenRecorder: { play, prepare } })
