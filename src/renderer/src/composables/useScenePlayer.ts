import { reactive, watch, type Ref } from 'vue'
import * as Cesium from 'cesium'
import type { OffscreenRecordingAnnotation, OffscreenRecordingScript, RecordingSaveResult, SceneCamera, SceneSimTime, SceneSnapshot, TeachingScene } from '../../../preload'
import { useGlobeStore } from '@renderer/stores/globe'
import { useClimateStore, thematicLayerCatalog } from '@renderer/stores/climate'
import { useSolarStore, type MotionPanel } from '@renderer/stores/solar'
import { useTransportStore } from '@renderer/stores/transport'
import type { EnsoPhase } from '@renderer/thematic/ensoPhases'
import { useDrawingStore, DEFAULT_DRAW_STYLE, type GeoPosition } from '@renderer/stores/drawing'
import { useScenesStore } from '@renderer/stores/scenes'
import { useFailureStore } from '@renderer/stores/failure'
import { RECORD_PREWARM_QUALITY_CONFIG, recordingPrewarmViews, sanitizeCamera, sceneCameraView } from '@renderer/lib/sceneCamera'
import { transientMirrorShape } from '@renderer/lib/shapeGraphics'
import { cacheKeyOf, heightCache, seaLevelGridPoints } from '@renderer/thematic/seaLevelRise'
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
  styleId: string
  overlays: string[]
  month: number
  simTime: SceneSimTime | null
  ensoPhase: EnsoPhase
  seaLevelRise: number
  transportYear: number
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
const RECORD_MIN_FLUENT_FPS = 24
const MORPH_TIMEOUT_MS = 5_000
const BASEMAP_SETTLE_MS = 500
const STATE_SETTLE_MS = 250
const PREWARM_HOLD_MS = 400
const RECORDING_MIRROR_RESOLUTION_SCALE = 0.6

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizedHeadingDegrees(radians: number): number {
  if (!Number.isFinite(radians)) return 0
  const degrees = Cesium.Math.toDegrees(radians) % 360
  return degrees < 0 ? degrees + 360 : degrees
}

export { interpolateCamera, RECORD_PREWARM_QUALITY_CONFIG, recordingPrewarmViews } from '@renderer/lib/sceneCamera'
export type { PrewarmView as RecordingPrewarmView } from '@renderer/lib/sceneCamera'

let runId = 0
let activeRun: (() => void) | null = null

export function useScenePlayer(viewer: Ref<Cesium.Viewer | undefined>, switchBasemap: (id: string) => void) {
  const globeStore = useGlobeStore()
  const climateStore = useClimateStore()
  const solarStore = useSolarStore()
  const drawingStore = useDrawingStore()
  const scenesStore = useScenesStore()
  const failureStore = useFailureStore()
  const transportStore = useTransportStore()
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
  let offscreenRecordingActive = false
  let recordingQualityRevision = 0
  let advanceResolver: (() => void) | null = null
  let advanceTimer: ReturnType<typeof setTimeout> | undefined
  let restoreRecordingRender: (() => void) | null = null
  let mirrorShapeIds: string[] = []

  watch(() => scenesStore.recording.skipPrewarm, (value) => {
    if (value && offscreenRecordingActive) window.guEarth.recordings.offscreenSkipPrewarm()
  })
  watch(() => scenesStore.recording.prewarmQuality, (quality) => {
    if (offscreenRecordingActive) window.guEarth.recordings.offscreenPrewarmQuality(quality)
  })

  function enableRecordingRender(): void {
    const current = viewer.value
    if (!current || current.isDestroyed() || restoreRecordingRender) return
    const scene = current.scene
    const originalRequestRenderMode = scene.requestRenderMode
    const originalMaximumRenderTimeChange = scene.maximumRenderTimeChange
    scene.requestRenderMode = false
    restoreRecordingRender = () => {
      restoreRecordingRender = null
      if (current.isDestroyed()) return
      scene.requestRenderMode = originalRequestRenderMode
      scene.maximumRenderTimeChange = originalMaximumRenderTimeChange
    }
  }

  function disableRecordingRender(): void {
    restoreRecordingRender?.()
  }

  function clearAdvance(): void {
    if (advanceTimer !== undefined) {
      clearTimeout(advanceTimer)
      advanceTimer = undefined
    }
  }

  function next(): void {
    if (offscreenRecordingActive) {
      window.guEarth.recordings.offscreenNext()
      return
    }
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
      styleId: globeStore.providerStyles[globeStore.selectedLayerId] ?? '',
      overlays: thematicLayerCatalog.filter((layer) => climateStore.overlays[layer.id]).map((layer) => layer.id),
      month: climateStore.month,
      simTime: solarStore.active ? { date: solarStore.date, hour: solarStore.hour } : null,
      motionPanel: solarStore.motionPanel,
      ensoPhase: climateStore.ensoPhase,
      seaLevelRise: climateStore.seaLevelRise,
      transportYear: transportStore.year
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
    if (snapshot.styleId && snapshot.basemapId) globeStore.setProviderStyle(snapshot.basemapId, snapshot.styleId)
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
    if (climateStore.ensoPhase !== snapshot.ensoPhase) climateStore.setEnsoPhase(snapshot.ensoPhase)
    if (climateStore.seaLevelRise !== snapshot.seaLevelRise) climateStore.setSeaLevelRise(snapshot.seaLevelRise)
    if (transportStore.year !== snapshot.transportYear) transportStore.setYear(snapshot.transportYear)
  }

  function flyCamera(rawCamera: SceneCamera, durationSeconds: number, centerTarget = false): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return Promise.resolve()
    const view = sceneCameraView(rawCamera, centerTarget)
    return new Promise((resolve) => {
      current.camera.flyTo({
        destination: view.destination,
        orientation: view.orientation,
        duration: Math.max(0.1, durationSeconds),
        complete: () => resolve(),
        cancel: () => resolve()
      })
    })
  }

  function setCameraView(rawCamera: SceneCamera, centerTarget = false): void {
    const current = viewer.value
    if (!current || current.isDestroyed() || current.scene.mode !== Cesium.SceneMode.SCENE3D) return
    const view = sceneCameraView(rawCamera, centerTarget)
    current.camera.setView({
      destination: view.destination,
      orientation: view.orientation
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

  function recordingErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : '离屏视频保存失败'
    return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '')
  }

  function clearMirrorShapes(): void {
    for (const shapeId of mirrorShapeIds) drawingStore.removeShape(shapeId)
    mirrorShapeIds = []
  }

  function mirrorScene(scene: TeachingScene, annotations: OffscreenRecordingAnnotation[], index: number, centerTarget: boolean): void {
    const current = viewer.value
    if (!current || current.isDestroyed()) return
    applySnapshot(scene.snapshot)
    clearMirrorShapes()
    for (const annotation of annotations.filter((entry) => entry.sceneId === scene.id)) {
      const shapeId = crypto.randomUUID()
      drawingStore.addTransientShape(transientMirrorShape({ ...annotation, annotation: annotation.name, id: shapeId, createdAt: Date.now() }))
      mirrorShapeIds.push(shapeId)
    }
    if (index === 0) {
      setCameraView(scene.snapshot.camera, centerTarget)
    } else {
      current.camera.cancelFlight()
      void flyCamera(scene.snapshot.camera, scene.flyDurationMs / 1000, centerTarget)
    }
    requestSceneRender()
  }

  function reportRecordingFailure(detail: string): void {
    scenesStore.setRecording({ state: 'error', error: detail })
    failureStore.reportFailure({
      scope: 'recording',
      message: `视频录制失败：${detail}`,
      detail: '点击重试会按同一份剧本重新录制',
      retryable: true
    })
  }

  async function saveOffscreenRecording(script: OffscreenRecordingScript): Promise<void> {
    try {
      const result = await window.guEarth.recordings.offscreenEncode(script)
      if (result.cancelled) {
        scenesStore.setRecording({ state: 'idle', cancelled: true, error: '' })
        return
      }
      scenesStore.applyRecordingResult(result)
      failureStore.clearFailure('recording')
      if (result.fps && result.fps < RECORD_MIN_FLUENT_FPS) failureStore.reportDegrade(`录制画面帧率偏低（约 ${result.fps.toFixed(1)} FPS），成片可能不够流畅`)
    } catch (error) {
      const detail = recordingErrorMessage(error)
      if (detail.includes('录制已取消')) {
        scenesStore.setRecording({ state: 'idle', cancelled: true, error: '' })
        return
      }
      reportRecordingFailure(detail)
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
            enableRecordingRender()
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
      disableRecordingRender()
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
    failureStore.clearFailure('recording')
    failureStore.clearFailure('recording-quality')
    offscreenRecordingActive = true
    const previousMirrorResolutionScale = current.resolutionScale
    current.resolutionScale = RECORDING_MIRROR_RESOLUTION_SCALE
    failureStore.registerRetry('recording', async () => {
      const retried = await recordVideo(title, steps)
      if ('error' in retried) reportRecordingFailure(retried.error)
    })
    const scenes: TeachingScene[] = steps.map((step) => ({
      id: crypto.randomUUID(),
      name: step.name,
      narration: step.narration,
      dwellMs: step.dwellMs,
      flyDurationMs: step.flyDurationMs,
      snapshot: {
        camera: step.camera,
        basemapId: step.basemapId,
        styleId: step.styleId,
        overlays: step.overlays,
        month: step.month,
        simTime: step.simTime,
        motionPanel: null,
        ensoPhase: step.ensoPhase,
        seaLevelRise: step.seaLevelRise,
        transportYear: step.transportYear
      },
      createdAt: Date.now()
    }))
    const estimatedSeconds = Math.round(scenes.reduce((total, scene, index) => total + (index > 0 ? scene.flyDurationMs / 1000 : 0) + scene.dwellMs / 1000, 0)) + 3
    const annotations = steps.flatMap((step, index) => {
      const sceneId = scenes[index].id
      return [
        ...step.markers.map((marker) => ({ sceneId, kind: 'point' as const, name: marker.name, positions: [{ longitude: marker.longitude, latitude: marker.latitude, height: 0 }], ...DEFAULT_DRAW_STYLE })),
        ...step.shapes.map((shape) => ({ sceneId, kind: shape.kind, name: shape.name, positions: shape.positions, ...DEFAULT_DRAW_STYLE }))
      ]
    })
    const recordsSeaLevel = steps.some((step) => step.overlays.includes('sea-level-rise'))
    const script: OffscreenRecordingScript = {
      title,
      scenes,
      annotations,
      seaLevelHeights: recordsSeaLevel ? seaLevelGridPoints().map(([longitude, latitude]) => heightCache.get(cacheKeyOf(longitude, latitude)) ?? null) : [],
      terrain: { providerId: globeStore.terrainProviderId, exaggeration: globeStore.terrainExaggeration, lighting: globeStore.terrainLighting },
      prewarmQuality: scenesStore.recording.prewarmQuality,
      centerTarget: true,
      width: 1920,
      height: 1080,
      fps: 30
    }
    playerState.active = true
    playerState.mode = 'auto'
    playerState.prewarming = true
    playerState.prewarmIndex = 0
    playerState.prewarmTotal = 0
    playerState.title = title
    playerState.total = scenes.length
    playerState.currentIndex = 0
    playerState.sceneName = scenes[0]?.name ?? ''
    playerState.narration = ''
    playerState.recording = true
    scenesStore.setPresenting(true)
    scenesStore.setRecording({ state: 'preparing', title, currentStep: 0, totalSteps: scenes.length, prewarmStep: 0, prewarmTotal: 0, prewarmMessage: '正在启动离屏录制渲染…', prewarmTimedOut: false, skipPrewarm: false, videoPath: '', error: '', cancelled: false })
    const cancel = (): void => {
      void window.guEarth.recordings.offscreenCancel()
    }
    activeRun = cancel
    const unsubscribeProgress = window.guEarth.recordings.onOffscreenProgress((progress) => {
      if (activeRun !== cancel) return
      if (progress.phase === 'preparing') {
        playerState.prewarming = true
        scenesStore.setRecording({
          state: 'preparing',
          prewarmStep: progress.sceneIndex,
          prewarmTotal: progress.totalScenes,
          prewarmTimedOut: progress.timedOut === true,
          prewarmMessage: progress.timedOut === true ? '网络较慢，部分高清地图细节可能在录制中继续加载…' : `正在预加载高清录制画面 ${progress.sceneIndex}/${progress.totalScenes}`
        })
        return
      }
      playerState.prewarming = false
      playerState.currentIndex = progress.sceneIndex
      playerState.sceneName = scenes[progress.sceneIndex]?.name ?? ''
      playerState.narration = scenes[progress.sceneIndex]?.narration ?? ''
      const mirrored = scenes[progress.sceneIndex]
      if (mirrored) mirrorScene(mirrored, script.annotations, progress.sceneIndex, script.centerTarget)
      scenesStore.setRecording({ state: 'recording', currentStep: progress.sceneIndex + 1, totalSteps: progress.totalScenes })
    })
    const unsubscribeNotice = window.guEarth.recordings.onOffscreenNotice((notice) => {
      if (activeRun !== cancel) return
      failureStore.reportFailure({
        scope: 'recording-quality',
        message: notice,
        detail: '本次录制会继续，成片对应要素可能缺失',
        retryable: false
      })
    })
    void saveOffscreenRecording(script).finally(() => {
      if (!current.isDestroyed()) current.resolutionScale = previousMirrorResolutionScale
      unsubscribeProgress()
      unsubscribeNotice()
      clearMirrorShapes()
      scenesStore.setPresenting(false)
      if (activeRun === cancel) activeRun = null
      offscreenRecordingActive = false
      playerState.active = false
      playerState.recording = false
      playerState.prewarming = false
      playerState.currentIndex = -1
      playerState.sceneName = ''
      playerState.narration = ''
    })
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
