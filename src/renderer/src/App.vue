<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Modal, message } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { ReloadOutlined } from '@ant-design/icons-vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { basemapCategories, providerCatalog, terrainCatalog, useGlobeStore } from '@renderer/stores/globe'
import { useFailureStore } from '@renderer/stores/failure'
import { useDrawingStore, type DrawnShape, type DrawTool } from '@renderer/stores/drawing'
import { useAiStore } from '@renderer/stores/ai'
import { useUpdaterStore } from '@renderer/stores/updater'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { useScenesStore } from '@renderer/stores/scenes'
import { thematicLayerCatalog, useClimateStore } from '@renderer/stores/climate'
import { useSolarStore } from '@renderer/stores/solar'
import { useAtmosphereStore } from '@renderer/stores/atmosphere'
import { useHydrologyStore } from '@renderer/stores/hydrology'
import { useLandformStore } from '@renderer/stores/landform'
import { usePopulationStore } from '@renderer/stores/population'
import { useTransportStore } from '@renderer/stores/transport'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useDecisionStore } from '@renderer/stores/decision'
import { registerPopulationTools } from '@renderer/ai/populationTools'
import { useCesiumViewer } from '@renderer/composables/useCesiumViewer'
import { useDrawing } from '@renderer/composables/useDrawing'
import { collectStrings, parsePositions, registerAnnotationTools } from '@renderer/ai/annotationTools'
import { useThematicLayers } from '@renderer/composables/useThematicLayers'
import { useTimezoneCompare } from '@renderer/composables/useTimezoneCompare'
import { useScenePlayer, type RecordingStep } from '@renderer/composables/useScenePlayer'
import { datePartsOf, dayLength, declinationForDate, formatClock, isValidDate, noonAltitudeDeg, sunTimes } from '@renderer/thematic/solarMath'
import { nearestBoundary, plateBoundaryKindName } from '@renderer/thematic/plateBoundaries'
import GlobeToolbar from '@renderer/components/GlobeToolbar.vue'
import CameraStatus from '@renderer/components/CameraStatus.vue'
import LayerPanel from '@renderer/components/LayerPanel.vue'
import AnnotationPanel from '@renderer/components/AnnotationPanel.vue'
import DrawingEditToolbar from '@renderer/components/DrawingEditToolbar.vue'
import InlineTextEditor from '@renderer/components/InlineTextEditor.vue'
import PlaceSearchBox from '@renderer/components/PlaceSearchBox.vue'
import WindParticles from '@renderer/components/WindParticles.vue'
import MonthTimeline from '@renderer/components/MonthTimeline.vue'
import SolarTimePanel from '@renderer/components/SolarTimePanel.vue'
import SolarPathPanel from '@renderer/components/SolarPathPanel.vue'
import ObliquityPanel from '@renderer/components/ObliquityPanel.vue'
import RotationSpeedPanel from '@renderer/components/RotationSpeedPanel.vue'
import ThermalCirculationPanel from '@renderer/components/ThermalCirculationPanel.vue'
import AtmosphereHeatingPanel from '@renderer/components/AtmosphereHeatingPanel.vue'
import AtmosphereLayersPanel from '@renderer/components/AtmosphereLayersPanel.vue'
import TyphoonOverlay from '@renderer/components/TyphoonOverlay.vue'
import WalkerCirculationOverlay from '@renderer/components/WalkerCirculationOverlay.vue'
import EnsoPanel from '@renderer/components/EnsoPanel.vue'
import WaterCyclePanel from '@renderer/components/WaterCyclePanel.vue'
import OceanPropertyPanel from '@renderer/components/OceanPropertyPanel.vue'
import TideWavePanel from '@renderer/components/TideWavePanel.vue'
import WaterBodyPanel from '@renderer/components/WaterBodyPanel.vue'
import FoldFaultPanel from '@renderer/components/FoldFaultPanel.vue'
import RiverLandformPanel from '@renderer/components/RiverLandformPanel.vue'
import LandformGuidePanel from '@renderer/components/LandformGuidePanel.vue'
import ExogenicPanel from '@renderer/components/ExogenicPanel.vue'
import EarthLayersPanel from '@renderer/components/EarthLayersPanel.vue'
import TimezonePanel from '@renderer/components/TimezonePanel.vue'
import PopulationPanel from '@renderer/components/PopulationPanel.vue'
import CitiesPanel from '@renderer/components/CitiesPanel.vue'
import TransportPanel from '@renderer/components/TransportPanel.vue'
import EnvironmentPanel from '@renderer/components/EnvironmentPanel.vue'
import LocationDecisionPanel from '@renderer/components/LocationDecisionPanel.vue'
import HuLineOverlay from '@renderer/components/HuLineOverlay.vue'
import ThematicLegend from '@renderer/components/ThematicLegend.vue'
import FrontalCyclone from '@renderer/components/FrontalCyclone.vue'
import ThematicInfoCard from '@renderer/components/ThematicInfoCard.vue'
import TeachingLab from '@renderer/components/TeachingLab.vue'
import SceneBookmarksPanel, { type SceneEditPayload } from '@renderer/components/SceneBookmarksPanel.vue'
import ScenePlayerOverlay from '@renderer/components/ScenePlayerOverlay.vue'
import EoqAssistant from '@renderer/components/EoqAssistant.vue'
import SettingsModal from '@renderer/components/SettingsModal.vue'
import UpdateDialog from '@renderer/components/UpdateDialog.vue'
import FailureBanner from '@renderer/components/FailureBanner.vue'
import CrashDialog from '@renderer/components/CrashDialog.vue'
import FirstUseGuide from '@renderer/components/FirstUseGuide.vue'

const store = useGlobeStore()
const {
  isLayerPanelOpen,
  layers,
  selectedLayerId,
  globeError,
  terrainError,
  isGlobeReady,
  globeLoadTimedOut,
  globeLoadStage,
  activeTerrainId,
  camera,
  levelViewActive,
  terrainProviderId,
  terrainExaggeration,
  terrainLighting
} =
  storeToRefs(store)
const settingsWindow = useSettingsWindowStore()

const globeContainer = ref<HTMLDivElement>()
const { viewer, switchBasemap, setLayerOpacity, flyTo, flyToPlace, toggleLevelView, setTerrain, setTerrainExaggeration, setTerrainLighting } = useCesiumViewer(globeContainer)
const { flyToShape } = useDrawing(viewer)
const { comparison: timezoneComparison, closeTimezoneCompare } = useTimezoneCompare(viewer)
const climateStore = useClimateStore()
const solarStore = useSolarStore()
const atmosphereStore = useAtmosphereStore()
const hydrologyStore = useHydrologyStore()
const landformStore = useLandformStore()
const populationStore = usePopulationStore()
const transportStore = useTransportStore()
const environmentStore = useEnvironmentStore()
const decisionStore = useDecisionStore()
const { overlays: thematicOverlays } = storeToRefs(climateStore)
useThematicLayers(viewer)
registerPopulationTools()

const drawingStore = useDrawingStore()
const { activeTool, shapes, entries, selectedShapeId, saveError } = storeToRefs(drawingStore)
const aiStore = useAiStore()
const updaterStore = useUpdaterStore()
const failureStore = useFailureStore()
const scenesStore = useScenesStore()
const isScenesPanelOpen = ref(false)
const scenePlayer = useScenePlayer(viewer, switchBasemap)
const firstUseGuide = ref<InstanceType<typeof FirstUseGuide> | null>(null)
const recordingDirectoryDialogOpen = ref(false)
const recordingDirectoryDialogBusy = ref(false)
const recordingDirectoryDialogError = ref('')
let recordingDirectoryResolver: ((selected: boolean) => void) | null = null
const isAnnotationPanelOpen = ref(false)
const systemFonts = ref(['Arial', 'Segoe UI', 'Microsoft YaHei'])
const selectedShape = computed(() => shapes.value.find((shape) => shape.id === selectedShapeId.value) ?? null)
const levelSwitcherVisible = computed(() => isGlobeReady.value && camera.value.height < 5000000)
const showGlobeLoading = computed(() => !isGlobeReady.value)
const globeLoadingText = computed(() => globeError.value ? '地图尚未显示，请检查网络或重试' : globeLoadTimedOut.value ? '地图加载较慢，请检查网络' : '正在加载地图…')
const globeLoadingRetryable = computed(() => globeLoadTimedOut.value || Boolean(globeError.value))
const isLabOpen = ref(false)
const nightBasemapActive = computed(() => store.selectedLayerId === 'viirs-night')
const labActive = computed(() => climateStore.hasActiveOverlay || solarStore.active || solarStore.motionPanel !== null || atmosphereStore.panel !== null || hydrologyStore.panel !== null || landformStore.panel !== null || populationStore.panel !== null || transportStore.panel !== null || environmentStore.panel !== null || decisionStore.panel !== null || activeTool.value === 'timezone')

function closeAllTeachingPanels(): void {
  solarStore.setMotionPanel(null)
  atmosphereStore.setPanel(null)
  hydrologyStore.setPanel(null)
  landformStore.setPanel(null)
  populationStore.setPanel(null)
  transportStore.setPanel(null)
  environmentStore.setPanel(null)
  decisionStore.setPanel(null)
  closeTimezoneCompare()
}

function closeAllTeachingFeatures(): void {
  closeAllTeachingPanels()
  for (const layer of thematicLayerCatalog) climateStore.setOverlay(layer.id, false)
}

watch(nightBasemapActive, (active) => {
  if (!active) return
  closeAllTeachingFeatures()
  isLabOpen.value = false
})
const drawHint = computed(() => {
  if (!activeTool.value) return ''
  if (activeTool.value === 'timezone') return '单击选取两个地点对比地方时 · Esc 退出'
  if (activeTool.value === 'text') return '在地球上单击放置文本框 · Esc 退出'
  if (activeTool.value === 'arrow') return '依次单击箭头起点和终点 · Esc 取消'
  return activeTool.value === 'point' ? '在地球上单击以放置点' : '单击加点 · 双击或右键完成 · Esc 取消'
})

aiStore.registerTool({
  label: '视角飞行',
  definition: {
    name: 'fly_to',
    description: '将地球视角飞行到指定 WGS-84 经纬度坐标处，用于向用户展示地点或地貌。',
    parameters: {
      type: 'object',
      properties: {
        longitude: { type: 'number', description: '经度（WGS-84，-180 到 180）' },
        latitude: { type: 'number', description: '纬度（WGS-84，-90 到 90）' },
        height: { type: 'number', description: '视点高度（米），省略时为 60000' }
      },
      required: ['longitude', 'latitude']
    }
  },
  execute: async (args) => {
    const longitude = Number(args.longitude)
    const latitude = Number(args.latitude)
    const height = args.height === undefined ? 60000 : Number(args.height)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return { error: '坐标无效，需要 WGS-84 经纬度' }
    if (!Number.isFinite(height) || height <= 0 || height > 20000000) return { error: '视点高度无效' }
    const actualHeight = await flyTo(longitude, latitude, height)
    if (actualHeight === undefined) return { error: '飞行已取消' }
    return { status: 'ok', message: `视角已飞往 ${longitude.toFixed(4)}, ${latitude.toFixed(4)}`, longitude, latitude, height: actualHeight }
  }
})

aiStore.registerTool({
  label: '地形高程查询',
  definition: {
    name: 'query_terrain',
    description: '查询某 WGS-84 经纬度位置的地表海拔（米，椭球高）。用于讲解地形、山脉高度等。',
    parameters: {
      type: 'object',
      properties: {
        longitude: { type: 'number', description: '经度（WGS-84）' },
        latitude: { type: 'number', description: '纬度（WGS-84）' }
      },
      required: ['longitude', 'latitude']
    }
  },
  execute: async (args) => {
    const current = viewer.value
    if (!current || current.isDestroyed()) return { error: '地球尚未就绪' }
    const longitude = Number(args.longitude)
    const latitude = Number(args.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return { error: '坐标无效' }
    const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude)
    try {
      const [sampled] = await Cesium.sampleTerrainMostDetailed(current.terrainProvider, [cartographic.clone()])
      if (sampled && Number.isFinite(sampled.height)) return { height: Math.round(sampled.height * 100) / 100, unit: '米（WGS-84 椭球高）', longitude, latitude }
    } catch {
      void 0
    }
    const fallback = current.scene.globe.getHeight(cartographic)
    return typeof fallback === 'number' && Number.isFinite(fallback)
      ? { height: Math.round(fallback * 100) / 100, unit: '米（已加载地形近似值）', longitude, latitude }
      : { error: '该位置地形数据暂不可用，可稍后重试或先用 fly_to 飞往附近再查询' }
  }
})

aiStore.registerTool({
  label: '获取当前视角',
  definition: {
    name: 'get_camera',
    description: '获取当前地球视角：中心点经纬度、视点高度、朝向与俯仰角。用于回答“我现在看到的是哪里”。',
    parameters: { type: 'object', properties: {} }
  },
  execute: async () => ({
    longitude: Math.round(camera.value.longitude * 10000) / 10000,
    latitude: Math.round(camera.value.latitude * 10000) / 10000,
    height: Math.round(camera.value.height),
    heading: Math.round(camera.value.heading * 10) / 10,
    pitch: Math.round(camera.value.pitch * 10) / 10
  })
})

registerAnnotationTools()

aiStore.registerTool({
  label: '视角截图',
  definition: {
    name: 'capture_view',
    description: '截取当前地球视角的纯地图画面（不含任何界面控件）作为图片，并返回观察上下文：中心经纬度、视点高度、朝向、俯仰角与可见地理范围。用于回答“看看这里”“这是不是某种地貌”“我现在看到的是什么”等基于当前画面的问题。',
    parameters: { type: 'object', properties: {} }
  },
  execute: async () => {
    const current = viewer.value
    if (!current || current.isDestroyed()) return { error: '地球尚未就绪' }
    const canvas = current.scene.canvas
    const viewContext = () => {
      const cartographic = current.camera.positionCartographic
      const headingDegrees = Cesium.Math.toDegrees(current.camera.heading)
      const picked = [[0, 0], [canvas.clientWidth, 0], [0, canvas.clientHeight], [canvas.clientWidth, canvas.clientHeight]]
        .map(([x, y]) => current.camera.pickEllipsoid(new Cesium.Cartesian2(x, y), current.scene.globe.ellipsoid))
        .filter((cartesian): cartesian is Cesium.Cartesian3 => Boolean(cartesian))
        .map((cartesian) => Cesium.Cartographic.fromCartesian(cartesian))
      const extent = picked.length >= 3
        ? {
            west: Math.round(Cesium.Math.toDegrees(Math.min(...picked.map((item) => item.longitude))) * 10000) / 10000,
            south: Math.round(Cesium.Math.toDegrees(Math.min(...picked.map((item) => item.latitude))) * 10000) / 10000,
            east: Math.round(Cesium.Math.toDegrees(Math.max(...picked.map((item) => item.longitude))) * 10000) / 10000,
            north: Math.round(Cesium.Math.toDegrees(Math.max(...picked.map((item) => item.latitude))) * 10000) / 10000
          }
        : undefined
      return {
        camera: {
          longitude: Math.round(Cesium.Math.toDegrees(cartographic.longitude) * 10000) / 10000,
          latitude: Math.round(Cesium.Math.toDegrees(cartographic.latitude) * 10000) / 10000,
          height: Math.round(cartographic.height),
          heading: Math.round(headingDegrees < 0 ? headingDegrees + 360 : headingDegrees),
          pitch: Math.round(Cesium.Math.toDegrees(current.camera.pitch) * 10) / 10
        },
        extent
      }
    }
    if (!aiStore.activeModelVisionEnabled()) {
      return {
        status: 'vision_disabled',
        ...viewContext(),
        guidance: '当前模型未开启「视觉」能力，不会接收截图图片，本次已改为返回当前视角的文字信息（camera 与 extent）。请依据这些文本信息尽量回答；同时提醒用户：若该模型实际支持图像输入，可在「AI 设置」的模型列表中开启「视觉」开关后重试。'
      }
    }
    const loadStart = Date.now()
    while (!current.scene.globe.tilesLoaded && Date.now() - loadStart < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height))
    const offscreen = document.createElement('canvas')
    offscreen.width = Math.max(1, Math.round(canvas.width * scale))
    offscreen.height = Math.max(1, Math.round(canvas.height * scale))
    const context = offscreen.getContext('2d')
    if (!context) return { error: '截图失败' }
    context.drawImage(canvas, 0, 0, offscreen.width, offscreen.height)
    const image = offscreen.toDataURL('image/jpeg', 0.85)
    if (!image.startsWith('data:image/')) return { error: '截图失败' }
    return {
      status: 'ok',
      screenshot: true,
      image,
      imageWidth: offscreen.width,
      imageHeight: offscreen.height,
      ...viewContext()
    }
  }
})

aiStore.registerTool({
  label: '模拟时间设置',
  definition: {
    name: 'set_sim_time',
    description: '设置太阳光照模拟的日期与时刻（北京时间）并开启昼夜光照渲染，用于演示晨昏线、昼夜交替、极昼极夜与太阳直射点季节移动。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '模拟日期，格式 YYYY-MM-DD，如 2026-06-22（夏至）。省略保持当前日期' },
        hour: { type: 'number', description: '模拟时刻（北京时间，0-24 的小时数，可用小数如 12.5 表示 12:30）。省略保持当前时刻' },
        play: { type: 'boolean', description: 'true 时自动播放昼夜交替动画（每秒约 1.5 小时）' }
      }
    }
  },
  execute: async (args) => {
    if (args.date !== undefined) {
      if (!isValidDate(args.date)) return { error: 'date 需为合法的 YYYY-MM-DD 日期' }
      solarStore.setDate(args.date)
    }
    if (args.hour !== undefined) {
      const hour = Number(args.hour)
      if (!Number.isFinite(hour) || hour < 0 || hour >= 24) return { error: 'hour 需为 0-24 的小时数' }
      solarStore.setHour(hour)
    }
    if (typeof args.play === 'boolean') solarStore.isPlaying = args.play
    solarStore.setActive(true)
    return {
      status: 'ok',
      date: solarStore.date,
      hourBeijing: solarStore.hour,
      utc: new Date(solarStore.utcMs).toISOString(),
      playing: solarStore.isPlaying,
      message: '昼夜光照已开启；可配合 fly_to 以 8000000-15000000 米高度展示晨昏线'
    }
  }
})

aiStore.registerTool({
  label: '昼夜与太阳高度计算',
  definition: {
    name: 'query_solar',
    description: '计算某纬度在指定日期的昼长、正午太阳高度角、日出日落地方时与极昼/极夜状态。用于讲解昼夜长短、太阳高度随纬度与季节的变化。',
    parameters: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: '纬度（-90 到 90，北纬为正）' },
        date: { type: 'string', description: '日期 YYYY-MM-DD，省略时使用当前模拟日期' }
      },
      required: ['latitude']
    }
  },
  execute: async (args) => {
    const latitude = Number(args.latitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { error: '纬度无效，需 -90 到 90' }
    let dateStr = solarStore.date
    if (args.date !== undefined) {
      if (!isValidDate(args.date)) return { error: 'date 需为合法的 YYYY-MM-DD 日期' }
      dateStr = args.date
    }
    const { month, day } = datePartsOf(dateStr)
    const declination = declinationForDate(month, day)
    const length = dayLength(latitude, declination)
    const times = sunTimes(latitude, declination)
    const round1 = (value: number) => Math.round(value * 10) / 10
    return {
      latitude: round1(latitude),
      date: dateStr,
      declinationDeg: round1(declination),
      noonAltitudeDeg: round1(noonAltitudeDeg(latitude, declination)),
      dayLengthHours: round1(length.hours),
      polar: length.state === 'polar-day' ? '极昼' : length.state === 'polar-night' ? '极夜' : undefined,
      sunriseLocalSolarTime: times.sunrise !== undefined ? formatClock(times.sunrise) : undefined,
      sunsetLocalSolarTime: times.sunset !== undefined ? formatClock(times.sunset) : undefined,
      note: '日出日落为地方时（平太阳时近似）'
    }
  }
})

aiStore.registerTool({
  label: '专题图层开关',
  definition: {
    name: 'set_layer',
    description: '开关教学专题图层并可选设置月份（1-12），用于讲解气压带与风带、气候类型、锋面气旋、洋流等。气压带风带图层会随月份在1月与7月位置间移动，适合对比讲解。',
    parameters: {
      type: 'object',
      properties: {
        layerId: {
          type: 'string',
          enum: thematicLayerCatalog.map((layer) => layer.id),
          description: '图层 id：pressure-belts 气压带与风带、koppen-zones 世界气候类型、frontal-cyclone 锋面气旋、ocean-currents 世界洋流、climate-zones 中国气候区、coriolis-demo 地转偏向力等'
        },
        enabled: { type: 'boolean', description: 'true 开启图层，false 关闭图层' },
        month: { type: 'number', description: '1-12 的月份整数，设置专题时间轴（如 1 月与 7 月对比气压带位置）' }
      },
      required: ['layerId', 'enabled']
    }
  },
  execute: async (args) => {
    const layer = thematicLayerCatalog.find((item) => item.id === args.layerId)
    if (!layer) return { error: `未知图层 ${String(args.layerId)}，可用图层：${thematicLayerCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }
    if (typeof args.enabled !== 'boolean') return { error: 'enabled 需为布尔值' }
    climateStore.setOverlay(layer.id, args.enabled)
    if (args.month !== undefined) {
      const month = Number(args.month)
      if (!Number.isFinite(month) || month < 1 || month > 12) return { error: 'month 需为 1-12 的月份' }
      climateStore.setMonth(month)
      climateStore.isPlaying = false
    }
    return {
      status: 'ok',
      layerId: layer.id,
      name: layer.name,
      enabled: args.enabled,
      month: climateStore.month,
      message: args.enabled
        ? `已开启「${layer.name}」图层${args.month !== undefined ? `并设置月份为 ${climateStore.month} 月` : ''}；可在地球上点击图层要素查看成因`
        : `已关闭「${layer.name}」图层`
    }
  }
})

const teachingPanelCatalog: { id: string; name: string; hint: string; open: () => void }[] = [
  { id: 'solar-path', name: '太阳视运动轨迹', hint: '展示某地当日太阳视运动路径与高度角变化', open: () => solarStore.setMotionPanel('solar-path') },
  { id: 'obliquity', name: '黄赤交角可调探究', hint: '调节黄赤交角观察直射点回归运动与五带划分的变化', open: () => solarStore.setMotionPanel('obliquity') },
  { id: 'rotation-speed', name: '自转速度与周期', hint: '演示自转线速度随纬度的变化与恒星日、太阳日的差异', open: () => solarStore.setMotionPanel('rotation-speed') },
  { id: 'circulation', name: '热力环流', hint: '播放海陆风、山谷风、城市热岛环流的动画', open: () => atmosphereStore.setPanel('circulation') },
  { id: 'heating', name: '大气受热过程', hint: '演示大气削弱作用与温室保温效应（可切换昼夜与云量状态）', open: () => atmosphereStore.setPanel('heating') },
  { id: 'layers', name: '大气垂直分层', hint: '展示气温随高度的垂直分布与各分层特征', open: () => atmosphereStore.setPanel('layers') },
  { id: 'water-cycle', name: '水循环', hint: '播放海陆间水循环各环节的动画并联动地球视角', open: () => hydrologyStore.setPanel('water-cycle') },
  { id: 'ocean-property', name: '海水温度与盐度', hint: '展示海水温度、盐度随纬度和深度的分布', open: () => hydrologyStore.setPanel('ocean-property') },
  { id: 'tide', name: '潮汐与波浪', hint: '演示潮汐周期、大潮小潮与潮差', open: () => hydrologyStore.setPanel('tide') },
  { id: 'water-bodies', name: '陆地水体与河流补给', hint: '演示河流补给类型与径流变化过程', open: () => hydrologyStore.setPanel('water-bodies') },
  { id: 'fold-fault', name: '褶皱与断层', hint: '展示褶皱与断层岩层剖面，可实地飞往典型地点', open: () => landformStore.setPanel('fold-fault') },
  { id: 'river', name: '河流地貌发育', hint: '讲解河流上中下游地貌并查看实测高程剖面', open: () => landformStore.setPanel('river') },
  { id: 'landform-guide', name: '典型地貌识别', hint: '按喀斯特、雅丹、冰川、海岸、黄土等类型实地飞行导览', open: () => landformStore.setPanel('landform-guide') },
  { id: 'exogenic', name: '外力作用过程', hint: '演示风化、侵蚀、搬运、堆积的外力作用链条', open: () => landformStore.setPanel('exogenic') },
  { id: 'earth-layers', name: '地球的圈层结构', hint: '展示地球内部圈层划分剖面', open: () => landformStore.setPanel('earth-layers') },
  {
    id: 'population',
    name: '人口数据面板',
    hint: '展示人口金字塔、城镇化曲线与胡焕庸线对比',
    open: () => populationStore.setPanel('population')
  },
  {
    id: 'cities',
    name: '城镇与中心地验证',
    hint: '展示城市等级体系，并可用 POI 统计对比验证中心地理论（需配置高德密钥）',
    open: () => populationStore.setPanel('cities')
  },
  {
    id: 'transport',
    name: '交通运输布局',
    hint: '播放 2008 年以来高铁网络生长动画，结合营业里程曲线与实地察看讲解',
    open: () => transportStore.setPanel('transport')
  },
  {
    id: 'environment',
    name: '海平面上升淹没模拟',
    hint: '选择上升情景，观察沿海低地淹没范围并查看面积估算（需真实地形源）',
    open: () => environmentStore.setPanel('environment')
  },
  {
    id: 'decision',
    name: '区位决策沙盘',
    hint: '在真实情境中勾选区位因素，请 AI 按高考答题结构点评你的取舍',
    open: () => decisionStore.setPanel('location')
  },
  {
    id: 'timezone-compare',
    name: '地方时对比',
    hint: '已进入地方时点选模式，请提示用户在地球上依次单击两个地点，出现「地方时对比」面板后即可讲解两地时差；按 Esc 退出点选模式',
    open: () => drawingStore.setActiveTool('timezone')
  }
]

aiStore.registerTool({
  label: '打开教学面板',
  definition: {
    name: 'open_panel',
    description: '打开教学演示面板配合讲解：热力环流、大气受热过程、大气垂直分层、水循环、海水温度与盐度、潮汐与波浪、陆地水体与河流补给、褶皱与断层、河流地貌发育、典型地貌识别、外力作用过程、地球的圈层结构、太阳视运动轨迹、黄赤交角可调探究、自转速度与周期、人口数据面板、城镇与中心地验证、交通运输布局、海平面上升淹没模拟、区位决策沙盘、地方时对比。close 为 true 时关闭全部教学面板。',
    parameters: {
      type: 'object',
      properties: {
        panelId: {
          type: 'string',
          enum: teachingPanelCatalog.map((panel) => panel.id),
          description: '面板 id：' + teachingPanelCatalog.map((panel) => `${panel.id}（${panel.name}）`).join('、')
        },
        close: { type: 'boolean', description: 'true 时关闭全部教学面板并退出地方时点选模式，忽略 panelId' }
      }
    }
  },
  execute: async (args) => {
    if (args.close === true) {
      closeAllTeachingPanels()
      return { status: 'ok', closed: true, message: '已关闭全部教学演示面板' }
    }
    const panel = teachingPanelCatalog.find((item) => item.id === args.panelId)
    if (!panel) return { error: `未知面板 ${String(args.panelId)}，可用面板：${teachingPanelCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }
    if (nightBasemapActive.value) return { error: '夜光模式下教学面板不可用，请先用 set_basemap 切回其他底图' }
    panel.open()
    return { status: 'ok', panelId: panel.id, name: panel.name, message: `已打开「${panel.name}」面板：${panel.hint}` }
  }
})

const basemapChoices = basemapCategories
  .map((category) => providerCatalog.find((provider) => provider.id === category.providerIds[0]))
  .filter((provider): provider is (typeof providerCatalog)[number] => Boolean(provider))

aiStore.registerTool({
  label: '切换底图',
  definition: {
    name: 'set_basemap',
    description: '切换地球底图样式：道路底图看城镇与区位、卫星影像看真实地貌与土地利用、地形晕渲看地势起伏与山脉走向，用于配合讲解更换地图样式。',
    parameters: {
      type: 'object',
      properties: {
        basemapId: {
          type: 'string',
          enum: basemapChoices.map((provider) => provider.id),
          description: '底图 id：' + basemapChoices.map((provider) => `${provider.id}（${provider.name}，${provider.description}）`).join('、')
        }
      },
      required: ['basemapId']
    }
  },
  execute: async (args) => {
    const basemap = basemapChoices.find((provider) => provider.id === args.basemapId)
    if (!basemap) return { error: `未知底图 ${String(args.basemapId)}，可用底图：${basemapChoices.map((provider) => `${provider.id}（${provider.name}）`).join('、')}` }
    if (store.selectedLayerId === basemap.id) return { status: 'ok', basemapId: basemap.id, name: basemap.name, message: `当前已是「${basemap.name}」底图` }
    switchBasemap(basemap.id)
    return { status: 'ok', basemapId: basemap.id, name: basemap.name, message: `已切换到「${basemap.name}」底图（${basemap.description}）` }
  }
})

aiStore.registerTool({
  label: '地形设置',
  definition: {
    name: 'set_terrain',
    description: '设置地球地形渲染：切换地形数据源、调整垂直夸张倍数、开关地形太阳光照。讲山地、褶皱、河谷等起伏地貌时夸大垂直比例观察更直观，讲完建议恢复正常比例。',
    parameters: {
      type: 'object',
      properties: {
        terrainId: {
          type: 'string',
          enum: terrainCatalog.map((terrain) => terrain.id),
          description: '地形数据源：' + terrainCatalog.map((terrain) => `${terrain.id}（${terrain.name}，${terrain.description}）`).join('、')
        },
        exaggeration: { type: 'number', description: '垂直夸张倍数（1-5）：1 为真实比例，讲山系褶皱、峡谷下切可用 3-5' },
        lighting: { type: 'boolean', description: '地形太阳光照开关，开启后山脉有明暗立体感' }
      }
    }
  },
  execute: async (args) => {
    let terrain: (typeof terrainCatalog)[number] | undefined
    if (args.terrainId !== undefined) {
      terrain = terrainCatalog.find((item) => item.id === args.terrainId)
      if (!terrain) return { error: `未知地形 ${String(args.terrainId)}，可用地形：${terrainCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }
    }
    let exaggeration: number | undefined
    if (args.exaggeration !== undefined) {
      const value = Number(args.exaggeration)
      if (!Number.isFinite(value) || value < 1 || value > 5) return { error: 'exaggeration 需为 1-5 的数字' }
      exaggeration = Math.round(value * 10) / 10
    }
    let lighting: boolean | undefined
    if (args.lighting !== undefined) {
      if (typeof args.lighting !== 'boolean') return { error: 'lighting 需为布尔值' }
      lighting = args.lighting
    }
    if (!terrain && exaggeration === undefined && lighting === undefined) return { error: '请至少提供 terrainId、exaggeration 或 lighting 之一' }
    const applied: string[] = []
    if (terrain) {
      setTerrain(terrain.id)
      applied.push(`地形切换为「${terrain.name}」`)
    }
    if (exaggeration !== undefined) {
      setTerrainExaggeration(exaggeration)
      applied.push(`垂直夸张 ${store.terrainExaggeration}×`)
    }
    if (lighting !== undefined) {
      setTerrainLighting(lighting)
      applied.push(`地形光照已${lighting ? '开启' : '关闭'}`)
    }
    return { status: 'ok', terrainId: terrain?.id, exaggeration: store.terrainExaggeration, lighting: store.terrainLighting, message: applied.join('，') }
  }
})

aiStore.registerTool({
  label: '地貌成因分析',
  definition: {
    name: 'explain_landform',
    description: '查询某 WGS-84 经纬度的地表海拔与最近的板块边界（名称、边界类型、距离），用于分析地貌成因、讲解板块运动与地表形态塑造。',
    parameters: {
      type: 'object',
      properties: {
        longitude: { type: 'number', description: '经度（WGS-84，-180 到 180）' },
        latitude: { type: 'number', description: '纬度（WGS-84，-90 到 90）' }
      },
      required: ['longitude', 'latitude']
    }
  },
  execute: async (args) => {
    const current = viewer.value
    if (!current || current.isDestroyed()) return { error: '地球尚未就绪' }
    const longitude = Number(args.longitude)
    const latitude = Number(args.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return { error: '坐标无效，需要 WGS-84 经纬度' }
    const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude)
    let heightMeters: number | null = null
    try {
      const [sampled] = await Cesium.sampleTerrainMostDetailed(current.terrainProvider, [cartographic.clone()])
      if (sampled && Number.isFinite(sampled.height)) heightMeters = Math.round(sampled.height * 100) / 100
    } catch {
      void 0
    }
    if (heightMeters === null) {
      const fallback = current.scene.globe.getHeight(cartographic)
      if (typeof fallback === 'number' && Number.isFinite(fallback)) heightMeters = Math.round(fallback * 100) / 100
    }
    const nearest = nearestBoundary(longitude, latitude)
    const distanceKm = Math.round(nearest.distanceKm)
    return {
      longitude,
      latitude,
      heightMeters: heightMeters ?? undefined,
      heightNote: heightMeters === null ? '该位置地形数据暂不可用' : undefined,
      nearestBoundary: {
        name: nearest.boundary.name,
        kind: nearest.boundary.kind,
        kindName: plateBoundaryKindName[nearest.boundary.kind],
        distanceKm
      },
      hint: distanceKm <= 600
        ? '距板块边界较近，地貌成因以内力作用为主（板块碰撞挤压、俯冲、岩浆活动），可再结合外力作用分析'
        : '距板块边界较远，属板内环境，重点考虑外力作用（流水、风力、冰川、海浪）与岩石性质、地质构造'
    }
  }
})

aiStore.registerTool({
  label: '保存教学场景',
  definition: {
    name: 'save_scene',
    description: '把当前地球视角、图层与时间状态保存为「教学场景」书签，供课堂一键回放。适合老师备课或讲解到重要画面时收藏。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '场景名称（如“夏至晨昏线与极昼”）' },
        narration: { type: 'string', description: '可选旁白字幕，播放时显示在画面下方' }
      },
      required: ['name']
    }
  },
  execute: async (args) => {
    const name = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : ''
    if (!name) return { error: '需要提供场景名称' }
    const narration = typeof args.narration === 'string' ? args.narration.trim().slice(0, 500) : ''
    try {
      const scene = scenePlayer.captureScene(name, narration)
      await scenesStore.addScene(scene)
      if (scenesStore.saveError) return { error: `场景保存失败：${scenesStore.saveError}` }
      return { status: 'ok', id: scene.id, name, hint: '场景已保存，可在底部工具栏「教学场景」面板中查看、排序与播放' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '地球尚未就绪，无法捕获当前画面' }
    }
  }
})

aiStore.registerTool({
  label: '查看教学场景',
  definition: {
    name: 'list_scenes',
    description: '列出已保存的教学场景书签（含顺序、名称、旁白、图层与相机），用于回答“我存了哪些场景”或为录制视频复用位置。',
    parameters: { type: 'object', properties: {} }
  },
  execute: async () => {
    await scenesStore.hydrate()
    return {
      count: scenesStore.scenes.length,
      scenes: scenesStore.scenes.map((scene, index) => ({
        order: index + 1,
        id: scene.id,
        name: scene.name,
        narration: scene.narration || undefined,
        layers: scene.snapshot.overlays,
        month: scene.snapshot.month,
        solarSimulation: Boolean(scene.snapshot.simTime),
        camera: {
          longitude: Math.round(scene.snapshot.camera.longitude * 10000) / 10000,
          latitude: Math.round(scene.snapshot.camera.latitude * 10000) / 10000,
          height: Math.round(scene.snapshot.camera.height)
        }
      }))
    }
  }
})

const MAX_RECORD_STEPS = 12

async function ensureRecordingDirectory(): Promise<boolean> {
  try {
    if (await window.guEarth.recordings.getDirectory()) return true
  } catch {
    recordingDirectoryDialogError.value = '暂时无法检查视频保存文件夹，请重新选择'
  }
  if (recordingDirectoryResolver) return false
  recordingDirectoryDialogError.value = ''
  recordingDirectoryDialogOpen.value = true
  return new Promise((resolve) => {
    recordingDirectoryResolver = resolve
  })
}

async function chooseRecordingDirectory(): Promise<void> {
  recordingDirectoryDialogBusy.value = true
  recordingDirectoryDialogError.value = ''
  try {
    const directory = await window.guEarth.recordings.chooseDirectory()
    if (directory) {
      recordingDirectoryDialogOpen.value = false
      recordingDirectoryResolver?.(true)
      recordingDirectoryResolver = null
    }
  } catch (error) {
    recordingDirectoryDialogError.value = error instanceof Error ? error.message : '选择视频保存文件夹失败'
  } finally {
    recordingDirectoryDialogBusy.value = false
  }
}

function cancelRecordingDirectory(): void {
  recordingDirectoryDialogOpen.value = false
  recordingDirectoryResolver?.(false)
  recordingDirectoryResolver = null
}

function parseRecordingStep(raw: unknown, index: number): RecordingStep | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: `第 ${index + 1} 步格式无效` }
  const record = raw as Record<string, unknown>
  const longitude = Number(record.longitude)
  const latitude = Number(record.latitude)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { error: `第 ${index + 1} 步缺少有效经纬度` }
  const height = record.height === undefined ? 600000 : Number(record.height)
  if (!Number.isFinite(height) || height <= 0 || height > 20000000) return { error: `第 ${index + 1} 步视点高度无效` }
  const clampedHeight = Math.min(12000000, Math.max(10000, height))
  const heading = record.heading === undefined ? 0 : Number(record.heading)
  const pitch = record.pitch === undefined ? -90 : Number(record.pitch)
  if (!Number.isFinite(heading) || heading < -360 || heading > 360 || !Number.isFinite(pitch) || pitch < -90 || pitch > 90) return { error: `第 ${index + 1} 步朝向参数无效` }
  const requestedOverlays = collectStrings(record.overlays)
  const knownOverlays = thematicLayerCatalog.filter((layer) => requestedOverlays.includes(layer.id)).map((layer) => layer.id)
  const month = record.month === undefined ? climateStore.month : Number(record.month)
  if (!Number.isFinite(month) || month < 1 || month > 12) return { error: `第 ${index + 1} 步 month 需为 1-12` }
  let simTime: { date: string; hour: number } | null = null
  if (record.simTime !== null && record.simTime !== undefined) {
    if (typeof record.simTime !== 'object') return { error: `第 ${index + 1} 步 simTime 格式无效` }
    const time = record.simTime as Record<string, unknown>
    if (typeof time.date !== 'string' || !isValidDate(time.date)) return { error: `第 ${index + 1} 步 simTime.date 需为合法 YYYY-MM-DD` }
    const hour = time.hour === undefined ? 12 : Number(time.hour)
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) return { error: `第 ${index + 1} 步 simTime.hour 需为 0-24` }
    simTime = { date: time.date, hour }
  }
  const markers = Array.isArray(record.markers)
    ? record.markers.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return []
        const entry = item as Record<string, unknown>
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 200) : ''
        const longitude = Number(entry.longitude)
        const latitude = Number(entry.latitude)
        if (!name || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return []
        return [{ name, longitude, latitude }]
      })
    : []
  const shapes = Array.isArray(record.shapes)
    ? record.shapes.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return []
        const entry = item as Record<string, unknown>
        if (entry.kind !== 'polyline' && entry.kind !== 'polygon') return []
        const positions = parsePositions(entry.points, entry.kind === 'polygon' ? 3 : 2)
        if (!positions) return []
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 200) : ''
        return [{ kind: entry.kind as 'polyline' | 'polygon', name, positions }]
      })
    : []
  const dwellMs = record.dwellMs === undefined ? 6000 : Number(record.dwellMs)
  const flyDurationMs = record.flyMs === undefined ? 3500 : Number(record.flyMs)
  return {
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 80) : `第 ${index + 1} 幕`,
    narration: typeof record.narration === 'string' ? record.narration.trim().slice(0, 500) : '',
    camera: { longitude, latitude, height: clampedHeight, heading, pitch },
    basemapId: store.selectedLayerId,
    overlays: knownOverlays,
    month: Math.round(month),
    simTime,
    dwellMs: Math.min(60000, Math.max(1000, dwellMs)),
    flyDurationMs: Math.min(15000, Math.max(500, flyDurationMs)),
    markers,
    shapes
  }
}

aiStore.registerTool({
  label: '录制教学视频',
  definition: {
    name: 'record_video',
    description: '按剧本自动录制教学视频：依次飞到各场景、开关图层、叠加标注与旁白字幕，完成后保存为视频文件。首次录制会请用户选择保存文件夹，后续自动复用。用户说“帮我录一个XX的介绍视频/微课”时使用，把完整剧本通过 steps 一次性传入，不要逐步调用其他工具执行。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '视频标题，将显示在画面左上角' },
        steps: {
          type: 'array',
          description: '剧本步骤（3-8 幕为宜，按播放顺序排列）',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '本幕名称（如“胡焕庸线”）' },
              longitude: { type: 'number', description: '本幕画面中心点经度（WGS-84，讲解目标始终保持居中）' },
              latitude: { type: 'number', description: '本幕画面中心点纬度（WGS-84，讲解目标始终保持居中）' },
              height: { type: 'number', description: '本幕视点高度（米），默认 600000。宁远勿近，观众要看清地理格局而非街道：国家/大区域尺度 800000-3000000，省域/城市群 200000-800000，单个城市 80000-200000，地貌细节也不低于 15000' },
              heading: { type: 'number', description: '可选朝向角（度，默认 0）' },
              pitch: { type: 'number', description: '可选俯仰角（度，-90 正俯视为默认，看地形起伏可用 -55 至 -70，中心点仍保持画面居中）' },
              overlays: { type: 'array', description: '本幕开启的教学图层 id 列表（未列出的图层会被关闭），可选项：' + thematicLayerCatalog.map((layer) => `${layer.id}（${layer.name}）`).join('、'), items: { type: 'string' } },
              month: { type: 'number', description: '可选专题月份 1-12（配合季节性图层对比 1 月/7 月）' },
              simTime: { type: 'object', description: '可选昼夜模拟 { date: "YYYY-MM-DD", hour: 北京时间 0-24 }，如夏至 2026-06-22', properties: { date: { type: 'string' }, hour: { type: 'number' } } },
              markers: { type: 'array', description: '命名标记点数组：本幕讲解到的具体地点务必标注（名称用规范地名），便于观众看清讲解位置', items: { type: 'object', properties: { name: { type: 'string' }, longitude: { type: 'number' }, latitude: { type: 'number' } }, required: ['name', 'longitude', 'latitude'] } },
              shapes: { type: 'array', description: '可选线/多边形数组（如胡焕庸线、区域边界）', items: { type: 'object', properties: { kind: { type: 'string', enum: ['polyline', 'polygon'] }, name: { type: 'string' }, points: { type: 'array', items: { type: 'object', properties: { longitude: { type: 'number' }, latitude: { type: 'number' } }, required: ['longitude', 'latitude'] } } }, required: ['kind', 'points'] } },
              narration: { type: 'string', description: '本幕旁白字幕，1-3 句精炼讲解' },
              dwellMs: { type: 'number', description: '可选本幕停留毫秒数（默认 6000，建议 4000-10000）' },
              flyMs: { type: 'number', description: '可选飞往本幕的飞行时长毫秒数（默认 3500）' }
            },
            required: ['longitude', 'latitude']
          }
        }
      },
      required: ['steps']
    }
  },
  execute: async (args) => {
    if (!Array.isArray(args.steps) || !args.steps.length) return { error: 'steps 需为非空数组' }
    if (args.steps.length > MAX_RECORD_STEPS) return { error: `单次录制最多 ${MAX_RECORD_STEPS} 幕，请精简剧本` }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 80) : '地理教学视频'
    const steps: RecordingStep[] = []
    for (let index = 0; index < args.steps.length; index += 1) {
      const step = parseRecordingStep(args.steps[index], index)
      if ('error' in step) return { error: step.error }
      steps.push(step)
    }
    if (!await ensureRecordingDirectory()) return { error: '已取消视频保存文件夹选择，录制未开始' }
    const result = await scenePlayer.recordVideo(title, steps)
    if ('error' in result) return { error: result.error }
    return {
      status: 'started',
      title,
      totalSteps: result.totalSteps,
      estimatedSeconds: result.estimatedSeconds,
      message: `录制已在后台开始，共 ${result.totalSteps} 幕，约 ${result.estimatedSeconds} 秒；完成后自动保存到已选择的文件夹并打开所在位置。期间用户可按 Esc 取消录制，取消后不会保留视频文件。`
    }
  }
})

aiStore.registerTool({
  label: '查询录制进度',
  definition: {
    name: 'get_recording_status',
    description: '查询自动录制视频的进度：准备中/录制中第几幕/保存中/已完成（含保存路径）/失败。用户询问录制进度或录制久久未结束时使用。',
    parameters: { type: 'object', properties: {} }
  },
  execute: async () => {
    const recording = scenesStore.recording
    return {
      state: recording.state,
      title: recording.title || undefined,
      currentStep: recording.currentStep,
      totalSteps: recording.totalSteps,
      videoPath: recording.videoPath || undefined,
      fps: recording.fps ? Math.round(recording.fps * 10) / 10 : undefined,
      error: recording.error || undefined,
      cancelled: recording.cancelled || undefined
    }
  }
})

onMounted(async () => {
  void updaterStore.hydrate()
  void scenesStore.hydrate()
  try {
    const installedFonts = await window.guEarth.system.fonts()
    const existingFonts = shapes.value.map((shape) => shape.fontFamily)
    systemFonts.value = [...new Set([...installedFonts, ...existingFonts])].sort((first, second) => first.localeCompare(second))
  } catch {
    systemFonts.value = ['Arial', 'Segoe UI', 'Microsoft YaHei']
  }
})

function handleOpenLayers(): void {
  aiStore.setPanelOpen(false)
  store.setLayerPanelOpen(true)
}

function handleOpenAssistant(): void {
  store.setLayerPanelOpen(false)
  aiStore.setPanelOpen(true)
}

function handleSetupGuideStepChange(step: number): void {
  settingsWindow.close()
  aiStore.setPanelOpen(false)
  if (step === 6) settingsWindow.open('map')
  if (step === 8) settingsWindow.open('ai')
}

function handleRestartGuide(): void {
  firstUseGuide.value?.start()
}

function handleOpenSettings(): void {
  settingsWindow.open()
}

function handleClosePanel(): void {
  store.setLayerPanelOpen(false)
}

function handleSelectLayer(id: string): void {
  switchBasemap(id)
}

function handleOpacityChange(id: string, opacity: number): void {
  setLayerOpacity(id, opacity)
}

function handleTerrainChange(id: string): void {
  setTerrain(id)
}

function handleTerrainExaggeration(value: number): void {
  setTerrainExaggeration(value)
}

function handleTerrainLighting(value: boolean): void {
  setTerrainLighting(value)
}

function handleHome(): void {
  flyTo(105, 35, 15000000)
}

function handleRetry(): void {
  for (const notice of failureStore.active) {
    if (notice.retryable) void failureStore.retry(notice.scope)
  }
}

function handleLevelViewToggle(): void {
  toggleLevelView()
}

function handleUpdateClick(): void {
  if (updaterStore.status === 'available') {
    void updaterStore.startDownload()
    return
  }
  if (updaterStore.status === 'ready') {
    Modal.confirm({
      title: `重启并安装新版本 v${updaterStore.version}？`,
      content: '应用将退出并启动安装程序，完成后可重新打开 GuEarth。',
      okText: '重启安装',
      cancelText: '稍后',
      onOk: () => updaterStore.installNow()
    })
  }
}

function handleToggleLab(): void {
  if (nightBasemapActive.value) {
    message.info('夜光模式下地理实验室不可用，切换回其他底图后恢复')
    return
  }
  isLabOpen.value = !isLabOpen.value
}

function handleOpenScenes(): void {
  aiStore.setPanelOpen(false)
  store.setLayerPanelOpen(false)
  void scenesStore.hydrate()
  isScenesPanelOpen.value = !isScenesPanelOpen.value
}

async function handleSaveScene(name: string, narration: string): Promise<void> {
  try {
    const scene = scenePlayer.captureScene(name, narration)
    await scenesStore.addScene(scene)
  } catch (error) {
    message.warning(error instanceof Error ? error.message : '地球尚未就绪，暂时无法保存场景')
  }
}

function handlePreviewScene(id: string): void {
  const scene = scenesStore.scenes.find((item) => item.id === id)
  if (scene) void scenePlayer.previewScene(scene)
}

async function handleUpdateScene(id: string, changes: SceneEditPayload): Promise<void> {
  await scenesStore.updateScene(id, { name: changes.name, narration: changes.narration, dwellMs: Math.round(changes.dwellSeconds * 1000) })
}

function handleMoveScene(id: string, offset: -1 | 1): void {
  void scenesStore.moveScene(id, offset)
}

function handlePlayScenes(mode: 'manual' | 'auto'): void {
  if (!scenesStore.scenes.length) return
  drawingStore.setActiveTool(null)
  drawingStore.setSelectedShapeId(null)
  isScenesPanelOpen.value = false
  void scenePlayer.play({ scenes: scenesStore.scenes, mode, title: '教学演示' })
}

function handleTool(tool: DrawTool): void {
  const next = activeTool.value === tool ? null : tool
  drawingStore.setSelectedShapeId(null)
  drawingStore.setActiveTool(next)
}

function handleOpenAnnotations(): void {
  isAnnotationPanelOpen.value = true
}

function handleClearShapes(): void {
  Modal.confirm({ title: '清除全部标注？', okText: '清除', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => drawingStore.clearAll() })
}

function handleFlyShape(id: string): void {
  const shape = shapes.value.find((item) => item.id === id)
  if (shape) flyToShape(shape)
}

function updateSelectedShape(changes: Partial<Pick<DrawnShape, 'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'>>): void {
  if (selectedShape.value) drawingStore.updateShape(selectedShape.value.id, changes)
}

function deleteSelectedShape(): void {
  if (!selectedShape.value) return
  drawingStore.removeShape(selectedShape.value.id)
}
</script>

<template>
  <a-config-provider :locale="zhCN">
    <div class="app">
      <div ref="globeContainer" class="globe" :class="{ drawing: activeTool }"></div>
      <InlineTextEditor
        :viewer="viewer"
        :shape="selectedShape?.kind === 'text' ? selectedShape : null"
        @update="(annotation) => updateSelectedShape({ annotation })"
      />
      <div v-if="showGlobeLoading" class="globe-loading">
        <a-spin :spinning="!globeLoadTimedOut && !globeError" size="small" />
        <span class="globe-loading-text">{{ globeLoadingText }}</span>
        <span v-if="globeLoadStage" class="globe-loading-stage">{{ globeLoadStage }}</span>
        <span v-if="globeLoadingRetryable" class="globe-loading-stage">影像源持续无法加载时，可在「设置 → 地图」将高德镜像瓦片源切换为「开启」</span>
        <a-button v-if="globeLoadingRetryable" type="text" size="small" @click="handleRetry"><ReloadOutlined />重试</a-button>
      </div>
      <FailureBanner />
      <CrashDialog />
      <WindParticles v-if="thematicOverlays['wind-particles']" :viewer="viewer" />
      <FrontalCyclone v-if="thematicOverlays['frontal-cyclone']" :viewer="viewer" />
      <TyphoonOverlay v-if="thematicOverlays['typhoon']" :viewer="viewer" />
      <WalkerCirculationOverlay v-if="thematicOverlays['enso']" :viewer="viewer" :phase="climateStore.ensoPhase" />
      <HuLineOverlay v-if="thematicOverlays['hu-line']" :viewer="viewer" />
      <template v-if="!scenesStore.isPresenting">
      <GlobeToolbar
        :active-tool="activeTool"
        :shape-count="shapes.length"
        :level-view-active="levelViewActive"
        :level-view-visible="levelSwitcherVisible"
        :lab-active="labActive"
        :night-basemap-active="nightBasemapActive"
        :update-status="updaterStore.status"
        :update-version="updaterStore.version"
        :update-percent="updaterStore.percent"
        @open-layers="handleOpenLayers"
        @open-annotations="handleOpenAnnotations"
        @open-assistant="handleOpenAssistant"
        @open-scenes="handleOpenScenes"
        @home="handleHome"
        @tool="handleTool"
        @clear-shapes="handleClearShapes"
        @toggle-level-view="handleLevelViewToggle"
        @toggle-lab="handleToggleLab"
        @update-click="handleUpdateClick"
        @open-settings="handleOpenSettings"
      />
      <DrawingEditToolbar
        v-if="selectedShape && !activeTool"
        :shape="selectedShape"
        :fonts="systemFonts"
        @change="updateSelectedShape"
        @remove="deleteSelectedShape"
      />
      <TeachingLab :open="isLabOpen" @close="isLabOpen = false" />
      <PlaceSearchBox @select="flyToPlace" />
      <MonthTimeline :viewer="viewer" />
      <SolarTimePanel :viewer="viewer" />
      <SolarPathPanel v-if="solarStore.motionPanel === 'solar-path'" @close="solarStore.setMotionPanel(null)" />
      <ObliquityPanel v-if="solarStore.motionPanel === 'obliquity'" @close="solarStore.setMotionPanel(null)" />
      <RotationSpeedPanel v-if="solarStore.motionPanel === 'rotation-speed'" @close="solarStore.setMotionPanel(null)" />
      <ThermalCirculationPanel v-if="atmosphereStore.panel === 'circulation'" @close="atmosphereStore.setPanel(null)" />
      <AtmosphereHeatingPanel v-if="atmosphereStore.panel === 'heating'" @close="atmosphereStore.setPanel(null)" />
      <AtmosphereLayersPanel v-if="atmosphereStore.panel === 'layers'" @close="atmosphereStore.setPanel(null)" />
      <EnsoPanel v-if="thematicOverlays['enso']" @close="climateStore.setOverlay('enso', false)" />
      <WaterCyclePanel v-if="hydrologyStore.panel === 'water-cycle'" :viewer="viewer" @close="hydrologyStore.setPanel(null)" />
      <OceanPropertyPanel v-if="hydrologyStore.panel === 'ocean-property'" @close="hydrologyStore.setPanel(null)" />
      <TideWavePanel v-if="hydrologyStore.panel === 'tide'" @close="hydrologyStore.setPanel(null)" />
      <WaterBodyPanel v-if="hydrologyStore.panel === 'water-bodies'" @close="hydrologyStore.setPanel(null)" />
      <FoldFaultPanel v-if="landformStore.panel === 'fold-fault'" :viewer="viewer" @close="landformStore.setPanel(null)" />
      <RiverLandformPanel v-if="landformStore.panel === 'river'" :viewer="viewer" @close="landformStore.setPanel(null)" />
      <LandformGuidePanel v-if="landformStore.panel === 'landform-guide'" :viewer="viewer" @close="landformStore.setPanel(null)" />
      <ExogenicPanel v-if="landformStore.panel === 'exogenic'" :viewer="viewer" @close="landformStore.setPanel(null)" />
      <EarthLayersPanel v-if="landformStore.panel === 'earth-layers'" @close="landformStore.setPanel(null)" />
      <PopulationPanel v-if="populationStore.panel === 'population'" @close="populationStore.setPanel(null)" />
      <CitiesPanel v-if="populationStore.panel === 'cities'" @close="populationStore.setPanel(null)" />
      <TransportPanel v-if="transportStore.panel === 'transport'" :viewer="viewer" @close="transportStore.setPanel(null)" />
      <EnvironmentPanel v-if="environmentStore.panel === 'environment'" :viewer="viewer" @close="environmentStore.setPanel(null)" />
      <LocationDecisionPanel v-if="decisionStore.panel === 'location'" :viewer="viewer" @close="decisionStore.setPanel(null)" />
      <TimezonePanel v-if="timezoneComparison" :comparison="timezoneComparison" @clear="closeTimezoneCompare" />
      <ThematicLegend />
      <ThematicInfoCard />
      <div v-if="drawHint" class="draw-hint">{{ drawHint }}</div>
      <CameraStatus :camera="camera" />
      <EoqAssistant />
      <SettingsModal @restart-guide="handleRestartGuide" />
      <FirstUseGuide ref="firstUseGuide" :ready="isGlobeReady" @step-change="handleSetupGuideStepChange" />
      <UpdateDialog />
      <AnnotationPanel
        :open="isAnnotationPanelOpen"
        :shapes="shapes"
        :entries="entries"
        :selected-shape-id="selectedShapeId"
        :save-error="saveError"
        @close="isAnnotationPanelOpen = false"
        @edit="drawingStore.setSelectedShapeId"
        @fly="handleFlyShape"
        @remove="drawingStore.removeShape"
      />
      <LayerPanel
        :open="isLayerPanelOpen"
        :layers="layers"
        :selected-layer-id="selectedLayerId"
        :error="globeError"
        :terrain-error="terrainError"
        :terrain-provider-id="terrainProviderId"
        :active-terrain-id="activeTerrainId"
        :terrain-exaggeration="terrainExaggeration"
        :terrain-lighting="terrainLighting"
        @close="handleClosePanel"
        @select="handleSelectLayer"
        @opacity="handleOpacityChange"
        @retry="handleRetry"
        @terrain="handleTerrainChange"
        @terrain-exaggeration="handleTerrainExaggeration"
        @terrain-lighting="handleTerrainLighting"
      />
      </template>
      <SceneBookmarksPanel
        :open="isScenesPanelOpen"
        :scenes="scenesStore.scenes"
        :save-error="scenesStore.saveError"
        @close="isScenesPanelOpen = false"
        @save="handleSaveScene"
        @preview="handlePreviewScene"
        @update="handleUpdateScene"
        @remove="scenesStore.removeScene"
        @move="handleMoveScene"
        @play="handlePlayScenes"
      />
      <ScenePlayerOverlay :player="scenePlayer.playerState" @next="scenePlayer.next()" @stop="scenePlayer.stop()" />
      <a-modal
        v-model:open="recordingDirectoryDialogOpen"
        title="选择视频保存文件夹"
        ok-text="选择文件夹"
        cancel-text="取消录制"
        :mask-closable="false"
        :confirm-loading="recordingDirectoryDialogBusy"
        @ok="chooseRecordingDirectory"
        @cancel="cancelRecordingDirectory"
      >
        <a-alert
          v-if="recordingDirectoryDialogError"
          type="error"
          show-icon
          :message="recordingDirectoryDialogError"
          class="recording-directory-error"
        />
        <p class="recording-directory-copy">首次录制需要一个可写的文件夹来保存视频文件。点击“选择文件夹”后，在系统窗口中选取目标位置。</p>
      </a-modal>
    </div>
  </a-config-provider>
</template>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.globe {
  width: 100%;
  height: 100%;
}

.globe.drawing :deep(canvas) {
  cursor: crosshair;
}

.globe-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1003;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  transform: translate(-50%, -50%);
}

.globe-loading-text {
  color: rgba(0, 0, 0, 0.65);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
}

.globe-loading-stage {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.draw-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.72);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 20px;
  pointer-events: none;
  z-index: 11;
}

.recording-directory-copy {
  margin: 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: 14px;
  line-height: 22px;
}

.recording-directory-error {
  margin-bottom: 16px;
}

</style>
