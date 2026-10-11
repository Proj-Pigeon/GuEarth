import { reactive, watch, type Ref } from 'vue'
import * as Cesium from 'cesium'
import type { RecordingSaveResult, SceneCamera, SceneSimTime, SceneSnapshot, TeachingScene } from '../../../preload'
import { useGlobeStore } from '@renderer/stores/globe'
import { useClimateStore, thematicLayerCatalog } from '@renderer/stores/climate'
import { useSolarStore, type MotionPanel } from '@renderer/stores/solar'
import { useDrawingStore, DEFAULT_DRAW_STYLE, type GeoPosition } from '@renderer/stores/drawing'
import { useScenesStore, type RecordingPrewarmQuality } from '@renderer/stores/scenes'
import { createVideoRecorder, type RecorderOverlay } from './useVideoRecorder'

export interface RecordingMarker {
  name: string
  longitude: number
  latitude: number
}

export interface RecordingShape {
  kind: 'polyline' | 'polygon'
  name: string
  positions: GeoPosition[]
}

export interface RecordingStep {
  name: string
  narration: string
  camera: SceneCamera
  basemapId: string
  overlays: string[]
  month: number
  simTime: SceneSimTime | null
  dwellMs: number
  flyDurationMs: number
  markers: RecordingMarker[]
  shapes: RecordingShape[]
}

export interface PlayerState {
  active: boolean
  prewarming: boolean
  prewarmIndex: number
  prewarmTotal: number
  title: string
  sceneName: string
  narration: string
  currentIndex: number
  total: number
  mode: 'manual' | 'auto'
  recording: boolean
}

const PREWARM_TILE_TIMEOUT_MS = 10_000
const PLAY_TILE_TIMEOUT_MS = 10_000
const RECORD_TILE_TIMEOUT_MS = 18_000
const RECORD_PREWARM_QUALITY_CONFIG: Record<RecordingPrewarmQuality, { screenSpaceError: number; viewTimeoutMs: number; totalTimeoutMs: number }> = {
  standard: { screenSpaceError: 4, viewTimeoutMs: 4_000, totalTimeoutMs: 24_000 },
  high: { screenSpaceError: 1, viewTimeoutMs: 6_000, totalTimeoutMs: 30_000 },
  ultra: { screenSpaceError: 0.5, viewTimeoutMs: 10_000, totalTimeoutMs: 45_000 }
}
const MORPH_TIMEOUT_MS = 5_000
const BASEMAP_SETTLE_MS = 500
const STATE_SETTLE_MS = 250
const PREWARM_HOLD_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizedHeadingDegrees(radians: number): number {
  if (!Number.isFinite(radians)) return 0
  const degrees = Cesium.Math.toDegrees(radians) % 360
  return degrees < 0 ? degrees + 360 : degrees
}

function sanitizeCamera(camera: SceneCamera): SceneCamera {
  const clampNumber = (value: number, min: number, max: number, fallback: number): number =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  return {
    longitude: clampNumber(camera.longitude, -180, 180, 105),
    latitude: clampNumber(camera.latitude, -90, 90, 35),
    height: clampNumber(camera.height, 1000, 20000000, 8000000),
    heading: Number.isFinite(camera.heading) ? ((camera.heading % 360) + 360) % 360 : 0,
    pitch: clampNumber(camera.pitch, -89.9, 89.9, -90)
  }
}

function cameraDestination(camera: SceneCamera, centerTarget: boolean): Cesium.Cartesian3 {
  if (!centerTarget) return Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height)
  const downward = Math.max(Cesium.Math.toRadians(5), -Cesium.Math.toRadians(camera.pitch))
  const horizontal = camera.height / Math.tan(downward)
  const heading = Cesium.Math.toRadians(camera.heading)
  const offset = new Cesium.Cartesian3(-horizontal * Math.sin(heading), -horizontal * Math.cos(heading), camera.height)
  const target = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 0)
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target)
  return Cesium.Matrix4.multiplyByPoint(enu, offset, new Cesium.Cartesian3())
}

function cameraOrientation(camera: SceneCamera): { heading: number; pitch: number; roll: number } {
  return {
    heading: Cesium.Math.toRadians(camera.heading),
    pitch: Cesium.Math.toRadians(camera.pitch),
    roll: 0
  }
}

export function interpolateCamera(start: SceneCamera, end: SceneCamera, amount: number): SceneCamera {
  const normalizedAmount = Math.min(1, Math.max(0, amount))
  const lerp = (a: number, b: number): number => a + (b - a) * normalizedAmount
  const lerpAngle = (a: number, b: number): number => a + (((b - a + 540) % 360) - 180) * normalizedAmount
  return sanitizeCamera({
    longitude: ((lerpAngle(start.longitude, end.longitude) + 540) % 360) - 180,
    latitude: lerp(start.latitude, end.latitude),
    height: Math.exp(lerp(Math.log(Math.max(1000, start.height)), Math.log(Math.max(1000, end.height)))),
    heading: lerpAngle(start.heading, end.heading),
    pitch: lerp(start.pitch, end.pitch)
  })
}

interface RecordingPrewarmView {
  camera: SceneCamera
  sceneIndex: number
}

function recordingPrewarmViews(scenes: TeachingScene[]): RecordingPrewarmView[] {
  const views: RecordingPrewarmView[] = []
  for (let index = 0; index < scenes.length; index += 1) {
    const camera = sanitizeCamera(scenes[index].snapshot.camera)
    if (index > 0) views.push({ camera: interpolateCamera(sanitizeCamera(scenes[index - 1].snapshot.camera), camera, 0.5), sceneIndex: index })
    views.push({ camera, sceneIndex: index })
  }
  return views
}

let runId = 0
let activeRun: (() => void) | null = null

export function useScenePlayer(viewer: Ref<Cesium.Viewer | undefined>, switchBasemap: (id: string) => void) {
  const globeStore = useGlobeStore()
  const climateStore = useClimateStore()
  const solarStore = useSolarStore()
  const drawingStore = useDrawingStore()
  const scenesStore = useScenesStore()
  const recorder = createVideoRecorder()

  const playerState = reactive<PlayerState>({
    active: false,
    prewarming: false,
    prewarmIndex: 0,
    prewarmTotal: 0,
    title: '',
    sceneName: '',
    narration: '',
    currentIndex: -1,
    total: 0,
    mode: 'manual',
    recording: false
  })

  let aborted = false
  let recordingQualityRevision = 0
  let advanceResolver: (() => void) | null = null
  let advanceTimer: ReturnType<typeof setTimeout> | undefined

  function clearAdvance(): void {
    if (advanceTimer !== undefined) {
      clearTimeout(advanceTimer)
      advanceTimer = undefined
    }
  }

  function next(): void {
    advanceResolver?.()
  }

  function stop(): void {
    activeRun?.()
  }

  function waitAdvance(timeoutMs: number | null): Promise<void> {
    clearAdvance()
    return new Promise((resolve) => {
      advanceResolver = () => {
        advanceResolver = null
        clearAdvance()
        resolve()
      }
      if (timeoutMs !== null) advanceTimer = setTimeout(() => advanceResolver?.(), timeoutMs)
    })
  }

  function captureSnapshot(): SceneSnapshot {
    const current = viewer.value
    if (!current || current.isDestroyed()) throw new Error('地球尚未就绪')
    if (current.scene.mode !== Cesium.SceneMode.SCENE3D) throw new Error('请先切换到 3D 视图再保存场景')
    const cartographic = current.camera.positionCartographic
    if (!Number.isFinite(cartographic.longitude) || !Number.isFinite(cartographic.latitude) || !Number.isFinite(cartographic.height)) throw new Error('当前视角无效，无法保存场景')
    return {
      camera: sanitizeCamera({
        longitude: Cesium.Math.toDegrees(cartographic.longitude),
        latitude: Cesium.Math.toDegrees(cartographic.latitude),
        height: cartographic.height,
        heading: normalizedHeadingDegrees(current.camera.heading),
        pitch: Cesium.Math.toDegrees(current.camera.pitch)
      }),
      basemapId: globeStore.selectedLayerId,
      overlays: thematicLayerCatalog.filter((layer) => climateStore.overlays[layer.id]).map((layer) => layer.id),
      month: climateStore.month,
      simTime: solarStore.active ? { date: solarStore.date, hour: solarStore.hour } : null,
      motionPanel: solarStore.motionPanel
    }
  }

  function captureScene(name: string, narration: string, dwellMs = 6000, flyDurationMs = 3500): Omit<TeachingScene, 'createdAt'> {
    return {
      id: crypto.randomUUID(),
      name,
      narration,
      dwellMs,
      flyDurationMs,
      snapshot: captureSnapshot()
    }
  }

  function applySnapshot(snapshot: SceneSnapshot): void {
    if (snapshot.basemapId && snapshot.basemapId !== globeStore.selectedLayerId) switchBasemap(snapshot.basemapId)
    for (const layer of thematicLayerCatalog) {
      const enabled = snapshot.overlays.includes(layer.id)
      if (climateStore.overlays[layer.id] !== enabled) climateStore.setOverlay(layer.id, enabled)
    }
    if (snapshot.month !== climateStore.month) {
      climateStore.setMonth(snapshot.month)
      climateStore.isPlaying = false
    }
    if (snapshot.simTime) {
      solarStore.setDate(snapshot.simTime.date)
      solarStore.setHour(snapshot.simTime.hour)
      solarStore.isPlaying = false
      solarStore.isAnnualPlaying = false
      solarStore.setActive(true)
    } else if (solarStore.active) {
      solarStore.setActive(false)
    }
    const motionPanel = (snapshot.motionPanel ?? null) as MotionPanel | null
    if (solarStore.motionPanel !== motionPanel) solarStore.setMotionPanel(motionPanel)
  }

  function flyCamera(rawCamera: SceneCamera, durationSeconds: number, centerTarget = false): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return Promise.resolve()
    const camera = sanitizeCamera(rawCamera)
    return new Promise((resolve) => {
      current.camera.flyTo({
        destination: cameraDestination(camera, centerTarget),
        orientation: cameraOrientation(camera),
        duration: Math.max(0.1, durationSeconds),
        complete: () => resolve(),
        cancel: () => resolve()
      })
    })
  }

  function setCameraView(rawCamera: SceneCamera, centerTarget = false): void {
    const current = viewer.value
    if (!current || current.isDestroyed() || current.scene.mode !== Cesium.SceneMode.SCENE3D) return
    const camera = sanitizeCamera(rawCamera)
    current.camera.setView({
      destination: cameraDestination(camera, centerTarget),
      orientation: cameraOrientation(camera)
    })
  }

  function requestSceneRender(): void {
    const current = viewer.value
    if (!current || current.isDestroyed()) return
    current.scene.requestRender()
  }

  function recordingQualityConfig(): { screenSpaceError: number; viewTimeoutMs: number; totalTimeoutMs: number } {
    return RECORD_PREWARM_QUALITY_CONFIG[scenesStore.recording.prewarmQuality] ?? RECORD_PREWARM_QUALITY_CONFIG.high
  }

  function withRecordingDetailBias<T>(enabled: boolean, task: () => Promise<T>): Promise<T> {
    const current = viewer.value
    if (!enabled || !current || current.isDestroyed()) return task()
    const globe = current.scene.globe
    const originalMaximumScreenSpaceError = globe.maximumScreenSpaceError
    const stopWatching = watch(() => scenesStore.recording.prewarmQuality, () => {
      if (current.isDestroyed()) return
      globe.maximumScreenSpaceError = recordingQualityConfig().screenSpaceError
      recordingQualityRevision += 1
      current.scene.requestRender()
    }, { immediate: true, flush: 'sync' })
    return task().finally(() => {
      stopWatching()
      if (!current.isDestroyed()) {
        globe.maximumScreenSpaceError = originalMaximumScreenSpaceError
        current.scene.requestRender()
      }
    })
  }

  function visibleSurfaceReady(): boolean {
    const current = viewer.value
    if (!current || current.isDestroyed()) return false
    return current.scene.globe.tilesLoaded
  }

  async function waitTilesLoaded(timeoutMs: number | (() => number), isCancelled?: () => boolean): Promise<boolean> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return false
    const start = Date.now()
    let stableSince = 0
    let qualityRevision = recordingQualityRevision
    while (typeof timeoutMs === 'function' ? timeoutMs() > 0 : Date.now() - start < timeoutMs) {
      if (isCancelled?.()) return false
      requestSceneRender()
      await delay(120)
      if (qualityRevision !== recordingQualityRevision) {
        qualityRevision = recordingQualityRevision
        stableSince = 0
      }
      if (visibleSurfaceReady()) {
        if (!stableSince) stableSince = Date.now()
        if (Date.now() - stableSince >= 500) return true
      } else {
        stableSince = 0
      }
    }
    return visibleSurfaceReady()
  }

  function ensureScene3D(): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return Promise.resolve()
    if (current.scene.mode === Cesium.SceneMode.SCENE3D) return Promise.resolve()
    return new Promise((resolve) => {
      const complete = (): void => {
        current.scene.morphComplete.removeEventListener(complete)
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(complete, MORPH_TIMEOUT_MS)
      current.scene.morphComplete.addEventListener(complete)
      current.scene.morphTo3D(1.0)
      globeStore.setSceneMode('3D')
    })
  }

  async function prewarm(scenes: TeachingScene[], id: number, centerTarget: boolean, recording: boolean): Promise<void> {
    playerState.prewarming = true
    try {
      await withRecordingDetailBias(recording, async () => {
        const views = recording ? recordingPrewarmViews(scenes) : scenes.map((scene, sceneIndex) => ({ camera: sanitizeCamera(scene.snapshot.camera), sceneIndex }))
        const totalStartedAt = Date.now()
        playerState.prewarmTotal = views.length
        scenesStore.setRecording({ prewarmStep: 0, prewarmTotal: recording ? views.length : 0, prewarmMessage: recording ? '正在预加载高清录制画面…' : '', prewarmTimedOut: false, skipPrewarm: false })
        for (let index = 0; index < views.length; index += 1) {
          if (aborted || runId !== id || scenesStore.recording.skipPrewarm) break
          const quality = recording ? recordingQualityConfig() : null
          const timedOut = recording && Date.now() - totalStartedAt >= (quality?.totalTimeoutMs ?? 24_000)
          if (timedOut) {
            scenesStore.setRecording({ prewarmTimedOut: true, prewarmMessage: '高清预加载等待超时，正在继续录制准备…' })
            break
          }
          playerState.prewarmIndex = index + 1
          const view = views[index]
          const snapshot = scenes[view.sceneIndex].snapshot
          const previousBasemapId = globeStore.selectedLayerId
          applySnapshot(snapshot)
          await delay(snapshot.basemapId && snapshot.basemapId !== previousBasemapId ? BASEMAP_SETTLE_MS : STATE_SETTLE_MS)
          setCameraView(view.camera, centerTarget)
          requestSceneRender()
          if (recording) scenesStore.setRecording({ prewarmStep: index + 1, prewarmMessage: `正在预加载高清录制画面 ${index + 1}/${views.length}` })
          const viewStartedAt = Date.now()
          const timeout = (): number => {
            if (!recording) return PREWARM_TILE_TIMEOUT_MS
            const selected = recordingQualityConfig()
            return Math.min(selected.viewTimeoutMs, Math.max(0, selected.totalTimeoutMs - (viewStartedAt - totalStartedAt)))
          }
          let loaded = false
          let qualityRevision: number
          do {
            qualityRevision = recordingQualityRevision
            loaded = await waitTilesLoaded(() => Math.max(0, timeout() - (Date.now() - viewStartedAt)), () => aborted || runId !== id || scenesStore.recording.skipPrewarm)
            if (aborted || runId !== id || scenesStore.recording.skipPrewarm) break
            await delay(PREWARM_HOLD_MS)
          } while (recording && qualityRevision !== recordingQualityRevision && !aborted && runId === id && !scenesStore.recording.skipPrewarm && Date.now() - viewStartedAt < timeout())
          if (recording && !loaded && !aborted && runId === id && !scenesStore.recording.skipPrewarm) scenesStore.setRecording({ prewarmTimedOut: true, prewarmMessage: '网络较慢，部分高清地图细节可能在录制中继续加载…' })
        }
      })
    } finally {
      playerState.prewarming = false
    }
  }

  function recorderOverlay(): RecorderOverlay {
    return { title: playerState.title, narration: playerState.narration }
  }

  async function saveRecording(cancelled: boolean): Promise<void> {
    scenesStore.setRecording({ state: 'saving', cancelled })
    try {
      const result: RecordingSaveResult | null = await recorder.stop()
      if (!result) {
        scenesStore.setRecording(cancelled ? { state: 'idle', cancelled: true } : { state: 'error', error: '未能生成视频数据' })
        return
      }
      scenesStore.applyRecordingResult(result)
    } catch (error) {
      scenesStore.setRecording({ state: 'error', error: error instanceof Error ? error.message : '视频保存失败' })
    }
  }

  async function play(options: { scenes: TeachingScene[]; mode: 'manual' | 'auto'; title?: string; recording?: { tempShapeIds: string[] }; centerTarget?: boolean }): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed() || !options.scenes.length) return
    if (playerState.active) return
    runId += 1
    const id = runId
    const centerTarget = Boolean(options.centerTarget)
    aborted = false
    playerState.active = true
    playerState.mode = options.mode
    playerState.title = options.title ?? ''
    playerState.total = options.scenes.length
    playerState.currentIndex = -1
    playerState.sceneName = ''
    playerState.narration = ''
    playerState.recording = Boolean(options.recording)
    scenesStore.setPresenting(true)
    const abort = (): void => {
      aborted = true
      next()
    }
    activeRun = abort
    try {
      await ensureScene3D()
      if (aborted || runId !== id) return
      if (options.recording) scenesStore.setRecording({ state: 'preparing', currentStep: 0, totalSteps: options.scenes.length, prewarmStep: 0, prewarmTotal: 0, prewarmMessage: '正在预加载录制画面…', prewarmTimedOut: false, skipPrewarm: false, videoPath: '', error: '', cancelled: false })
      await prewarm(options.scenes, id, centerTarget, Boolean(options.recording))
      if (options.recording && !aborted && runId === id) {
        const canvas = viewer.value?.scene.canvas
        if (!canvas) {
          scenesStore.setRecording({ state: 'error', error: '当前环境不支持视频录制' })
          playerState.recording = false
        } else {
          try {
            if (!await recorder.start(canvas, recorderOverlay)) {
              scenesStore.setRecording({ state: 'error', error: '当前环境不支持视频录制' })
              playerState.recording = false
            } else {
              recorder.pause()
              scenesStore.setRecording({ state: 'recording' })
            }
          } catch (error) {
            scenesStore.setRecording({ state: 'error', error: error instanceof Error ? error.message : '视频录制初始化失败' })
            playerState.recording = false
          }
        }
      }
      for (let index = 0; index < options.scenes.length; index += 1) {
        if (aborted || runId !== id) break
        const scene = options.scenes[index]
        playerState.currentIndex = index
        playerState.sceneName = scene.name
        applySnapshot(scene.snapshot)
        await delay(STATE_SETTLE_MS)
        if (playerState.recording) {
          if (index > 0) {
            recorder.resume()
            await flyCamera(scene.snapshot.camera, scene.flyDurationMs / 1000, centerTarget)
          } else {
            setCameraView(scene.snapshot.camera, centerTarget)
          }
          await waitTilesLoaded(RECORD_TILE_TIMEOUT_MS, () => aborted || runId !== id)
        } else {
          await flyCamera(scene.snapshot.camera, scene.flyDurationMs / 1000, centerTarget)
          if (aborted || runId !== id) break
          await waitTilesLoaded(PLAY_TILE_TIMEOUT_MS, () => aborted || runId !== id)
        }
        if (aborted || runId !== id) break
        playerState.narration = scene.narration
        if (playerState.recording) {
          scenesStore.setRecording({ currentStep: index + 1 })
          recorder.resume()
        }
        await waitAdvance(options.mode === 'auto' ? scene.dwellMs : null)
        if (playerState.recording) recorder.pause()
        playerState.narration = ''
      }
      if (playerState.recording && recorder.isStarted()) {
        await saveRecording(aborted)
      } else if (options.recording) {
        const state = scenesStore.recording.state
        if (state === 'preparing' || state === 'recording') scenesStore.setRecording({ state: 'idle' })
      }
    } finally {
      if (activeRun === abort) {
        activeRun = null
        scenesStore.setPresenting(false)
      }
      if (options.recording?.tempShapeIds.length) {
        for (const shapeId of options.recording.tempShapeIds) drawingStore.removeShape(shapeId)
      }
      playerState.active = false
      playerState.recording = false
    }
  }

  async function recordVideo(title: string, steps: RecordingStep[]): Promise<{ status: string; totalSteps: number; estimatedSeconds: number } | { error: string }> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return { error: '地球尚未就绪' }
    if (playerState.active) {
      stop()
      return { error: '正在结束上一次演示或录制，请稍候片刻后重试' }
    }
    if (typeof MediaRecorder === 'undefined') return { error: '当前环境不支持视频录制' }
    const scenes: TeachingScene[] = steps.map((step) => ({
      id: crypto.randomUUID(),
      name: step.name,
      narration: step.narration,
      dwellMs: step.dwellMs,
      flyDurationMs: step.flyDurationMs,
      snapshot: {
        camera: step.camera,
        basemapId: step.basemapId,
        overlays: step.overlays,
        month: step.month,
        simTime: step.simTime,
        motionPanel: null
      },
      createdAt: Date.now()
    }))
    const tempShapeIds: string[] = []
    for (const step of steps) {
      for (const marker of step.markers) {
        const id = crypto.randomUUID()
        drawingStore.addTransientShape({ ...DEFAULT_DRAW_STYLE, id, kind: 'point', positions: [{ longitude: marker.longitude, latitude: marker.latitude, height: 0 }], annotation: marker.name, createdAt: Date.now() })
        tempShapeIds.push(id)
      }
      for (const shape of step.shapes) {
        const id = crypto.randomUUID()
        drawingStore.addTransientShape({ ...DEFAULT_DRAW_STYLE, id, kind: shape.kind, positions: shape.positions, annotation: shape.name, createdAt: Date.now() })
        tempShapeIds.push(id)
      }
    }
    const estimatedSeconds = Math.round(scenes.reduce((total, scene) => total + scene.flyDurationMs / 1000 + scene.dwellMs / 1000, 0)) + 3
    void play({ scenes, mode: 'auto', title, recording: { tempShapeIds }, centerTarget: true })
    return { status: 'started', totalSteps: scenes.length, estimatedSeconds }
  }

  async function previewScene(scene: TeachingScene): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed() || playerState.active) return
    applySnapshot(scene.snapshot)
    await delay(STATE_SETTLE_MS)
    await flyCamera(scene.snapshot.camera, Math.min(scene.flyDurationMs / 1000, 2.5))
    await waitTilesLoaded(PLAY_TILE_TIMEOUT_MS)
  }

  return { playerState, captureScene, captureSnapshot, play, recordVideo, previewScene, next, stop }
}
