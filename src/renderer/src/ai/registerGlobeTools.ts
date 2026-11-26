import * as Cesium from 'cesium'
import { useAiStore } from '@renderer/stores/ai'
import { useAtmosphereStore } from '@renderer/stores/atmosphere'
import { thematicLayerCatalog, useClimateStore } from '@renderer/stores/climate'
import { useDecisionStore } from '@renderer/stores/decision'
import { useDrawingStore } from '@renderer/stores/drawing'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useFlightStopsStore } from '@renderer/stores/flightStops'
import { basemapCategories, providerCatalog, terrainCatalog, useGlobeStore } from '@renderer/stores/globe'
import { useHydrologyStore } from '@renderer/stores/hydrology'
import { useLandformStore } from '@renderer/stores/landform'
import { usePopulationStore } from '@renderer/stores/population'
import { useScenesStore } from '@renderer/stores/scenes'
import { useSolarStore } from '@renderer/stores/solar'
import { useTransportStore } from '@renderer/stores/transport'
import { useZonationStore } from '@renderer/stores/zonation'
import { collectStrings, parsePositions, registerAnnotationTools } from '@renderer/ai/annotationTools'
import { registerPopulationTools } from '@renderer/ai/populationTools'
import type { RecordingStep } from '@renderer/composables/useScenePlayer'
import { flyTransect } from '@renderer/composables/useTransectFlight'
import { hidesThematicLayers, visibleThematicLayers } from '@renderer/lib/nightBasemap'
import { ensoPhaseOptions } from '@renderer/thematic/ensoPhases';
import type { EnsoPhase } from '@renderer/thematic/ensoPhases';
import { HSR_END_YEAR, HSR_START_YEAR } from '@renderer/thematic/hsrLines'
import { mountainById, zonationMountains } from '@renderer/thematic/mountainZonation'
import { findPeaksNear, nearestPeaks } from '@renderer/thematic/notablePeaks'
import { nearestBoundary, plateBoundaryKindName } from '@renderer/thematic/plateBoundaries'
import { SEA_LEVEL_SCENARIOS } from '@renderer/thematic/seaLevelRise'
import { datePartsOf, dayLength, declinationForDate, formatClock, isValidDate, noonAltitudeDeg, sunTimes } from '@renderer/thematic/solarMath'
import { functionalZoneCities, functionalZoneCityById } from '@renderer/thematic/urbanCities'
import { parseFlyToArgs } from '../../../common/flightStops'
import type { TeachingScene } from '../../../preload'

const MAX_RECORD_STEPS = 12

export interface GlobeToolsBridge {
  getViewer: () => Cesium.Viewer | undefined
  flyTo: (longitude: number, latitude: number, height: number) => Promise<number | undefined>
  switchBasemap: (id: string) => void
  setTerrain: (id: string) => void
  setTerrainExaggeration: (value: number) => void
  setTerrainLighting: (value: boolean) => void
  closeAllTeachingPanels: () => void
  captureScene: (name: string, narration: string) => Omit<TeachingScene, 'createdAt'>
  recordVideo: (title: string, steps: RecordingStep[]) => Promise<{ status: string; totalSteps: number; estimatedSeconds: number } | { error: string }>
  ensureRecordingDirectory: () => Promise<boolean>
}

const optionalFiniteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') {return undefined}
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseRecordingStep(raw: unknown, index: number): RecordingStep | { error: string } {
  if (typeof raw !== 'object' || raw === null) {return { error: `第 ${index + 1} 步格式无效` }}
  const record = raw as Record<string, unknown>
  const longitude = Number(record.longitude)
  const latitude = Number(record.latitude)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: `第 ${index + 1} 步缺少有效经纬度` }
  }
  const height = record.height === undefined ? 600_000 : Number(record.height)
  if (!Number.isFinite(height) || height <= 0 || height > 20_000_000) {return { error: `第 ${index + 1} 步视点高度无效` }}
  const clampedHeight = Math.min(12_000_000, Math.max(10_000, height))
  const heading = record.heading === undefined ? 0 : Number(record.heading)
  const pitch = record.pitch === undefined ? -90 : Number(record.pitch)
  if (!Number.isFinite(heading) || heading < -360 || heading > 360 || !Number.isFinite(pitch) || pitch < -90 || pitch > 90) {
    return { error: `第 ${index + 1} 步朝向参数无效` }
  }
  const climateStore = useClimateStore.getState()
  const store = useGlobeStore.getState()
  const transportStore = useTransportStore.getState()
  const requestedOverlays = collectStrings(record.overlays)
  const knownOverlays = thematicLayerCatalog.filter((layer) => requestedOverlays.includes(layer.id)).map((layer) => layer.id)
  const month = record.month === undefined ? climateStore.month : Number(record.month)
  if (!Number.isFinite(month) || month < 1 || month > 12) {return { error: `第 ${index + 1} 步 month 需为 1-12` }}
  let simTime: { date: string; hour: number } | null = null
  if (record.simTime !== null && record.simTime !== undefined) {
    if (typeof record.simTime !== 'object') {return { error: `第 ${index + 1} 步 simTime 格式无效` }}
    const time = record.simTime as Record<string, unknown>
    if (typeof time.date !== 'string' || !isValidDate(time.date)) {return { error: `第 ${index + 1} 步 simTime.date 需为合法 YYYY-MM-DD` }}
    const hour = time.hour === undefined ? 12 : Number(time.hour)
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) {return { error: `第 ${index + 1} 步 simTime.hour 需为 0-24` }}
    simTime = { date: time.date, hour }
  }
  const markers = Array.isArray(record.markers)
    ? record.markers.flatMap((item) => {
        if (typeof item !== 'object' || item === null) {return []}
        const entry = item as Record<string, unknown>
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 200) : ''
        const markerLon = Number(entry.longitude)
        const markerLat = Number(entry.latitude)
        if (!name || !Number.isFinite(markerLon) || markerLon < -180 || markerLon > 180 || !Number.isFinite(markerLat) || markerLat < -90 || markerLat > 90) {
          return []
        }
        return [{ name, longitude: markerLon, latitude: markerLat }]
      })
    : []
  const shapes = Array.isArray(record.shapes)
    ? record.shapes.flatMap((item) => {
        if (typeof item !== 'object' || item === null) {return []}
        const entry = item as Record<string, unknown>
        if (entry.kind !== 'polyline' && entry.kind !== 'polygon') {return []}
        const positions = parsePositions(entry.points, entry.kind === 'polygon' ? 3 : 2)
        if (!positions) {return []}
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 200) : ''
        const kind: 'polyline' | 'polygon' = entry.kind
        return [{ kind, name, positions }]
      })
    : []
  const dwellMs = record.dwellMs === undefined ? 6000 : Number(record.dwellMs)
  const flyDurationMs = record.flyMs === undefined ? 3500 : Number(record.flyMs)
  const ensoPhase = typeof record.ensoPhase === 'string' && ensoPhaseOptions.some((option) => option.value === record.ensoPhase)
    ? record.ensoPhase as EnsoPhase
    : climateStore.ensoPhase
  const requestedRise = Number(record.seaLevelRise)
  const seaLevelRise = (SEA_LEVEL_SCENARIOS as readonly number[]).includes(requestedRise) ? requestedRise : climateStore.seaLevelRise
  const requestedYear = optionalFiniteNumber(record.transportYear)
  const transportYear = requestedYear === undefined ? transportStore.year : Math.round(Math.min(HSR_END_YEAR, Math.max(HSR_START_YEAR, requestedYear)))
  return {
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 80) : `第 ${index + 1} 幕`,
    narration: typeof record.narration === 'string' ? record.narration.trim().slice(0, 500) : '',
    camera: { longitude, latitude, height: clampedHeight, heading, pitch },
    basemapId: store.selectedLayerId,
    styleId: store.providerStyles[store.selectedLayerId] ?? '',
    overlays: visibleThematicLayers(store.selectedLayerId, knownOverlays),
    month: Math.round(month),
    simTime,
    ensoPhase,
    seaLevelRise,
    transportYear,
    dwellMs: Math.min(60_000, Math.max(1000, dwellMs)),
    flyDurationMs: Math.min(15_000, Math.max(500, flyDurationMs)),
    markers,
    shapes
  }
}

const basemapChoices = basemapCategories
  .map((category) => providerCatalog.find((provider) => provider.id === category.providerIds[0]))
  .filter((provider): provider is (typeof providerCatalog)[number] => Boolean(provider))

const teachingPanelCatalog: { id: string; name: string; hint: string; open: () => void }[] = [
  { id: 'solar-path', name: '太阳视运动轨迹', hint: '展示某地当日太阳视运动路径与高度角变化', open: () => useSolarStore.getState().setMotionPanel('solar-path') },
  { id: 'obliquity', name: '黄赤交角可调探究', hint: '调节黄赤交角观察直射点回归运动与五带划分的变化', open: () => useSolarStore.getState().setMotionPanel('obliquity') },
  { id: 'rotation-speed', name: '自转速度与周期', hint: '演示自转线速度随纬度的变化与恒星日、太阳日的差异', open: () => useSolarStore.getState().setMotionPanel('rotation-speed') },
  { id: 'circulation', name: '热力环流', hint: '播放海陆风、山谷风、城市热岛环流的动画', open: () => useAtmosphereStore.getState().setPanel('circulation') },
  { id: 'heating', name: '大气受热过程', hint: '演示大气削弱作用与温室保温效应（可切换昼夜与云量状态）', open: () => useAtmosphereStore.getState().setPanel('heating') },
  { id: 'layers', name: '大气垂直分层', hint: '展示气温随高度的垂直分布与各分层特征', open: () => useAtmosphereStore.getState().setPanel('layers') },
  { id: 'water-cycle', name: '水循环', hint: '播放海陆间水循环各环节的动画并联动地球视角', open: () => useHydrologyStore.getState().setPanel('water-cycle') },
  { id: 'ocean-property', name: '海水温度与盐度', hint: '展示海水温度、盐度随纬度和深度的分布', open: () => useHydrologyStore.getState().setPanel('ocean-property') },
  { id: 'tide', name: '潮汐与波浪', hint: '演示潮汐周期、大潮小潮与潮差', open: () => useHydrologyStore.getState().setPanel('tide') },
  { id: 'water-bodies', name: '陆地水体与河流补给', hint: '演示河流补给类型与径流变化过程', open: () => useHydrologyStore.getState().setPanel('water-bodies') },
  { id: 'fold-fault', name: '褶皱与断层', hint: '展示褶皱与断层岩层剖面，可实地飞往典型地点', open: () => useLandformStore.getState().setPanel('fold-fault') },
  { id: 'river', name: '河流地貌发育', hint: '讲解河流上中下游地貌并查看实测高程剖面', open: () => useLandformStore.getState().setPanel('river') },
  { id: 'landform-guide', name: '典型地貌识别', hint: '按喀斯特、雅丹、冰川、海岸、黄土等类型实地飞行导览', open: () => useLandformStore.getState().setPanel('landform-guide') },
  { id: 'exogenic', name: '外力作用过程', hint: '演示风化、侵蚀、搬运、堆积的外力作用链条', open: () => useLandformStore.getState().setPanel('exogenic') },
  { id: 'earth-layers', name: '地球的圈层结构', hint: '展示地球内部圈层划分剖面', open: () => useLandformStore.getState().setPanel('earth-layers') },
  { id: 'zonation', name: '山地垂直带谱剖面', hint: '选择典型山脉查看南/北坡垂直带谱与雪线，沿剖面采样真实地形并可引导飞行', open: () => useZonationStore.getState().setPanel('zonation-profile') },
  { id: 'population', name: '人口数据面板', hint: '展示人口金字塔、城镇化曲线与胡焕庸线对比', open: () => usePopulationStore.getState().setPanel('population') },
  { id: 'cities', name: '城镇与中心地验证', hint: '展示城市等级体系，并可用 POI 统计对比验证中心地理论（需配置高德密钥）', open: () => usePopulationStore.getState().setPanel('cities') },
  { id: 'transport', name: '交通运输布局', hint: '播放 2008 年以来高铁网络生长动画，结合营业里程曲线与实地察看讲解', open: () => useTransportStore.getState().setPanel('transport') },
  { id: 'environment', name: '海平面上升淹没模拟', hint: '选择上升情景，观察沿海低地淹没范围并查看面积估算（需真实地形源）', open: () => useEnvironmentStore.getState().setPanel('environment') },
  { id: 'decision', name: '区位决策沙盘', hint: '在真实情境中勾选区位因素，请 AI 按高考答题结构点评你的取舍', open: () => useDecisionStore.getState().setPanel('location') },
  {
    id: 'timezone-compare',
    name: '地方时对比',
    hint: '已进入地方时点选模式，请提示用户在地球上依次单击两个地点，出现「地方时对比」面板后即可讲解两地时差；按 Esc 退出点选模式',
    open: () => useDrawingStore.getState().setActiveTool('timezone')
  }
]

export function registerGlobeTools(bridge: GlobeToolsBridge): void {
  const aiStore = useAiStore.getState()

  registerPopulationTools()
  registerAnnotationTools()

  aiStore.registerTool({
    label: '视角飞行',
    definition: {
      name: 'fly_to',
      description: '将地球视角飞往指定 WGS-84 经纬度，或通过 locations 一次创建多个待查看地点。展示多个地点时，请优先传入 locations 数组（默认视角停留在第 1 个地点，用户可通过底部切换器自行查看其余地点）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '可选，地点名称，用于底部切换器显示' },
          longitude: { type: 'number', description: '单个地点的经度（WGS-84，-180 到 180）' },
          latitude: { type: 'number', description: '单个地点的纬度（WGS-84，-90 到 90）' },
          height: { type: 'number', description: '视点高度（米），省略时为 60000' },
          note: { type: 'string', description: '可选，简短地貌或地理特征说明' },
          locations: {
            type: 'array',
            description: '一次创建多个待查看地点（2-12 个）。系统只飞往第 1 个地点并停留在 1/N，其余加入底部切换器。',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '地点名称' },
                longitude: { type: 'number', description: '经度（WGS-84，-180 到 180）' },
                latitude: { type: 'number', description: '纬度（WGS-84，-90 到 90）' },
                height: { type: 'number', description: '视点高度（米），省略时为 60000' },
                note: { type: 'string', description: '可选，简短地理特征说明' }
              },
              required: ['name', 'longitude', 'latitude']
            }
          }
        }
      }
    },
    execute: async (args) => {
      const flightStopsStore = useFlightStopsStore.getState()
      const turnToken = typeof args.__turnToken === 'string' ? args.__turnToken : ''
      const flightMode = args.__flightMode === 'queue' ? 'queue' : 'initial'
      const parsed = parseFlyToArgs(args, flightMode === 'queue' ? flightStopsStore.total : 0)
      if (parsed.error || parsed.stops.length === 0) {return { error: parsed.error ?? '坐标无效，需要 WGS-84 经纬度' }}
      if (flightMode === 'queue') {
        const { added, total } = flightStopsStore.appendTurnStops(turnToken, parsed.stops)
        if (added.length === 0) {return { error: `「${parsed.stops[0].name}」未加入待查看列表：列表已满或地点重复（共 ${total} 个）` }}
        const current = useFlightStopsStore.getState().currentStop
        const addedName = added[0].name
        return {
          status: 'queued',
          addedName,
          activeIndex: useFlightStopsStore.getState().activeIndex + 1,
          total,
          current: current ? { ...current } : null,
          message: `已将「${addedName}」加入待查看地点列表（共 ${total} 个），当前视角保持在第 1 个地点「${current?.name ?? ''}」，除非用户明确要求否则不要切换`
        }
      }
      const first = flightStopsStore.beginTurnStops(turnToken, parsed.stops)
      if (!first) {return { error: '没有有效飞行地点' }}
      const actualHeight = await bridge.flyTo(first.longitude, first.latitude, first.height)
      if (actualHeight === undefined) {
        useFlightStopsStore.getState().clear()
        return { error: '飞行已取消' }
      }
      const latestStops = useFlightStopsStore.getState()
      if (latestStops.total > 1) {
        return {
          status: 'ok',
          activeIndex: 1,
          total: latestStops.total,
          current: { ...first, height: actualHeight },
          stops: latestStops.stops.map((stop, index) => ({
            index: index + 1,
            name: stop.name,
            longitude: stop.longitude,
            latitude: stop.latitude,
            height: stop.height
          })),
          message: `已创建 ${latestStops.total} 个飞行地点，当前视角停留在第 1 个地点「${first.name}」；底部已显示切换器，除非用户在聊天中明确要求否则不要切换地点`
        }
      }
      return {
        status: 'ok',
        message: `视角已飞往 ${typeof args.name === 'string' && args.name.trim() ? `「${args.name.trim()}」` : `${first.longitude.toFixed(4)}, ${first.latitude.toFixed(4)}`}`,
        longitude: first.longitude,
        latitude: first.latitude,
        height: actualHeight
      }
    }
  })

  aiStore.registerTool({
    label: '切换飞行地点',
    definition: {
      name: 'switch_flight_stop',
      description: '切换到当前已创建的飞行地点列表中的其他地点。仅当用户在最新聊天消息中明确要求切换（如“下一个”“上一个”“第3个”“飞到某地”）时才可调用；禁止在创建地点后主动调用。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['next', 'prev', 'goto'],
            description: '切换方式：next（下一个）、prev（上一个）、goto（跳转到指定序号或名称）'
          },
          index: { type: 'number', description: '目标地点序号（从 1 开始，action 为 goto 时可用）' },
          name: { type: 'string', description: '目标地点名称（action 为 goto 时可用）' }
        }
      }
    },
    execute: async (args) => {
      const outcome = await useFlightStopsStore.getState().switchByRequest(
        { action: args.action, index: args.index, name: args.name },
        bridge.flyTo
      )
      if (outcome.error || !outcome.stop || outcome.index === undefined) {
        return { error: outcome.error ?? '切换飞行地点失败' }
      }
      return {
        status: 'ok',
        activeIndex: outcome.index + 1,
        total: outcome.total,
        current: { ...outcome.stop, height: outcome.actualHeight ?? outcome.stop.height },
        message: `已切换到 ${outcome.index + 1}/${outcome.total}「${outcome.stop.name}」`
      }
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
      const current = bridge.getViewer()
      if (!current || current.isDestroyed()) {return { error: '地球尚未就绪' }}
      const longitude = Number(args.longitude)
      const latitude = Number(args.latitude)
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return { error: '坐标无效' }
      }
      const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude)
      try {
        const [sampled] = await Cesium.sampleTerrainMostDetailed(current.terrainProvider, [cartographic.clone()])
        if (sampled && Number.isFinite(sampled.height)) {return { height: Math.round(sampled.height * 100) / 100, unit: '米（WGS-84 椭球高）', longitude, latitude }}
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
    label: '名山高峰查找',
    definition: {
      name: 'find_peaks',
      description: '在指定经纬度附近查找内置名山高峰名录（含海拔、方位与距离），用于回答“这附近有什么山”“最高的山峰是哪座”等问题。结果按海拔从高到低排序，可用 fly_to 的 locations 批量创建待查看地点并停留在第 1 座讲解。',
      parameters: {
        type: 'object',
        properties: {
          longitude: { type: 'number', description: '查询中心经度（WGS-84）。省略时使用当前视角中心' },
          latitude: { type: 'number', description: '查询中心纬度（WGS-84）。省略时使用当前视角中心' },
          radiusKm: { type: 'number', description: '查询半径（千米，10-3000）。省略时为 300 千米' }
        }
      }
    },
    execute: async (args) => {
      const camera = useGlobeStore.getState().camera
      let longitude = Number(args.longitude)
      let latitude = Number(args.latitude)
      if (args.longitude === undefined || args.latitude === undefined) {
        longitude = camera.longitude
        latitude = camera.latitude
      }
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return { error: '坐标无效，需要 WGS-84 经纬度' }
      }
      const radiusKm = args.radiusKm === undefined ? 300 : Number(args.radiusKm)
      if (!Number.isFinite(radiusKm) || radiusKm < 10 || radiusKm > 3000) {return { error: 'radiusKm 需为 10-3000 的千米数' }}
      const found = findPeaksNear(longitude, latitude, radiusKm)
      if (found.length === 0) {
        const nearest = nearestPeaks(longitude, latitude, 3)
        return {
          status: 'none',
          center: { longitude: Math.round(longitude * 10_000) / 10_000, latitude: Math.round(latitude * 10_000) / 10_000 },
          radiusKm,
          nearest,
          message: '查询范围内没有收录的名山高峰，nearest 为全球范围内距该点最近的三座；名录仅收录教材常用名山，不代表当地没有其他山峰'
        }
      }
      return {
        status: 'ok',
        center: { longitude: Math.round(longitude * 10_000) / 10_000, latitude: Math.round(latitude * 10_000) / 10_000 },
        radiusKm,
        peaks: found.slice(0, 8),
        totalMatches: found.length,
        message: `附近共收录 ${found.length} 座名山高峰，已按海拔从高到低列出前 ${Math.min(8, found.length)} 座；需要展示多个山峰时用 fly_to 的 locations 一次创建地点列表（视角停留在第 1 座），讲解山地垂直带谱时可配合 open_panel 打开 zonation 面板`
      }
    }
  })

  aiStore.registerTool({
    label: '剖面引导飞行',
    definition: {
      name: 'fly_transect',
      description: '引导视角沿剖面线依次飞行观察地形起伏：可使用内置山脉的预设剖面（珠穆朗玛峰、天山博格达峰、乞力马扎罗山、阿尔卑斯勃朗峰、长白山），也可传入自定义途经点。飞行前自动预载沿线影像，飞行高度随地形平滑调整并自动避开地形，结束后蓝色剖面线自动清理。适合讲解山地垂直地域分异、地势起伏与剖面判读。',
      parameters: {
        type: 'object',
        properties: {
          mountainId: {
            type: 'string',
            enum: zonationMountains.map((mountain) => mountain.id),
            description: `内置剖面：${  zonationMountains.map((mountain) => `${mountain.id}（${mountain.name}）`).join('、')}`
          },
          waypoints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                longitude: { type: 'number', description: '途经点经度（WGS-84）' },
                latitude: { type: 'number', description: '途经点纬度（WGS-84）' }
              },
              required: ['longitude', 'latitude']
            },
            description: '自定义剖面途经点（2-6 个），与 mountainId 二选一，同时提供时优先使用 mountainId'
          },
          altitudeM: { type: 'number', description: '期望飞行高度（米），实际高度不会低于地形安全高度' }
        }
      }
    },
    execute: async (args) => {
      const current = bridge.getViewer()
      if (!current || current.isDestroyed()) {return { error: '地球尚未就绪' }}
      let waypoints: [number, number][]
      let expectedMaxGroundM: number | undefined
      if (typeof args.mountainId === 'string') {
        const mountain = mountainById(args.mountainId)
        if (!mountain) {return { error: `未知山脉 ${String(args.mountainId)}，可用剖面：${zonationMountains.map((item) => `${item.id}（${item.name}）`).join('、')}` }}
        waypoints = mountain.transect
        expectedMaxGroundM = mountain.summitM
      } else if (Array.isArray(args.waypoints)) {
        waypoints = args.waypoints.map((point) => [Number(point?.longitude), Number(point?.latitude)])
      } else {
        return { error: '请提供 mountainId（内置山脉剖面）或 waypoints（2-6 个途经点）' }
      }
      const result = await flyTransect(current, waypoints, args.altitudeM === undefined ? { expectedMaxGroundM } : { altitudeM: Number(args.altitudeM), expectedMaxGroundM })
      if ('error' in result) {return result}
      const samplingNote = result.maxGroundM === undefined
        ? ''
        : `沿线采样最高地表 ${result.maxGroundM} 米${result.degraded ? '（地形数据不完整，已启用安全盲飞高度）' : ''}`
      if (result.status === 'interrupted') {
        const reason = result.reason === 'exaggeration-changed'
          ? '飞行中垂直夸张被调整，高度计划已失效，飞行自动中断'
          : result.reason === 'superseded'
            ? '本次飞行被新一次飞行取代'
            : '飞行被手动停止'
        return { status: 'interrupted', completedLegs: result.completedLegs, totalKm: result.totalKm, reason: result.reason, message: `剖面飞行中断：${reason}。${samplingNote}。剖面线已清理，调整好垂直夸张后可重新调用 fly_transect` }
      }
      return {
        status: 'ok',
        totalKm: result.totalKm,
        flightAltitudeM: result.flightAltitudeM,
        message: `剖面飞行完成，全程约 ${result.totalKm} 千米，最高飞行高度约 ${result.flightAltitudeM} 米（${samplingNote}；高度随地形平滑调整并按垂直夸张校正，已预载沿线卫星影像）；剖面线已自动清理，可用 open_panel 打开 zonation 面板对照垂直带谱讲解`
      }
    }
  })

  aiStore.registerTool({
    label: '获取当前视角',
    definition: {
      name: 'get_camera',
      description: '获取当前地球视角：中心点经纬度、视点高度、朝向与俯仰角。用于回答“我现在看到的是哪里”。',
      parameters: { type: 'object', properties: {} }
    },
    execute: async () => {
      const camera = useGlobeStore.getState().camera
      return {
        longitude: Math.round(camera.longitude * 10_000) / 10_000,
        latitude: Math.round(camera.latitude * 10_000) / 10_000,
        height: Math.round(camera.height),
        heading: Math.round(camera.heading * 10) / 10,
        pitch: Math.round(camera.pitch * 10) / 10
      }
    }
  })

  aiStore.registerTool({
    label: '视角截图',
    definition: {
      name: 'capture_view',
      description: '截取当前地球视角的纯地图画面（不含任何界面控件）作为图片，并返回观察上下文：中心经纬度、视点高度、朝向、俯仰角与可见地理范围。用于回答“看看这里”“这是不是某种地貌”“我现在看到的是什么”等基于当前画面的问题。',
      parameters: { type: 'object', properties: {} }
    },
    execute: async () => {
      const current = bridge.getViewer()
      if (!current || current.isDestroyed()) {return { error: '地球尚未就绪' }}
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
              west: Math.round(Cesium.Math.toDegrees(Math.min(...picked.map((item) => item.longitude))) * 10_000) / 10_000,
              south: Math.round(Cesium.Math.toDegrees(Math.min(...picked.map((item) => item.latitude))) * 10_000) / 10_000,
              east: Math.round(Cesium.Math.toDegrees(Math.max(...picked.map((item) => item.longitude))) * 10_000) / 10_000,
              north: Math.round(Cesium.Math.toDegrees(Math.max(...picked.map((item) => item.latitude))) * 10_000) / 10_000
            }
          : undefined
        return {
          camera: {
            longitude: Math.round(Cesium.Math.toDegrees(cartographic.longitude) * 10_000) / 10_000,
            latitude: Math.round(Cesium.Math.toDegrees(cartographic.latitude) * 10_000) / 10_000,
            height: Math.round(cartographic.height),
            heading: Math.round(headingDegrees < 0 ? headingDegrees + 360 : headingDegrees),
            pitch: Math.round(Cesium.Math.toDegrees(current.camera.pitch) * 10) / 10
          },
          extent
        }
      }
      if (!useAiStore.getState().activeModelVisionEnabled()) {
        return {
          status: 'vision_disabled',
          ...viewContext(),
          guidance: '当前模型未开启「视觉」能力，不会接收截图图片，本次已改为返回当前视角的文字信息（camera 与 extent）。请依据这些文本信息尽量回答；同时提醒用户：若该模型实际支持图像输入，可在「AI 设置」的模型列表中开启「视觉」开关后重试。'
        }
      }
      const loadStart = Date.now()
      while (!current.scene.globe.tilesLoaded && Date.now() - loadStart < 3000) {
        await new Promise((resolve) => { setTimeout(resolve, 100) })
      }
      const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height))
      const offscreen = document.createElement('canvas')
      offscreen.width = Math.max(1, Math.round(canvas.width * scale))
      offscreen.height = Math.max(1, Math.round(canvas.height * scale))
      const context = offscreen.getContext('2d')
      if (!context) {return { error: '截图失败' }}
      context.drawImage(canvas, 0, 0, offscreen.width, offscreen.height)
      const image = offscreen.toDataURL('image/jpeg', 0.85)
      if (!image.startsWith('data:image/')) {return { error: '截图失败' }}
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
      const solarStore = useSolarStore.getState()
      if (args.date !== undefined) {
        if (!isValidDate(args.date)) {return { error: 'date 需为合法的 YYYY-MM-DD 日期' }}
        solarStore.setDate(args.date)
      }
      if (args.hour !== undefined) {
        const hour = Number(args.hour)
        if (!Number.isFinite(hour) || hour < 0 || hour >= 24) {return { error: 'hour 需为 0-24 的小时数' }}
        solarStore.setHour(hour)
      }
      if (typeof args.play === 'boolean') {
        useSolarStore.setState({
          isPlaying: args.play,
          isAnnualPlaying: args.play ? false : useSolarStore.getState().isAnnualPlaying
        })
      }
      solarStore.setActive(true)
      const nextSolar = useSolarStore.getState()
      return {
        status: 'ok',
        date: nextSolar.date,
        hourBeijing: nextSolar.hour,
        utc: new Date(nextSolar.utcMs).toISOString(),
        playing: nextSolar.isPlaying,
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
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {return { error: '纬度无效，需 -90 到 90' }}
      let dateStr = useSolarStore.getState().date
      if (args.date !== undefined) {
        if (!isValidDate(args.date)) {return { error: 'date 需为合法的 YYYY-MM-DD 日期' }}
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
        sunriseLocalSolarTime: times.sunrise === undefined ? undefined : formatClock(times.sunrise),
        sunsetLocalSolarTime: times.sunset === undefined ? undefined : formatClock(times.sunset),
        note: '日出日落为地方时（平太阳时近似）'
      }
    }
  })

  aiStore.registerTool({
    label: '专题图层开关',
    definition: {
      name: 'set_layer',
      description: '开关教学专题图层并可选设置月份（1-12）或功能分区城市（仅 functional-zones），用于讲解气压带与风带、气候类型、锋面气旋、洋流、城市功能分区等。气压带风带图层会随月份在1月与7月位置间移动，适合对比讲解。',
      parameters: {
        type: 'object',
        properties: {
          layerId: {
            type: 'string',
            enum: thematicLayerCatalog.map((layer) => layer.id),
            description: '图层 id：pressure-belts 气压带与风带、koppen-zones 世界气候类型、frontal-cyclone 锋面气旋、ocean-currents 世界洋流、climate-zones 中国气候区、coriolis-demo 地转偏向力等'
          },
          enabled: { type: 'boolean', description: 'true 开启图层，false 关闭图层' },
          month: { type: 'number', description: '1-12 的月份整数，设置专题时间轴（如 1 月与 7 月对比气压带位置）' },
          city: {
            type: 'string',
            enum: functionalZoneCities.map((city) => city.id),
            description: `仅 functional-zones 城市功能分区图层使用：切换展示的城市（${  functionalZoneCities.map((city) => `${city.id}（${city.name}）`).join('、')  }），默认武汉`
          }
        },
        required: ['layerId', 'enabled']
      }
    },
    execute: async (args) => {
      const layer = thematicLayerCatalog.find((item) => item.id === args.layerId)
      if (!layer) {return { error: `未知图层 ${String(args.layerId)}，可用图层：${thematicLayerCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }}
      if (typeof args.enabled !== 'boolean') {return { error: 'enabled 需为布尔值' }}
      const nightActive = hidesThematicLayers(useGlobeStore.getState().selectedLayerId)
      if (args.enabled && nightActive) {return { error: '夜光底图下教学图层已隐藏，请先用 set_basemap 切换回其他底图再开启图层' }}
      const climateStore = useClimateStore.getState()
      let cityName: string | undefined
      if (args.city !== undefined) {
        if (layer.id !== 'functional-zones') {return { error: 'city 参数仅用于 functional-zones 城市功能分区图层' }}
        const city = functionalZoneCityById(String(args.city))
        if (!city) {return { error: `未知城市 ${String(args.city)}，可用城市：${functionalZoneCities.map((item) => `${item.id}（${item.name}）`).join('、')}` }}
        climateStore.setFunctionalZoneCity(city.id)
        cityName = city.name
      }
      climateStore.setOverlay(layer.id, args.enabled)
      if (args.month !== undefined) {
        const month = Number(args.month)
        if (!Number.isFinite(month) || month < 1 || month > 12) {return { error: 'month 需为 1-12 的月份' }}
        climateStore.setMonth(month)
        useClimateStore.setState({ isPlaying: false })
      }
      const nextMonth = useClimateStore.getState().month
      return {
        status: 'ok',
        layerId: layer.id,
        name: layer.name,
        enabled: args.enabled,
        month: nextMonth,
        city: cityName,
        message: args.enabled
          ? `已开启「${layer.name}」图层${cityName ? `，展示城市：${cityName}` : ''}${args.month === undefined ? '' : `并设置月份为 ${nextMonth} 月`}；可在地球上点击图层要素查看成因`
          : `已关闭「${layer.name}」图层`
      }
    }
  })

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
            description: `面板 id：${  teachingPanelCatalog.map((panel) => `${panel.id}（${panel.name}）`).join('、')}`
          },
          close: { type: 'boolean', description: 'true 时关闭全部教学面板并退出地方时点选模式，忽略 panelId' }
        }
      }
    },
    execute: async (args) => {
      if (args.close === true) {
        bridge.closeAllTeachingPanels()
        return { status: 'ok', closed: true, message: '已关闭全部教学演示面板' }
      }
      const panel = teachingPanelCatalog.find((item) => item.id === args.panelId)
      if (!panel) {return { error: `未知面板 ${String(args.panelId)}，可用面板：${teachingPanelCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }}
      if (hidesThematicLayers(useGlobeStore.getState().selectedLayerId)) {return { error: '夜光模式下教学面板不可用，请先用 set_basemap 切回其他底图' }}
      panel.open()
      return { status: 'ok', panelId: panel.id, name: panel.name, message: `已打开「${panel.name}」面板：${panel.hint}` }
    }
  })

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
            description: `底图 id：${  basemapChoices.map((provider) => `${provider.id}（${provider.name}，${provider.description}）`).join('、')}`
          }
        },
        required: ['basemapId']
      }
    },
    execute: async (args) => {
      const basemap = basemapChoices.find((provider) => provider.id === args.basemapId)
      if (!basemap) {return { error: `未知底图 ${String(args.basemapId)}，可用底图：${basemapChoices.map((provider) => `${provider.id}（${provider.name}）`).join('、')}` }}
      if (useGlobeStore.getState().selectedLayerId === basemap.id) {return { status: 'ok', basemapId: basemap.id, name: basemap.name, message: `当前已是「${basemap.name}」底图` }}
      bridge.switchBasemap(basemap.id)
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
            description: `地形数据源：${  terrainCatalog.map((terrain) => `${terrain.id}（${terrain.name}，${terrain.description}）`).join('、')}`
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
        if (!terrain) {return { error: `未知地形 ${String(args.terrainId)}，可用地形：${terrainCatalog.map((item) => `${item.id}（${item.name}）`).join('、')}` }}
      }
      let exaggeration: number | undefined
      if (args.exaggeration !== undefined) {
        const value = Number(args.exaggeration)
        if (!Number.isFinite(value) || value < 1 || value > 5) {return { error: 'exaggeration 需为 1-5 的数字' }}
        exaggeration = Math.round(value * 10) / 10
      }
      let lighting: boolean | undefined
      if (args.lighting !== undefined) {
        if (typeof args.lighting !== 'boolean') {return { error: 'lighting 需为布尔值' }}
        lighting = args.lighting
      }
      if (!terrain && exaggeration === undefined && lighting === undefined) {return { error: '请至少提供 terrainId、exaggeration 或 lighting 之一' }}
      const applied: string[] = []
      if (terrain) {
        bridge.setTerrain(terrain.id)
        applied.push(`地形切换为「${terrain.name}」`)
      }
      if (exaggeration !== undefined) {
        bridge.setTerrainExaggeration(exaggeration)
        applied.push(`垂直夸张 ${useGlobeStore.getState().terrainExaggeration}×`)
      }
      if (lighting !== undefined) {
        bridge.setTerrainLighting(lighting)
        applied.push(`地形光照已${lighting ? '开启' : '关闭'}`)
      }
      const nextGlobe = useGlobeStore.getState()
      return { status: 'ok', terrainId: terrain?.id, exaggeration: nextGlobe.terrainExaggeration, lighting: nextGlobe.terrainLighting, message: applied.join('，') }
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
      const current = bridge.getViewer()
      if (!current || current.isDestroyed()) {return { error: '地球尚未就绪' }}
      const longitude = Number(args.longitude)
      const latitude = Number(args.latitude)
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return { error: '坐标无效，需要 WGS-84 经纬度' }
      }
      const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude)
      let heightMeters: number | null = null
      try {
        const [sampled] = await Cesium.sampleTerrainMostDetailed(current.terrainProvider, [cartographic.clone()])
        if (sampled && Number.isFinite(sampled.height)) {heightMeters = Math.round(sampled.height * 100) / 100}
      } catch {
        void 0
      }
      if (heightMeters === null) {
        const fallback = current.scene.globe.getHeight(cartographic)
        if (typeof fallback === 'number' && Number.isFinite(fallback)) {heightMeters = Math.round(fallback * 100) / 100}
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
      if (!name) {return { error: '需要提供场景名称' }}
      const narration = typeof args.narration === 'string' ? args.narration.trim().slice(0, 500) : ''
      try {
        const scene = bridge.captureScene(name, narration)
        const scenesStore = useScenesStore.getState()
        await scenesStore.addScene(scene)
        const saveError = useScenesStore.getState().saveError
        if (saveError) {return { error: `场景保存失败：${saveError}` }}
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
      await useScenesStore.getState().hydrate()
      const scenes = useScenesStore.getState().scenes
      return {
        count: scenes.length,
        scenes: scenes.map((scene, index) => ({
          order: index + 1,
          id: scene.id,
          name: scene.name,
          narration: scene.narration || undefined,
          layers: scene.snapshot.overlays,
          month: scene.snapshot.month,
          solarSimulation: Boolean(scene.snapshot.simTime),
          camera: {
            longitude: Math.round(scene.snapshot.camera.longitude * 10_000) / 10_000,
            latitude: Math.round(scene.snapshot.camera.latitude * 10_000) / 10_000,
            height: Math.round(scene.snapshot.camera.height)
          }
        }))
      }
    }
  })

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
                overlays: { type: 'array', description: `本幕开启的教学图层 id 列表（未列出的图层会被关闭），可选项：${  thematicLayerCatalog.map((layer) => `${layer.id}（${layer.name}）`).join('、')}`, items: { type: 'string' } },
                month: { type: 'number', description: '可选专题月份 1-12（配合季节性图层对比 1 月/7 月）' },
                simTime: { type: 'object', description: '可选昼夜模拟 { date: "YYYY-MM-DD", hour: 北京时间 0-24 }，如夏至 2026-06-22', properties: { date: { type: 'string' }, hour: { type: 'number' } } },
                ensoPhase: { type: 'string', description: '可选 ENSO 相位：normal（正常）/ el-nino（厄尔尼诺）/ la-nina（拉尼娜），配合 enso 图层讲解', enum: ['normal', 'el-nino', 'la-nina'] },
                seaLevelRise: { type: 'number', description: '可选海平面上升情景（米）：0.5 / 1 / 2 / 5，配合 sea-level-rise 图层', enum: [0.5, 1, 2, 5] },
                transportYear: { type: 'number', description: '可选高铁网络年份 2008-2025，配合 hsr-network 图层演示网络生长过程' },
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
      if (!Array.isArray(args.steps) || args.steps.length === 0) {return { error: 'steps 需为非空数组' }}
      if (args.steps.length > MAX_RECORD_STEPS) {return { error: `单次录制最多 ${MAX_RECORD_STEPS} 幕，请精简剧本` }}
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 80) : '地理教学视频'
      const steps: RecordingStep[] = []
      for (let index = 0; index < args.steps.length; index += 1) {
        const step = parseRecordingStep(args.steps[index], index)
        if ('error' in step) {return { error: step.error }}
        steps.push(step)
      }
      if (!await bridge.ensureRecordingDirectory()) {return { error: '已取消视频保存文件夹选择，录制未开始' }}
      const result = await bridge.recordVideo(title, steps)
      if ('error' in result) {return { error: result.error }}
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
      const recording = useScenesStore.getState().recording
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
}
