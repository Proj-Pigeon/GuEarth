import { ReloadOutlined } from '@ant-design/icons'
import { registerGlobeTools, type GlobeToolsBridge } from '@renderer/ai/registerGlobeTools'
import AnnotationPanel from '@renderer/components/AnnotationPanel'

import 'cesium/Build/Cesium/Widgets/widgets.css'
import AtmosphereHeatingPanel from '@renderer/components/AtmosphereHeatingPanel'
import AtmosphereLayersPanel from '@renderer/components/AtmosphereLayersPanel'
import CameraStatus from '@renderer/components/CameraStatus'
import CitiesPanel from '@renderer/components/CitiesPanel'
import CrashDialog from '@renderer/components/CrashDialog'
import DrawingEditToolbar, {
  type DrawnShapeStylePatch
} from '@renderer/components/DrawingEditToolbar'
import DrawingTouchBar from '@renderer/components/DrawingTouchBar'
import EarthLayersPanel from '@renderer/components/EarthLayersPanel'
import EnsoPanel from '@renderer/components/EnsoPanel'
import EnvironmentPanel from '@renderer/components/EnvironmentPanel'
import EoqAssistant from '@renderer/components/EoqAssistant'
import ExogenicPanel from '@renderer/components/ExogenicPanel'
import FailureBanner from '@renderer/components/FailureBanner'
import FirstUseGuide, { type FirstUseGuideHandle } from '@renderer/components/FirstUseGuide'
import FlightStopSwitcher from '@renderer/components/FlightStopSwitcher'
import FoldFaultPanel from '@renderer/components/FoldFaultPanel'
import FrontalCyclone from '@renderer/components/FrontalCyclone'
import GlobeToolbar from '@renderer/components/GlobeToolbar'
import HuLineOverlay from '@renderer/components/HuLineOverlay'
import InlineTextEditor from '@renderer/components/InlineTextEditor'
import LandformGuidePanel from '@renderer/components/LandformGuidePanel'
import LayerPanel from '@renderer/components/LayerPanel'
import LocationDecisionPanel from '@renderer/components/LocationDecisionPanel'
import MirrorConsentModal from '@renderer/components/MirrorConsentModal'
import MirrorPolicyModal from '@renderer/components/MirrorPolicyModal'
import MonthTimeline from '@renderer/components/MonthTimeline'
import ObliquityPanel from '@renderer/components/ObliquityPanel'
import OceanPropertyPanel from '@renderer/components/OceanPropertyPanel'
import PlaceSearchBox from '@renderer/components/PlaceSearchBox'
import PopulationPanel from '@renderer/components/PopulationPanel'
import RiverLandformPanel from '@renderer/components/RiverLandformPanel'
import RotationSpeedPanel from '@renderer/components/RotationSpeedPanel'
import SceneBookmarksPanel, {
  type SceneEditPayload
} from '@renderer/components/SceneBookmarksPanel'
import ScenePlayerOverlay from '@renderer/components/ScenePlayerOverlay'
import SettingsModal from '@renderer/components/SettingsModal'
import SolarPathPanel from '@renderer/components/SolarPathPanel'
import SolarTimePanel from '@renderer/components/SolarTimePanel'
import TeachingLab from '@renderer/components/TeachingLab'
import ThematicInfoCard from '@renderer/components/ThematicInfoCard'
import ThematicLegend from '@renderer/components/ThematicLegend'
import ThermalCirculationPanel from '@renderer/components/ThermalCirculationPanel'
import TideWavePanel from '@renderer/components/TideWavePanel'
import TimezonePanel from '@renderer/components/TimezonePanel'
import TransportPanel from '@renderer/components/TransportPanel'
import TyphoonOverlay from '@renderer/components/TyphoonOverlay'
import UpdateDialog from '@renderer/components/UpdateDialog'
import WalkerCirculationOverlay from '@renderer/components/WalkerCirculationOverlay'
import WaterBodyPanel from '@renderer/components/WaterBodyPanel'
import WaterCyclePanel from '@renderer/components/WaterCyclePanel'
import WindParticles from '@renderer/components/WindParticles'
import ZonationFlightHud from '@renderer/components/ZonationFlightHud'
import ZonationPanel from '@renderer/components/ZonationPanel'
import { useCesiumViewer } from '@renderer/composables/useCesiumViewer'
import { useDrawing } from '@renderer/composables/useDrawing'
import { useScenePlayer } from '@renderer/composables/useScenePlayer'
import { useThematicLayers } from '@renderer/composables/useThematicLayers'
import { useTimezoneCompare } from '@renderer/composables/useTimezoneCompare'
import { clearTransectOverlay } from '@renderer/composables/useTransectFlight'
import { hidesThematicLayers } from '@renderer/lib/nightBasemap'
import { captureTelemetryEvent } from '@renderer/posthog'
import { useAccountStore } from '@renderer/stores/account'
import { useAiStore } from '@renderer/stores/ai'
import { useAtmosphereStore } from '@renderer/stores/atmosphere'
import { thematicLayerCatalog, useClimateStore } from '@renderer/stores/climate'
import { useDecisionStore } from '@renderer/stores/decision'
import { useDrawingStore, type DrawTool } from '@renderer/stores/drawing'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useFailureStore } from '@renderer/stores/failure'
import { useGlobeStore } from '@renderer/stores/globe'
import { useHydrologyStore } from '@renderer/stores/hydrology'
import { useLandformStore } from '@renderer/stores/landform'
import { useOnlineDataStore } from '@renderer/stores/onlineData'
import { usePopulationStore } from '@renderer/stores/population'
import { usePrivacyStore } from '@renderer/stores/privacy'
import { useScenesStore } from '@renderer/stores/scenes'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { useSolarStore } from '@renderer/stores/solar'
import { useTransportStore } from '@renderer/stores/transport'
import { updateInstallContent, useUpdaterStore } from '@renderer/stores/updater'
import { useZonationStore } from '@renderer/stores/zonation'
import { Alert, App as AntdApp, Button, Modal, Spin } from 'antd'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'

import { isLikelyMainlandChinaEnv } from '../../common/tileMirror'
import type { PlaceSuggestion } from '../../preload'

import styles from './App.module.css'

const DEFAULT_SYSTEM_FONTS = [
  'Arial',
  'Segoe UI',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'WenQuanYi Micro Hei'
]

export function App() {
  const { message, modal } = AntdApp.useApp()

  const isLayerPanelOpen = useGlobeStore(state => state.isLayerPanelOpen)
  const layers = useGlobeStore(state => state.layers)
  const selectedLayerId = useGlobeStore(state => state.selectedLayerId)
  const globeError = useGlobeStore(state => state.globeError)
  const terrainError = useGlobeStore(state => state.terrainError)
  const isGlobeReady = useGlobeStore(state => state.isGlobeReady)
  const globeLoadTimedOut = useGlobeStore(state => state.globeLoadTimedOut)
  const globeLoadStage = useGlobeStore(state => state.globeLoadStage)
  const activeTerrainId = useGlobeStore(state => state.activeTerrainId)
  const camera = useGlobeStore(state => state.camera)
  const levelViewActive = useGlobeStore(state => state.levelViewActive)
  const terrainProviderId = useGlobeStore(state => state.terrainProviderId)
  const terrainExaggeration = useGlobeStore(state => state.terrainExaggeration)
  const terrainLighting = useGlobeStore(state => state.terrainLighting)
  const settingsHydrated = useGlobeStore(state => state.settingsHydrated)
  const mirrorConsentPrompted = useGlobeStore(state => state.mirrorConsentPrompted)
  const mirrorConsentOpen = useGlobeStore(state => state.mirrorConsentOpen)
  const touchInteractionActive = useGlobeStore(state => state.touchInteractionActive)

  const thematicOverlays = useClimateStore(state => state.overlays)
  const ensoPhase = useClimateStore(state => state.ensoPhase)
  const hasActiveOverlay = useClimateStore(state => state.hasActiveOverlay)

  const solarActive = useSolarStore(state => state.active)
  const motionPanel = useSolarStore(state => state.motionPanel)
  const atmospherePanel = useAtmosphereStore(state => state.panel)
  const hydrologyPanel = useHydrologyStore(state => state.panel)
  const landformPanel = useLandformStore(state => state.panel)
  const populationPanel = usePopulationStore(state => state.panel)
  const transportPanel = useTransportStore(state => state.panel)
  const environmentPanel = useEnvironmentStore(state => state.panel)
  const decisionPanel = useDecisionStore(state => state.panel)
  const zonationPanel = useZonationStore(state => state.panel)

  const activeTool = useDrawingStore(state => state.activeTool)
  const shapes = useDrawingStore(state => state.shapes)
  const entries = useDrawingStore(state => state.entries)
  const selectedShapeId = useDrawingStore(state => state.selectedShapeId)
  const saveError = useDrawingStore(state => state.saveError)

  const onlineDataLoading = useOnlineDataStore(state => state.loading)
  const onlineSnapshot = useOnlineDataStore(state => state.snapshot)
  const typhoonMode = useOnlineDataStore(state => state.typhoonMode)

  const webglNotice = useFailureStore(state => state.notices.webgl)
  const updaterStatus = useUpdaterStore(state => state.status)
  const updaterVersion = useUpdaterStore(state => state.version)
  const updaterPercent = useUpdaterStore(state => state.percent)
  const updaterPackageKind = useUpdaterStore(state => state.packageKind)

  const scenes = useScenesStore(state => state.scenes)
  const scenesSaveError = useScenesStore(state => state.saveError)
  const isPresenting = useScenesStore(state => state.isPresenting)

  const globeContainerRef = useRef<HTMLDivElement | null>(null)
  const firstUseGuideRef = useRef<FirstUseGuideHandle>(null)
  const recordingDirectoryResolverRef = useRef<((selected: boolean) => void) | null>(null)

  const {
    viewer,
    switchBasemap,
    setLayerOpacity,
    flyTo,
    flyToPlace,
    toggleLevelView,
    setTerrain,
    setTerrainExaggeration,
    setTerrainLighting
  } = useCesiumViewer(globeContainerRef)
  const { flyToShape, draftCount, finishDraft, undoDraftPoint, cancelActiveTool } =
    useDrawing(viewer)
  const { comparison: timezoneComparison, closeTimezoneCompare } = useTimezoneCompare(viewer)
  useThematicLayers(viewer)
  const scenePlayer = useScenePlayer(viewer, switchBasemap)

  const [isScenesPanelOpen, setIsScenesPanelOpen] = useState(false)
  const [recordingDirectoryDialogOpen, setRecordingDirectoryDialogOpen] = useState(false)
  const [recordingDirectoryDialogBusy, setRecordingDirectoryDialogBusy] = useState(false)
  const [recordingDirectoryDialogError, setRecordingDirectoryDialogError] = useState('')
  const [isAnnotationPanelOpen, setIsAnnotationPanelOpen] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>(DEFAULT_SYSTEM_FONTS)
  const [isLabOpen, setIsLabOpen] = useState(false)

  const selectedShape = useMemo(
    () => shapes.find(shape => shape.id === selectedShapeId) ?? null,
    [selectedShapeId, shapes]
  )
  const levelSwitcherVisible = isGlobeReady && camera.height < 5000000
  const showGlobeLoading = !isGlobeReady || onlineDataLoading || Boolean(webglNotice)
  const globeLoadingText = webglNotice
    ? webglNotice.message
    : onlineDataLoading
      ? '正在加载数据…'
      : globeError
        ? '地图尚未显示，请检查网络或重试'
        : globeLoadTimedOut
          ? '地图加载较慢，请检查网络'
          : '正在加载地图…'
  const globeLoadingRetryable =
    Boolean(webglNotice) || (!onlineDataLoading && (globeLoadTimedOut || Boolean(globeError)))
  const nightBasemapActive = hidesThematicLayers(selectedLayerId)
  const labActive =
    hasActiveOverlay ||
    solarActive ||
    motionPanel !== null ||
    atmospherePanel !== null ||
    hydrologyPanel !== null ||
    landformPanel !== null ||
    populationPanel !== null ||
    transportPanel !== null ||
    environmentPanel !== null ||
    decisionPanel !== null ||
    zonationPanel !== null ||
    activeTool === 'timezone'

  const drawHint = !activeTool
    ? ''
    : activeTool === 'timezone'
      ? touchInteractionActive
        ? '点按选取两个地点对比地方时 · 用下方按钮退出'
        : '单击选取两个地点对比地方时 · Esc 退出'
      : activeTool === 'text'
        ? touchInteractionActive
          ? '在地球上点按放置文本框 · 用下方按钮取消'
          : '在地球上单击放置文本框 · Esc 退出'
        : activeTool === 'arrow'
          ? touchInteractionActive
            ? '点按箭头起点和终点'
            : '依次单击箭头起点和终点 · Esc 取消'
          : activeTool === 'point'
            ? touchInteractionActive
              ? '在地球上点按以放置点'
              : '在地球上单击以放置点'
            : touchInteractionActive
              ? '点按加点 · 用下方按钮撤销或完成'
              : '单击加点 · 双击或右键完成 · Esc 取消'

  const handleGlobeContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!touchInteractionActive) return
      event.preventDefault()
    },
    [touchInteractionActive]
  )

  const closeAllTeachingPanels = useCallback(() => {
    useSolarStore.getState().setMotionPanel(null)
    useAtmosphereStore.getState().setPanel(null)
    useHydrologyStore.getState().setPanel(null)
    useLandformStore.getState().setPanel(null)
    usePopulationStore.getState().setPanel(null)
    useTransportStore.getState().setPanel(null)
    useEnvironmentStore.getState().setPanel(null)
    useDecisionStore.getState().setPanel(null)
    useZonationStore.getState().setPanel(null)
    clearTransectOverlay(viewer)
    closeTimezoneCompare()
  }, [closeTimezoneCompare, viewer])

  const closeAllTeachingFeatures = useCallback(() => {
    closeAllTeachingPanels()
    const climate = useClimateStore.getState()
    for (const layer of thematicLayerCatalog) climate.setOverlay(layer.id, false)
  }, [closeAllTeachingPanels])

  useEffect(() => {
    if (!nightBasemapActive) return
    closeAllTeachingFeatures()
    setIsLabOpen(false)
  }, [closeAllTeachingFeatures, nightBasemapActive])

  const ensureRecordingDirectory = useCallback(async (): Promise<boolean> => {
    try {
      if (await window.guEarth.recordings.getDirectory()) return true
    } catch {
      setRecordingDirectoryDialogError('暂时无法检查视频保存文件夹，请重新选择')
    }
    if (recordingDirectoryResolverRef.current) return false
    setRecordingDirectoryDialogError('')
    setRecordingDirectoryDialogOpen(true)
    return new Promise(resolve => {
      recordingDirectoryResolverRef.current = resolve
    })
  }, [])

  const chooseRecordingDirectory = useCallback(async (): Promise<void> => {
    setRecordingDirectoryDialogBusy(true)
    setRecordingDirectoryDialogError('')
    try {
      const directory = await window.guEarth.recordings.chooseDirectory()
      if (directory) {
        setRecordingDirectoryDialogOpen(false)
        recordingDirectoryResolverRef.current?.(true)
        recordingDirectoryResolverRef.current = null
      }
    } catch (error) {
      setRecordingDirectoryDialogError(
        error instanceof Error ? error.message : '选择视频保存文件夹失败'
      )
    } finally {
      setRecordingDirectoryDialogBusy(false)
    }
  }, [])

  const cancelRecordingDirectory = useCallback((): void => {
    setRecordingDirectoryDialogOpen(false)
    recordingDirectoryResolverRef.current?.(false)
    recordingDirectoryResolverRef.current = null
  }, [])

  const bridgeRef = useRef<GlobeToolsBridge>({
    getViewer: () => viewer,
    flyTo,
    switchBasemap,
    setTerrain,
    setTerrainExaggeration,
    setTerrainLighting,
    closeAllTeachingPanels,
    captureScene: scenePlayer.captureScene,
    recordVideo: scenePlayer.recordVideo,
    ensureRecordingDirectory
  })
  bridgeRef.current = {
    getViewer: () => viewer,
    flyTo,
    switchBasemap,
    setTerrain,
    setTerrainExaggeration,
    setTerrainLighting,
    closeAllTeachingPanels,
    captureScene: scenePlayer.captureScene,
    recordVideo: scenePlayer.recordVideo,
    ensureRecordingDirectory
  }

  useEffect(() => {
    registerGlobeTools({
      getViewer: () => bridgeRef.current.getViewer(),
      flyTo: (longitude, latitude, height) => bridgeRef.current.flyTo(longitude, latitude, height),
      switchBasemap: id => bridgeRef.current.switchBasemap(id),
      setTerrain: id => bridgeRef.current.setTerrain(id),
      setTerrainExaggeration: value => bridgeRef.current.setTerrainExaggeration(value),
      setTerrainLighting: value => bridgeRef.current.setTerrainLighting(value),
      closeAllTeachingPanels: () => bridgeRef.current.closeAllTeachingPanels(),
      captureScene: (name, narration) => bridgeRef.current.captureScene(name, narration),
      recordVideo: (title, steps) => bridgeRef.current.recordVideo(title, steps),
      ensureRecordingDirectory: () => bridgeRef.current.ensureRecordingDirectory()
    })
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    if (mirrorConsentPrompted || mirrorConsentOpen) return
    const timeZone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return ''
      }
    })()
    if (isLikelyMainlandChinaEnv(navigator.language, timeZone)) {
      useGlobeStore.getState().openMirrorConsent('china')
      return
    }
    if (globeLoadTimedOut || Boolean(globeError) || Boolean(terrainError)) {
      useGlobeStore.getState().openMirrorConsent('slow')
      return
    }
    if (isGlobeReady) return
    const timer = window.setTimeout(() => {
      const current = useGlobeStore.getState()
      if (!current.mirrorConsentPrompted && !current.mirrorConsentOpen && !current.isGlobeReady) {
        current.openMirrorConsent('slow')
      }
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [
    globeError,
    globeLoadTimedOut,
    isGlobeReady,
    mirrorConsentOpen,
    mirrorConsentPrompted,
    settingsHydrated,
    terrainError
  ])

  useEffect(() => {
    let cancelled = false
    void useOnlineDataStore.getState().load()
    void useUpdaterStore.getState().hydrate()
    void useScenesStore.getState().hydrate()
    void usePrivacyStore
      .getState()
      .hydrate()
      .finally(() => {
        void useAccountStore.getState().hydrate()
      })
    void (async () => {
      try {
        const installedFonts = await window.guEarth.system.fonts()
        if (cancelled) return
        const existingFonts = useDrawingStore.getState().shapes.map(shape => shape.fontFamily)
        setSystemFonts(
          [...new Set([...installedFonts, ...existingFonts])].sort((first, second) =>
            first.localeCompare(second)
          )
        )
      } catch {
        if (!cancelled) setSystemFonts(DEFAULT_SYSTEM_FONTS)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenLayers = useCallback(() => {
    useAiStore.getState().setPanelOpen(false)
    useGlobeStore.getState().setLayerPanelOpen(true)
  }, [])

  const handleOpenAssistant = useCallback(() => {
    useGlobeStore.getState().setLayerPanelOpen(false)
    useAiStore.getState().setPanelOpen(true)
  }, [])

  const handleSetupGuideStepChange = useCallback((step: number) => {
    const settingsWindow = useSettingsWindowStore.getState()
    settingsWindow.close()
    useAiStore.getState().setPanelOpen(false)
    if (step === 6) settingsWindow.open('map')
    if (step === 8) settingsWindow.open('ai')
  }, [])

  const handleRestartGuide = useCallback(() => {
    firstUseGuideRef.current?.start()
  }, [])

  const handleOpenSettings = useCallback(() => {
    useSettingsWindowStore.getState().open()
  }, [])

  const handleClosePanel = useCallback(() => {
    useGlobeStore.getState().setLayerPanelOpen(false)
  }, [])

  const handleHome = useCallback(() => {
    void flyTo(105, 35, 15000000)
  }, [flyTo])

  const handleRetry = useCallback(() => {
    const failureStore = useFailureStore.getState()
    for (const notice of failureStore.active) {
      if (notice.retryable) void failureStore.retry(notice.scope)
    }
  }, [])

  const handleUpdateClick = useCallback(() => {
    if (updaterStatus === 'available') {
      void useUpdaterStore.getState().startDownload()
      return
    }
    if (updaterStatus === 'ready') {
      modal.confirm({
        title: `重启并安装新版本 v${updaterVersion}？`,
        content: updateInstallContent(updaterPackageKind),
        okText: '重启安装',
        cancelText: '稍后',
        onOk: () => useUpdaterStore.getState().installNow()
      })
    }
  }, [modal, updaterPackageKind, updaterStatus, updaterVersion])

  const handleToggleLab = useCallback(() => {
    if (nightBasemapActive) {
      message.info('夜光模式下地理实验室不可用，切换回其他底图后恢复')
      return
    }
    setIsLabOpen(open => !open)
  }, [message, nightBasemapActive])

  const handleOpenScenes = useCallback(() => {
    useAiStore.getState().setPanelOpen(false)
    useGlobeStore.getState().setLayerPanelOpen(false)
    void useScenesStore.getState().hydrate()
    setIsScenesPanelOpen(open => !open)
  }, [])

  const handleSaveScene = useCallback(
    async (name: string, narration: string) => {
      try {
        const scene = scenePlayer.captureScene(name, narration)
        const scenesStore = useScenesStore.getState()
        await scenesStore.addScene(scene)
        const nextState = useScenesStore.getState()
        if (!nextState.saveError)
          captureTelemetryEvent('scene_saved', { scene_count: nextState.scenes.length })
      } catch (error) {
        message.warning(error instanceof Error ? error.message : '地球尚未就绪，暂时无法保存场景')
      }
    },
    [message, scenePlayer]
  )

  const handlePreviewScene = useCallback(
    (id: string) => {
      const scene = useScenesStore.getState().scenes.find(item => item.id === id)
      if (scene) void scenePlayer.previewScene(scene)
    },
    [scenePlayer]
  )

  const handleUpdateScene = useCallback(async (id: string, changes: SceneEditPayload) => {
    await useScenesStore.getState().updateScene(id, {
      name: changes.name,
      narration: changes.narration,
      dwellMs: Math.round(changes.dwellSeconds * 1000)
    })
  }, [])

  const handleMoveScene = useCallback((id: string, offset: -1 | 1) => {
    void useScenesStore.getState().moveScene(id, offset)
  }, [])

  const handlePlayScenes = useCallback(
    (mode: 'manual' | 'auto') => {
      const currentScenes = useScenesStore.getState().scenes
      if (!currentScenes.length) return
      const drawingStore = useDrawingStore.getState()
      drawingStore.setActiveTool(null)
      drawingStore.setSelectedShapeId(null)
      setIsScenesPanelOpen(false)
      captureTelemetryEvent('scene_playback_started', { mode, scene_count: currentScenes.length })
      void scenePlayer.play({ scenes: currentScenes, mode, title: '教学演示' })
    },
    [scenePlayer]
  )

  const handlePlaceSelect = useCallback(
    (place: PlaceSuggestion) => {
      captureTelemetryEvent('place_selected')
      flyToPlace(place)
    },
    [flyToPlace]
  )

  const handleTool = useCallback((tool: DrawTool) => {
    const drawingStore = useDrawingStore.getState()
    const next = drawingStore.activeTool === tool ? null : tool
    drawingStore.setSelectedShapeId(null)
    drawingStore.setActiveTool(next)
  }, [])

  const handleClearShapes = useCallback(() => {
    modal.confirm({
      title: '清除全部标注？',
      okText: '清除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => useDrawingStore.getState().clearAll()
    })
  }, [modal])

  const handleFlyShape = useCallback(
    (id: string) => {
      const shape = useDrawingStore.getState().shapes.find(item => item.id === id)
      if (shape) flyToShape(shape)
    },
    [flyToShape]
  )

  const updateSelectedShape = useCallback((changes: DrawnShapeStylePatch) => {
    const id = useDrawingStore.getState().selectedShapeId
    if (id) useDrawingStore.getState().updateShape(id, changes)
  }, [])

  const deleteSelectedShape = useCallback(() => {
    const id = useDrawingStore.getState().selectedShapeId
    if (id) useDrawingStore.getState().removeShape(id)
  }, [])

  return (
    <div className={touchInteractionActive ? `${styles.app} touch-ui` : styles.app}>
      <div
        ref={globeContainerRef}
        className={activeTool ? `${styles.globe} ${styles.globeDrawing}` : styles.globe}
        onContextMenu={handleGlobeContextMenu}
      />
      <InlineTextEditor
        viewer={viewer}
        shape={selectedShape?.kind === 'text' ? selectedShape : null}
        onUpdate={annotation => updateSelectedShape({ annotation })}
      />
      {showGlobeLoading && (
        <div className={styles.globeLoading}>
          <Spin spinning={!globeLoadTimedOut && !globeError && !webglNotice} size='small' />
          <span className={styles.globeLoadingText} role='status'>
            {globeLoadingText}
          </span>
          {webglNotice?.detail ? (
            <span className={`${styles.globeLoadingStage} ${styles.globeLoadingHint}`}>
              {webglNotice.detail}
            </span>
          ) : !onlineDataLoading && globeLoadStage ? (
            <span className={styles.globeLoadingStage}>{globeLoadStage}</span>
          ) : null}
          {globeLoadingRetryable && !webglNotice && (
            <span className={styles.globeLoadingStage}>
              若持续无法加载，可在「设置 → 地图」开启国内地图加速
            </span>
          )}
          {globeLoadingRetryable && (
            <Button type='text' size='small' icon={<ReloadOutlined />} onClick={handleRetry}>
              重试
            </Button>
          )}
        </div>
      )}
      <FailureBanner />
      <CrashDialog />
      {thematicOverlays['wind-particles'] && <WindParticles viewer={viewer} />}
      {thematicOverlays['frontal-cyclone'] && <FrontalCyclone viewer={viewer} />}
      {thematicOverlays['typhoon'] &&
        (onlineSnapshot?.typhoonConfigured === false || typhoonMode === 'history') && (
          <TyphoonOverlay viewer={viewer} />
        )}
      {thematicOverlays['enso'] && <WalkerCirculationOverlay viewer={viewer} phase={ensoPhase} />}
      {thematicOverlays['hu-line'] && <HuLineOverlay viewer={viewer} />}

      {!isPresenting && (
        <>
          <GlobeToolbar
            activeTool={activeTool}
            shapeCount={shapes.length}
            levelViewActive={levelViewActive}
            levelViewVisible={levelSwitcherVisible}
            labActive={labActive}
            nightBasemapActive={nightBasemapActive}
            updateStatus={updaterStatus}
            updateVersion={updaterVersion}
            updatePercent={updaterPercent}
            onOpenLayers={handleOpenLayers}
            onOpenAnnotations={() => setIsAnnotationPanelOpen(true)}
            onOpenAssistant={handleOpenAssistant}
            onOpenScenes={handleOpenScenes}
            onHome={handleHome}
            onTool={handleTool}
            onClearShapes={handleClearShapes}
            onToggleLevelView={toggleLevelView}
            onToggleLab={handleToggleLab}
            onUpdateClick={handleUpdateClick}
            onOpenSettings={handleOpenSettings}
          />
          <FlightStopSwitcher flyTo={flyTo} />
          {selectedShape && !activeTool && (
            <DrawingEditToolbar
              shape={selectedShape}
              fonts={systemFonts}
              onChange={updateSelectedShape}
              onRemove={deleteSelectedShape}
            />
          )}
          {touchInteractionActive && (
            <DrawingTouchBar
              activeTool={activeTool}
              draftCount={draftCount}
              onCancel={cancelActiveTool}
              onUndo={undoDraftPoint}
              onFinish={finishDraft}
            />
          )}
          <TeachingLab open={isLabOpen} onClose={() => setIsLabOpen(false)} />
          <PlaceSearchBox onSelect={handlePlaceSelect} />
          <MonthTimeline viewer={viewer} />
          <SolarTimePanel viewer={viewer} />
          {motionPanel === 'solar-path' && (
            <SolarPathPanel onClose={() => useSolarStore.getState().setMotionPanel(null)} />
          )}
          {motionPanel === 'obliquity' && (
            <ObliquityPanel onClose={() => useSolarStore.getState().setMotionPanel(null)} />
          )}
          {motionPanel === 'rotation-speed' && (
            <RotationSpeedPanel onClose={() => useSolarStore.getState().setMotionPanel(null)} />
          )}
          {atmospherePanel === 'circulation' && (
            <ThermalCirculationPanel onClose={() => useAtmosphereStore.getState().setPanel(null)} />
          )}
          {atmospherePanel === 'heating' && (
            <AtmosphereHeatingPanel onClose={() => useAtmosphereStore.getState().setPanel(null)} />
          )}
          {atmospherePanel === 'layers' && (
            <AtmosphereLayersPanel onClose={() => useAtmosphereStore.getState().setPanel(null)} />
          )}
          {thematicOverlays['enso'] && (
            <EnsoPanel onClose={() => useClimateStore.getState().setOverlay('enso', false)} />
          )}
          {hydrologyPanel === 'water-cycle' && (
            <WaterCyclePanel
              viewer={viewer}
              onClose={() => useHydrologyStore.getState().setPanel(null)}
            />
          )}
          {hydrologyPanel === 'ocean-property' && (
            <OceanPropertyPanel onClose={() => useHydrologyStore.getState().setPanel(null)} />
          )}
          {hydrologyPanel === 'tide' && (
            <TideWavePanel onClose={() => useHydrologyStore.getState().setPanel(null)} />
          )}
          {hydrologyPanel === 'water-bodies' && (
            <WaterBodyPanel onClose={() => useHydrologyStore.getState().setPanel(null)} />
          )}
          {landformPanel === 'fold-fault' && (
            <FoldFaultPanel
              viewer={viewer}
              onClose={() => useLandformStore.getState().setPanel(null)}
            />
          )}
          {landformPanel === 'river' && (
            <RiverLandformPanel
              viewer={viewer}
              onClose={() => useLandformStore.getState().setPanel(null)}
            />
          )}
          {landformPanel === 'landform-guide' && (
            <LandformGuidePanel
              viewer={viewer}
              onClose={() => useLandformStore.getState().setPanel(null)}
            />
          )}
          {landformPanel === 'exogenic' && (
            <ExogenicPanel
              viewer={viewer}
              onClose={() => useLandformStore.getState().setPanel(null)}
            />
          )}
          {landformPanel === 'earth-layers' && (
            <EarthLayersPanel onClose={() => useLandformStore.getState().setPanel(null)} />
          )}
          {zonationPanel === 'zonation-profile' && (
            <ZonationPanel
              viewer={viewer}
              onClose={() => useZonationStore.getState().setPanel(null)}
            />
          )}
          {populationPanel === 'population' && (
            <PopulationPanel onClose={() => usePopulationStore.getState().setPanel(null)} />
          )}
          {populationPanel === 'cities' && (
            <CitiesPanel onClose={() => usePopulationStore.getState().setPanel(null)} />
          )}
          {transportPanel === 'transport' && (
            <TransportPanel
              viewer={viewer}
              onClose={() => useTransportStore.getState().setPanel(null)}
            />
          )}
          {environmentPanel === 'environment' && (
            <EnvironmentPanel
              viewer={viewer}
              onClose={() => useEnvironmentStore.getState().setPanel(null)}
            />
          )}
          {decisionPanel === 'location' && (
            <LocationDecisionPanel
              viewer={viewer}
              onClose={() => useDecisionStore.getState().setPanel(null)}
            />
          )}
          {timezoneComparison && (
            <TimezonePanel comparison={timezoneComparison} onClear={closeTimezoneCompare} />
          )}
          <ThematicLegend />
          <ZonationFlightHud />
          <ThematicInfoCard />
          {drawHint && <div className={styles.drawHint}>{drawHint}</div>}
          <CameraStatus camera={camera} />
          <EoqAssistant />
          <SettingsModal onRestartGuide={handleRestartGuide} />
          <FirstUseGuide
            ref={firstUseGuideRef}
            ready={isGlobeReady && !onlineDataLoading && !mirrorConsentOpen}
            onStepChange={handleSetupGuideStepChange}
          />
          <UpdateDialog />
          <MirrorConsentModal />
          <MirrorPolicyModal />
          <AnnotationPanel
            open={isAnnotationPanelOpen}
            shapes={shapes}
            entries={entries}
            selectedShapeId={selectedShapeId}
            saveError={saveError}
            onClose={() => setIsAnnotationPanelOpen(false)}
            onEdit={id => useDrawingStore.getState().setSelectedShapeId(id)}
            onFly={handleFlyShape}
            onRemove={id => useDrawingStore.getState().removeShape(id)}
          />
          <LayerPanel
            open={isLayerPanelOpen}
            layers={layers}
            selectedLayerId={selectedLayerId}
            error={globeError}
            terrainError={terrainError}
            terrainProviderId={terrainProviderId}
            activeTerrainId={activeTerrainId}
            terrainExaggeration={terrainExaggeration}
            terrainLighting={terrainLighting}
            onClose={handleClosePanel}
            onSelect={switchBasemap}
            onOpacity={setLayerOpacity}
            onRetry={handleRetry}
            onTerrain={setTerrain}
            onTerrainExaggeration={setTerrainExaggeration}
            onTerrainLighting={setTerrainLighting}
          />
        </>
      )}

      <SceneBookmarksPanel
        open={isScenesPanelOpen}
        scenes={scenes}
        saveError={scenesSaveError}
        onClose={() => setIsScenesPanelOpen(false)}
        onSave={handleSaveScene}
        onPreview={handlePreviewScene}
        onUpdate={handleUpdateScene}
        onRemove={id => void useScenesStore.getState().removeScene(id)}
        onMove={handleMoveScene}
        onPlay={handlePlayScenes}
      />
      <ScenePlayerOverlay
        player={scenePlayer.playerState}
        onNext={() => scenePlayer.next()}
        onStop={() => scenePlayer.stop()}
      />
      <Modal
        open={recordingDirectoryDialogOpen}
        title='选择视频保存文件夹'
        okText='选择文件夹'
        cancelText='取消录制'
        maskClosable={false}
        confirmLoading={recordingDirectoryDialogBusy}
        onOk={() => void chooseRecordingDirectory()}
        onCancel={cancelRecordingDirectory}
      >
        {recordingDirectoryDialogError && (
          <Alert
            type='error'
            showIcon
            title={recordingDirectoryDialogError}
            className={styles.recordingDirectoryError}
          />
        )}
        <p className={styles.recordingDirectoryCopy}>请选择一个文件夹用于保存录制的视频。</p>
      </Modal>
    </div>
  )
}

export default App
