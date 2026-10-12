import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'
import * as Cesium from 'cesium'
import { useGlobeStore, providerCatalog, terrainCatalog, type ProviderMeta } from '@renderer/stores/globe'
import { useSolarStore } from '@renderer/stores/solar'
import { useFailureStore } from '@renderer/stores/failure'
import { captureError, captureWarning } from '@renderer/lib/crashReporter'
import { logger, stringifyLogValue } from '../../../common/logger'
import { isMirrorSatelliteProvider, mirrorEligibleProviders, withinMirrorSatelliteDetail } from '../../../common/tileMirror'
import type { PlaceSuggestion, TileMirrorStatus } from '../../../preload'
import { createPolarCaps } from './polarCaps'
import { createBasemapImageryProvider } from './basemapImagery'
import { resolveFlightDestination } from './terrainFlight'

interface LayerProvider {
  meta: ProviderMeta
  createImageryProvider: (styleId: string) => Promise<Cesium.ImageryProvider>
}

const providerMeta = (id: string): ProviderMeta => providerCatalog.find((provider) => provider.id === id) ?? providerCatalog[0]

const layerRegistry: Record<string, LayerProvider> = {
  osm: { meta: providerMeta('osm'), createImageryProvider: async (styleId) => createBasemapImageryProvider('osm', styleId) },
  'esri-imagery': { meta: providerMeta('esri-imagery'), createImageryProvider: async (styleId) => createBasemapImageryProvider('esri-imagery', styleId) },
  opentopomap: { meta: providerMeta('opentopomap'), createImageryProvider: async (styleId) => createBasemapImageryProvider('opentopomap', styleId) },
  baidu: { meta: providerMeta('baidu'), createImageryProvider: async (styleId) => createBasemapImageryProvider('baidu', styleId) },
  'viirs-night': { meta: providerMeta('viirs-night'), createImageryProvider: async (styleId) => createBasemapImageryProvider('viirs-night', styleId) }
}

const terrainRegistry: Record<string, () => Promise<Cesium.TerrainProvider>> = {
  ellipsoid: async () => new Cesium.EllipsoidTerrainProvider(),
  'arcgis-terrain': () => Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'),
  'cesium-world-terrain': () => Cesium.CesiumTerrainProvider.fromUrl(Cesium.IonResource.fromAssetId(1), { requestVertexNormals: true })
}

const terrainName = (id: string): string => terrainCatalog.find((terrain) => terrain.id === id)?.name ?? id
const providerName = (id: string): string => layerRegistry[id]?.meta.name ?? id

const GLOBE_LOAD_TIMEOUT_MS = 20_000
const TILE_RECOVERY_GRACE_MS = 3_000
const TERRAIN_RESOLVE_BUDGET_MS = 4_000
const MIRROR_OVERSEAS_MIN_CAMERA_HEIGHT_M = 150_000

type LayerLoadResult =
  | { ok: true }
  | { ok: false; reason: 'key' | 'create' | 'cancelled' | 'inflight'; message: string; detail: string }

const DEPTH_TEST_FREE_HEIGHT_FACTOR = 1.3
const MIN_DEPTH_TEST_FREE_DISTANCE = 10_000
const MAX_DEPTH_TEST_FREE_DISTANCE = 8_000_000
const COARSE_DEPTH_TEST_DISTANCE = 100_000_000
const COLLECTION_STAMP_INTERVAL_MS = 2000

function normalizeHeading(radians: number): number {
  const degrees = Cesium.Math.toDegrees(radians) % 360
  return degrees < 0 ? degrees + 360 : degrees
}

export function useCesiumViewer(container: Ref<HTMLDivElement | undefined>) {
  const viewer = shallowRef<Cesium.Viewer>()
  const imageryLayers = new Map<string, Cesium.ImageryLayer>()
  const imageryLayerStyles = new Map<string, string>()
  const styleRequestSequences = new Map<string, number>()
  const layersInFlight = new Set<string>()
  const store = useGlobeStore()
  const solarStore = useSolarStore()
  const failureStore = useFailureStore()
  let generation = 0
  let flightRequestSequence = 0
  let terrainRequestSeq = 0
  let activeBasemapId = ''
  let lastTileErrorAt = 0
  let lastTileErrorLoggedAt = 0
  let lastRenderErrorAt = 0
  let renderErrorReported = false
  let loadTimeoutReported = false
  let loadTimeoutTimer: number | undefined
  let initialSurfaceCheckTimer: number | undefined
  let initialSurfaceReady = false
  let initialTerrainReady = false
  let initialImageryReady = false
  let initialSurfaceReadyCallback: (() => void) | undefined
  let initialSurfaceRenderListener: (() => void) | undefined
  let tileProgressListener: ((pending: number) => void) | undefined
  let selectedPlaceMarker: Cesium.Entity | undefined
  let polarCaps: Cesium.Primitive | undefined
  let mirrorListenerDisposer: (() => void) | undefined
  let mirrorOverseasNoticeShown = false
  let mirrorRouteActive: boolean | undefined

  function updatePolarCapsVisibility(): void {
    if (polarCaps && viewer.value) polarCaps.show = viewer.value.scene.mode === Cesium.SceneMode.SCENE3D
  }

  function updateDepthTestDistance(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    const height = currentViewer.camera.positionCartographic.height
    const distance = Math.min(Math.max(height * DEPTH_TEST_FREE_HEIGHT_FACTOR, MIN_DEPTH_TEST_FREE_DISTANCE), MAX_DEPTH_TEST_FREE_DISTANCE)
    currentViewer.scene.minimumDisableDepthTestDistance = distance
  }

  const coarseStampedCollections = new WeakSet<object>()
  const dataSourceDetachers = new Map<Cesium.DataSource, () => void>()
  let defaultEntitiesDetacher: (() => void) | undefined
  let lastCollectionStampAt = 0

  function applyCoarseDepthTestDistance(collection: unknown): void {
    if (!collection || coarseStampedCollections.has(collection)) return
    coarseStampedCollections.add(collection)
    ;(collection as { coarseDepthTestDistance: number }).coarseDepthTestDistance = COARSE_DEPTH_TEST_DISTANCE
  }

  function stampEntityClusterDepthRanges(cluster: Cesium.EntityCluster): void {
    const slots = cluster as unknown as Record<string, unknown>
    applyCoarseDepthTestDistance(slots._labelCollection)
    applyCoarseDepthTestDistance(slots._billboardCollection)
    applyCoarseDepthTestDistance(slots._clusterLabelCollection)
    applyCoarseDepthTestDistance(slots._clusterBillboardCollection)
  }

  function stampCoarseDepthTestDistance(primitives: Cesium.PrimitiveCollection, visited: Set<object>): void {
    for (let index = 0; index < primitives.length; index += 1) {
      const primitive = primitives.get(index)
      if (!primitive || visited.has(primitive)) continue
      visited.add(primitive)
      if (primitive instanceof Cesium.PrimitiveCollection) {
        stampCoarseDepthTestDistance(primitive, visited)
        continue
      }
      if (primitive instanceof Cesium.EntityCluster) {
        stampEntityClusterDepthRanges(primitive)
        continue
      }
      if (primitive instanceof Cesium.LabelCollection || primitive instanceof Cesium.BillboardCollection) applyCoarseDepthTestDistance(primitive)
    }
  }

  function updateCollectionDepthTestDistances(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    const now = performance.now()
    if (now - lastCollectionStampAt < COLLECTION_STAMP_INTERVAL_MS) return
    lastCollectionStampAt = now
    stampCoarseDepthTestDistance(currentViewer.scene.primitives, new Set())
  }

  const horizonWrappedGraphics = new WeakSet<object>()
  type EllipsoidalOccluderLike = { cameraPosition: Cesium.Cartesian3; isPointVisible: (point: Cesium.Cartesian3) => boolean }
  const createEllipsoidalOccluder = Cesium as unknown as { EllipsoidalOccluder: new (ellipsoid: Cesium.Ellipsoid, position: Cesium.Cartesian3) => EllipsoidalOccluderLike }
  const horizonOccluder = new createEllipsoidalOccluder.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, Cesium.Cartesian3.ZERO)
  const horizonScratchPosition = new Cesium.Cartesian3()

  function wrapGraphicsShowForHorizon(graphics: { show?: Cesium.Property }, entity: Cesium.Entity): void {
    if (!entity.position || horizonWrappedGraphics.has(graphics)) return
    horizonWrappedGraphics.add(graphics)
    const original = graphics.show
    graphics.show = new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
      if (original && !original.getValue(time)) return false
      const currentViewer = viewer.value
      if (!currentViewer || currentViewer.isDestroyed() || currentViewer.scene.mode !== Cesium.SceneMode.SCENE3D) return true
      const point = entity.position?.getValue(time, horizonScratchPosition)
      if (!point) return true
      return horizonOccluder.isPointVisible(point)
    }, false)
  }

  function updateHorizonCamera(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    horizonOccluder.cameraPosition = currentViewer.camera.positionWC
  }

  function wrapEntityGraphics(entity: Cesium.Entity): void {
    if (entity.label) wrapGraphicsShowForHorizon(entity.label, entity)
    if (entity.point) wrapGraphicsShowForHorizon(entity.point, entity)
  }

  function trackEntityCollection(entities: Cesium.EntityCollection): () => void {
    const listener = (_collection: Cesium.EntityCollection, added: Cesium.Entity[]): void => {
      for (const entity of added) wrapEntityGraphics(entity)
    }
    entities.collectionChanged.addEventListener(listener)
    for (const entity of entities.values) wrapEntityGraphics(entity)
    return () => entities.collectionChanged.removeEventListener(listener)
  }

  function handleDataSourceAdded(_collection: Cesium.DataSourceCollection, dataSource: Cesium.DataSource): void {
    dataSourceDetachers.set(dataSource, trackEntityCollection(dataSource.entities))
  }

  function handleDataSourceRemoved(_collection: Cesium.DataSourceCollection, dataSource: Cesium.DataSource): void {
    dataSourceDetachers.get(dataSource)?.()
    dataSourceDetachers.delete(dataSource)
  }

  function attachHorizonTracking(currentViewer: Cesium.Viewer): void {
    defaultEntitiesDetacher = trackEntityCollection(currentViewer.entities)
    for (let index = 0; index < currentViewer.dataSources.length; index += 1) {
      const dataSource = currentViewer.dataSources.get(index)
      dataSourceDetachers.set(dataSource, trackEntityCollection(dataSource.entities))
    }
    currentViewer.dataSources.dataSourceAdded.addEventListener(handleDataSourceAdded)
    currentViewer.dataSources.dataSourceRemoved.addEventListener(handleDataSourceRemoved)
  }

  function detachHorizonTracking(currentViewer: Cesium.Viewer): void {
    defaultEntitiesDetacher?.()
    defaultEntitiesDetacher = undefined
    currentViewer.dataSources.dataSourceAdded.removeEventListener(handleDataSourceAdded)
    currentViewer.dataSources.dataSourceRemoved.removeEventListener(handleDataSourceRemoved)
    for (const detach of dataSourceDetachers.values()) detach()
    dataSourceDetachers.clear()
  }

  function applyTerrain(terrain: Cesium.TerrainProvider): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    flightRequestSequence += 1
    currentViewer.terrainProvider = terrain
    currentViewer.scene.requestRender()
    if (polarCaps) currentViewer.scene.primitives.remove(polarCaps)
    polarCaps = createPolarCaps(terrain)
    if (polarCaps) {
      polarCaps.appearance = new Cesium.PerInstanceColorAppearance({ flat: !(store.terrainLighting || solarStore.active), translucent: false })
      currentViewer.scene.primitives.add(polarCaps)
      updatePolarCapsVisibility()
    }
  }

  function updateCameraState(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    const camera = currentViewer.camera
    const cartographic = camera.positionCartographic
    store.setCameraReadout({ longitude: Cesium.Math.toDegrees(cartographic.longitude), latitude: Cesium.Math.toDegrees(cartographic.latitude), height: cartographic.height, heading: normalizeHeading(camera.heading), pitch: Cesium.Math.toDegrees(camera.pitch) })
  }

  function layerMeta(id: string) { return store.layers.find((layer) => layer.id === id) }

  function handleTileError(id: string, name: string, error: unknown): void {
    if (id !== store.selectedLayerId) return
    lastTileErrorAt = Date.now()
    const detail = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : `${name}瓦片请求失败`
    if (Date.now() - lastTileErrorLoggedAt > 5000) {
      lastTileErrorLoggedAt = Date.now()
      logger.warn('basemap', `${name}瓦片加载失败`, detail)
    }
    store.setGlobeError('地图数据加载失败，正在使用已缓存的部分', detail)
  }

  async function addLayer(id: string, expectedGeneration: number): Promise<LayerLoadResult> {
    const provider = layerRegistry[id]
    if (!viewer.value || !provider) return { ok: false, reason: 'cancelled', message: '', detail: '' }
    if (imageryLayers.has(id)) return { ok: true }
    if (layersInFlight.has(id)) return { ok: false, reason: 'inflight', message: '', detail: '' }
    if (provider.meta.requiresKey && !store.providerCredentials[id]?.configured) {
      return { ok: false, reason: 'key', message: `${provider.meta.name}需要 API Key`, detail: '请在「图层管理 → 供应商密钥」中配置后重试' }
    }
    layersInFlight.add(id)
    try {
      const styleId = store.providerStyles[id] ?? provider.meta.defaultStyleId
      const imageryProvider = await provider.createImageryProvider(styleId)
      imageryProvider.errorEvent.addEventListener((error) => handleTileError(id, provider.meta.name, error))
      const currentViewer = viewer.value
      if (!currentViewer || currentViewer.isDestroyed() || expectedGeneration !== generation) return { ok: false, reason: 'cancelled', message: '', detail: '' }
      const layer = currentViewer.imageryLayers.addImageryProvider(imageryProvider)
      layer.show = id === store.selectedLayerId
      layer.alpha = layerMeta(id)?.opacity ?? 1
      imageryLayers.set(id, layer)
      imageryLayerStyles.set(id, styleId)
      return { ok: true }
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      logger.warn('basemap', `${provider.meta.name}加载失败`, detail)
      return { ok: false, reason: 'create', message: `${provider.meta.name}加载失败`, detail }
    } finally {
      layersInFlight.delete(id)
    }
  }

  function revealBasemap(id: string): void {
    imageryLayers.forEach((layer, layerId) => { layer.show = layerId === id })
    activeBasemapId = id
    failureStore.clearFailure('basemap')
    evaluateGlobeReady()
  }

  function retireImageryLayer(layer: Cesium.ImageryLayer): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) {
      layer.destroy()
      return
    }
    currentViewer.imageryLayers.remove(layer, false)
    window.setTimeout(() => {
      if (!layer.isDestroyed()) layer.destroy()
    }, 1000)
  }

  function switchBasemap(id: string): void {
    const provider = layerRegistry[id]
    if (!provider || !viewer.value || viewer.value.isDestroyed()) return
    const previousId = activeBasemapId
    store.selectBasemap(id)
    if (imageryLayers.has(id)) {
      revealBasemap(id)
      return
    }
    void addLayer(id, generation).then((result) => {
      if (store.selectedLayerId !== id) return
      if (result.ok) {
        revealBasemap(id)
        return
      }
      if (result.reason === 'cancelled' || result.reason === 'inflight') return
      if (previousId && previousId !== id && imageryLayers.has(previousId)) {
        store.selectBasemap(previousId)
        revealBasemap(previousId)
        failureStore.reportDegrade(`${result.message}，已回到 ${providerName(previousId)}`)
        return
      }
      store.setGlobeError(result.message, result.detail)
    })
  }

  function setProviderStyle(id: string, styleId: string): void {
    const provider = layerRegistry[id]
    if (!provider || !provider.meta.styles.some((style) => style.id === styleId)) return
    const previousStyleId = store.providerStyles[id] ?? provider.meta.defaultStyleId
    if (previousStyleId === styleId) return
    store.setProviderStyle(id, styleId)
    const layer = imageryLayers.get(id)
    if (!layer || !viewer.value || viewer.value.isDestroyed()) return
    const requestSequence = (styleRequestSequences.get(id) ?? 0) + 1
    styleRequestSequences.set(id, requestSequence)
    const activeStyleId = imageryLayerStyles.get(id) ?? previousStyleId
    void provider.createImageryProvider(styleId).then((imageryProvider) => {
      if (styleRequestSequences.get(id) !== requestSequence) return
      const currentViewer = viewer.value
      if (!currentViewer || currentViewer.isDestroyed() || layer.isDestroyed()) return
      imageryProvider.errorEvent.addEventListener((error) => handleTileError(id, provider.meta.name, error))
      const replacement = currentViewer.imageryLayers.addImageryProvider(imageryProvider)
      replacement.show = false
      replacement.alpha = layer.alpha
      imageryLayers.set(id, replacement)
      imageryLayerStyles.set(id, styleId)
      if (id === store.selectedLayerId) revealBasemap(id)
      retireImageryLayer(layer)
    }).catch((error: unknown) => {
      if (styleRequestSequences.get(id) !== requestSequence) return
      store.setProviderStyle(id, activeStyleId)
      layer.show = id === store.selectedLayerId
      store.setGlobeError(`${provider.meta.name}样式切换失败`, error instanceof Error ? error.message : '')
    })
  }

  async function setTerrain(id: string, expectedGeneration: number): Promise<void> {
    const create = terrainRegistry[id] ?? terrainRegistry.ellipsoid
    terrainRequestSeq += 1
    const requestSeq = terrainRequestSeq
    try {
      const terrain = await create()
      if (!viewer.value || viewer.value.isDestroyed() || expectedGeneration !== generation || requestSeq !== terrainRequestSeq) return
      applyTerrain(terrain)
      store.setActiveTerrainId(id)
      store.setTerrainError('')
    } catch (error) {
      if (requestSeq !== terrainRequestSeq) return
      const detail = error instanceof Error ? error.message : ''
      logger.warn('terrain', `${terrainName(id)}不可用`, detail)
      if (id === 'ellipsoid') {
        store.setTerrainError('地形不可用，且无法降级为平滑球面', detail)
        return
      }
      const fallback = await terrainRegistry.ellipsoid()
      if (!viewer.value || viewer.value.isDestroyed() || expectedGeneration !== generation || requestSeq !== terrainRequestSeq) return
      applyTerrain(fallback)
      store.setTerrainError('')
      store.setActiveTerrainId('ellipsoid')
      failureStore.reportDegrade(`${terrainName(id)}不可用，已降级为平滑球面`)
    }
  }

  function clearLoadTimeout(): void {
    if (loadTimeoutTimer !== undefined) {
      window.clearTimeout(loadTimeoutTimer)
      loadTimeoutTimer = undefined
    }
    store.setGlobeLoadTimedOut(false)
  }

  const TERRAIN_READY_STATE = 6

  function hasVisibleGlobeSurface(currentViewer: Cesium.Viewer): boolean {
    const canvas = currentViewer.scene.canvas
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return false
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
    const ray = currentViewer.camera.getPickRay(center)
    if (!ray) return false
    try {
      return currentViewer.scene.globe.pick(ray, currentViewer.scene) !== undefined
    } catch {
      return false
    }
  }

  function hasRenderedInitialSurface(currentViewer: Cesium.Viewer): { terrain: boolean; imagery: boolean } {
    if (!hasVisibleGlobeSurface(currentViewer)) return { terrain: false, imagery: false }
    const activeLayer = imageryLayers.get(store.selectedLayerId)
    const fallback = (): { terrain: boolean; imagery: boolean } => ({
      terrain: currentViewer.scene.globe.tilesLoaded,
      imagery: currentViewer.scene.globe.tilesLoaded && Boolean(activeLayer && !activeLayer.isDestroyed() && activeLayer.show && activeLayer.ready)
    })
    try {
      const surface = (currentViewer.scene.globe as unknown as { _surface?: { _tilesToRender?: Array<{ data?: { renderedMesh?: unknown; terrainState?: number; imagery?: Array<{ useWebMercatorT?: boolean; readyImagery?: { imageryLayer?: Cesium.ImageryLayer; texture?: unknown; textureWebMercator?: unknown } }> } }> } })._surface
      const tiles = surface?._tilesToRender
      if (!Array.isArray(tiles)) return fallback()
      let terrain = false
      let imagery = false
      for (const tile of tiles) {
        const data = tile?.data
        if (!data?.renderedMesh || data.terrainState !== TERRAIN_READY_STATE) continue
        terrain = true
        if (activeLayer?.show && Array.isArray(data.imagery) && data.imagery.some((item) => item?.readyImagery?.imageryLayer === activeLayer && Boolean(item.useWebMercatorT ? item.readyImagery.textureWebMercator : item.readyImagery.texture))) imagery = true
        if (terrain && imagery) break
      }
      return { terrain, imagery }
    } catch {
      return fallback()
    }
  }

  function detachInitialSurfaceTracking(currentViewer?: Cesium.Viewer): void {
    if (initialSurfaceCheckTimer !== undefined) {
      window.clearTimeout(initialSurfaceCheckTimer)
      initialSurfaceCheckTimer = undefined
    }
    if (initialSurfaceRenderListener && currentViewer && !currentViewer.isDestroyed()) {
      currentViewer.scene.postRender.removeEventListener(initialSurfaceRenderListener)
    }
    initialSurfaceRenderListener = undefined
  }

  function attachInitialSurfaceTracking(currentViewer: Cesium.Viewer): void {
    initialSurfaceReady = false
    initialTerrainReady = false
    initialImageryReady = false
    const listener = (): void => {
      if (currentViewer.isDestroyed()) {
        detachInitialSurfaceTracking()
        return
      }
      const rendered = hasRenderedInitialSurface(currentViewer)
      if (!initialSurfaceReady && rendered.terrain) {
        initialSurfaceReady = true
        const callback = initialSurfaceReadyCallback
        initialSurfaceReadyCallback = undefined
        callback?.()
        return
      }
      if (currentViewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider) {
        if (!initialTerrainReady) return
        if (rendered.imagery) initialImageryReady = true
        if (initialImageryReady) {
          detachInitialSurfaceTracking(currentViewer)
          evaluateGlobeReady()
          return
        }
      } else {
        if (rendered.terrain) initialTerrainReady = true
        if (rendered.imagery) initialImageryReady = true
        if (initialTerrainReady && initialImageryReady) {
          detachInitialSurfaceTracking(currentViewer)
          evaluateGlobeReady()
          return
        }
      }
      if (initialSurfaceCheckTimer === undefined) {
        initialSurfaceCheckTimer = window.setTimeout(() => {
          initialSurfaceCheckTimer = undefined
          if (!currentViewer.isDestroyed()) currentViewer.scene.requestRender()
        }, 250)
      }
    }
    initialSurfaceRenderListener = listener
    currentViewer.scene.postRender.addEventListener(listener)
    currentViewer.scene.requestRender()
  }

  function evaluateGlobeReady(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    if (store.isGlobeReady) return
    if (!initialTerrainReady || !initialImageryReady || !currentViewer.scene.globe.show) return
    if (imageryLayers.size === 0) return
    clearLoadTimeout()
    store.setGlobeReady(true)
  }

  async function resolveInitialTerrain(id: string): Promise<{ provider: Cesium.TerrainProvider; id: string }> {
    const create = terrainRegistry[id] ?? terrainRegistry.ellipsoid
    let settled = false
    const timeout = new Promise<{ provider: Cesium.TerrainProvider; id: string }>((resolve) => {
      window.setTimeout(() => {
        if (settled) return
        settled = true
        logger.warn('terrain', `${terrainName(id)}加载超时，已降级为平滑球面`)
        failureStore.reportDegrade(`${terrainName(id)}加载超时，已降级为平滑球面`)
        void terrainRegistry.ellipsoid().then((provider) => resolve({ provider, id: 'ellipsoid' }))
      }, TERRAIN_RESOLVE_BUDGET_MS)
    })
    try {
      const attempt = create().then((provider) => ({ provider, id }))
      const resolved = await Promise.race([attempt, timeout])
      settled = true
      return resolved
    } catch (error) {
      settled = true
      logger.warn('terrain', `${terrainName(id)}不可用，已降级为平滑球面`, error)
      failureStore.reportDegrade(`${terrainName(id)}不可用，已降级为平滑球面`)
      return { provider: await terrainRegistry.ellipsoid(), id: 'ellipsoid' }
    }
  }

  function startLoadTimeout(): void {
    clearLoadTimeout()
    loadTimeoutTimer = window.setTimeout(() => {
      loadTimeoutTimer = undefined
      evaluateGlobeReady()
      if (store.isGlobeReady) return
      logger.warn('globe', `地球加载超时（${GLOBE_LOAD_TIMEOUT_MS / 1000} 秒未就绪）`, `stage=${store.globeLoadStage}`)
      if (!loadTimeoutReported) {
        loadTimeoutReported = true
        captureWarning('globe-load', `地球加载超时（${GLOBE_LOAD_TIMEOUT_MS / 1000} 秒未就绪）`, { stage: store.globeLoadStage })
      }
      store.setGlobeLoadTimedOut(true)
    }, GLOBE_LOAD_TIMEOUT_MS)
  }

  function handleSceneRenderError(_scene: Cesium.Scene, error: unknown): void {
    if (Date.now() - lastRenderErrorAt < 5000) return
    lastRenderErrorAt = Date.now()
    if (!renderErrorReported) {
      renderErrorReported = true
      captureError('globe-render', error instanceof Error ? error : new Error(stringifyLogValue(error)))
      return
    }
    logger.warn('globe', '场景渲染错误（持续发生，已上报过首次错误）', error)
  }

  function detachTileProgress(): void {
    const currentViewer = viewer.value
    if (tileProgressListener && currentViewer && !currentViewer.isDestroyed()) currentViewer.scene.globe.tileLoadProgressEvent.removeEventListener(tileProgressListener)
    tileProgressListener = undefined
  }

  function attachTileProgress(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    detachTileProgress()
    const listener = (pending: number): void => {
      if (pending > 0) return
      if (!store.isGlobeReady) {
        evaluateGlobeReady()
        return
      }
      if (lastTileErrorAt && Date.now() - lastTileErrorAt > TILE_RECOVERY_GRACE_MS) {
        lastTileErrorAt = 0
        store.setGlobeError('')
      }
    }
    tileProgressListener = listener
    currentViewer.scene.globe.tileLoadProgressEvent.addEventListener(listener)
  }

  async function retryBasemap(): Promise<void> {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    const id = store.selectedLayerId
    store.setGlobeError('')
    store.setGlobeLoadStage('正在重新加载地图…')
    startLoadTimeout()
    const existing = imageryLayers.get(id)
    if (existing) {
      retireImageryLayer(existing)
      imageryLayers.delete(id)
    }
    const result = await addLayer(id, generation)
    if (result.ok) {
      revealBasemap(id)
      return
    }
    if (result.reason === 'cancelled' || result.reason === 'inflight') return
    store.setGlobeError(result.message, result.detail)
  }

  async function retryTerrain(): Promise<void> {
    store.setTerrainError('')
    await setTerrain(store.terrainProviderId, generation)
  }

  function reloadMirrorBasemapLayers(): void {
    for (const id of Object.keys(mirrorEligibleProviders)) {
      const layer = imageryLayers.get(id)
      if (!layer) continue
      imageryLayers.delete(id)
      retireImageryLayer(layer)
    }
    const id = store.selectedLayerId
    if (!mirrorEligibleProviders[id]) return
    void addLayer(id, generation).then((result) => {
      if (result.ok) {
        if (store.selectedLayerId === id) revealBasemap(id)
        return
      }
      if (result.reason === 'cancelled' || result.reason === 'inflight') return
      store.setGlobeError(result.message, result.detail)
    })
  }

  function applyMirrorStatus(status: TileMirrorStatus): void {
    store.setMirroredProviders(status.mirroredProviders)
    const activeMirrored = status.mirroredProviders.includes(activeBasemapId)
    if (mirrorRouteActive !== undefined && mirrorRouteActive !== activeMirrored) {
      mirrorOverseasNoticeShown = false
      reloadMirrorBasemapLayers()
    }
    mirrorRouteActive = activeMirrored
    if (status.notice) failureStore.reportDegrade(status.notice)
  }

  function clampMirrorOverseasZoom(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    if (!store.isMirrorActive(activeBasemapId) || !isMirrorSatelliteProvider(activeBasemapId)) return
    const camera = currentViewer.camera
    const cartographic = camera.positionCartographic
    if (cartographic.height >= MIRROR_OVERSEAS_MIN_CAMERA_HEIGHT_M) return
    const longitude = Cesium.Math.toDegrees(cartographic.longitude)
    const latitude = Cesium.Math.toDegrees(cartographic.latitude)
    if (withinMirrorSatelliteDetail(longitude, latitude)) return
    camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, MIRROR_OVERSEAS_MIN_CAMERA_HEIGHT_M),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll }
    })
    if (!mirrorOverseasNoticeShown) {
      mirrorOverseasNoticeShown = true
      failureStore.reportDegrade('海外区域卫星影像层级有限，已抬升视角')
    }
  }

  function applyTerrainRendering(): void {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    currentViewer.scene.verticalExaggeration = store.terrainExaggeration
    currentViewer.scene.globe.enableLighting = store.terrainLighting || solarStore.active
    currentViewer.scene.requestRender()
    currentViewer.scene.globe.depthTestAgainstTerrain = true
  }

  watch(() => [solarStore.active, solarStore.utcMs] as const, () => {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    currentViewer.clock.currentTime = solarStore.active
      ? Cesium.JulianDate.fromDate(new Date(solarStore.utcMs))
      : Cesium.JulianDate.now()
    currentViewer.scene.globe.enableLighting = store.terrainLighting || solarStore.active
    currentViewer.scene.requestRender()
  })

  function toggleLevelView(): void {
    flightRequestSequence += 1
    if (!viewer.value || viewer.value.isDestroyed()) return
    const currentViewer = viewer.value
    const camera = currentViewer.camera
    const cartographic = camera.positionCartographic
    const longitude = Cesium.Math.toDegrees(cartographic.longitude)
    const latitude = Cesium.Math.toDegrees(cartographic.latitude)
    const activate = !store.levelViewActive
    store.setLevelViewActive(activate)
    const height = activate ? Math.min(Math.max(cartographic.height * 0.35, 15000), 120000) : Math.min(Math.max(cartographic.height * 2, 40000), 4000000)
    const pitch = activate ? -12 : -45
    const flyToOrientation = () => {
      if (currentViewer.isDestroyed()) return
      currentViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: camera.heading,
          pitch: Cesium.Math.toRadians(pitch),
          roll: 0.0
        },
        duration: 1.2,
        complete: updateCameraState
      })
    }
    if (currentViewer.scene.mode !== Cesium.SceneMode.SCENE3D) {
      const morphComplete = () => {
        currentViewer.scene.morphComplete.removeEventListener(morphComplete)
        flyToOrientation()
      }
      currentViewer.scene.morphComplete.addEventListener(morphComplete)
      currentViewer.scene.morphTo3D(1.0)
      store.setSceneMode('3D')
    } else {
      flyToOrientation()
    }
  }

  async function flyTo(longitude: number, latitude: number, height: number): Promise<number | undefined> {
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    if (![longitude, latitude, height].every(Number.isFinite) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90 || height <= 0) return
    const requestSequence = ++flightRequestSequence
    const destination = await resolveFlightDestination(currentViewer.scene, longitude, latitude, height)
    if (viewer.value !== currentViewer || currentViewer.isDestroyed() || requestSequence !== flightRequestSequence) return
    currentViewer.camera.flyTo({ destination, duration: 1.2, complete: updateCameraState })
    return Cesium.Cartographic.fromCartesian(destination).height
  }

  function flyToPlace(place: PlaceSuggestion): void {
    flightRequestSequence += 1
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    const { longitude, latitude } = place
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return
    if (selectedPlaceMarker) currentViewer.entities.remove(selectedPlaceMarker)
    selectedPlaceMarker = currentViewer.entities.add({
      name: place.name,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#1677ff'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: place.name,
        font: '14px -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
    void currentViewer.flyTo(selectedPlaceMarker, {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), 5000),
      duration: 1.2
    }).then(updateCameraState)
  }

  onMounted(() => {
    void (async () => {
      if (!container.value) return
      store.setGlobeLoadStage('正在读取设置…')
      failureStore.registerRetry('settings', async () => {
        store.setGlobeLoadStage('正在重新读取设置…')
        await store.hydrateSettings()
        if (store.selectedLayerId !== activeBasemapId) switchBasemap(store.selectedLayerId)
        await setTerrain(store.terrainProviderId, generation)
      })
      await store.hydrateSettings()
      try {
        generation += 1
        store.setGlobeLoadStage('正在初始化地球…')
        const terrainPromise = resolveInitialTerrain(store.terrainProviderId)
        viewer.value = new Cesium.Viewer(container.value, { baseLayer: false, baseLayerPicker: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(), geocoder: false, animation: false, timeline: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, homeButton: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, useBrowserRecommendedResolution: true, contextOptions: { webgl: { preserveDrawingBuffer: true } } })
        const currentViewer = viewer.value
        currentViewer.scene.globe.show = true
        currentViewer.scene.globe.tileCacheSize = 256
        store.setGlobeLoadStage('正在显示地球表面…')
        currentViewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(105, 35, 15000000) })
        const initialMode = store.sceneMode === '2D' ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D
        currentViewer.scene.mode = initialMode
        applyTerrainRendering()
        currentViewer.scene.preUpdate.addEventListener(updatePolarCapsVisibility)
        currentViewer.scene.preUpdate.addEventListener(updateDepthTestDistance)
        currentViewer.scene.preUpdate.addEventListener(updateCollectionDepthTestDistances)
        currentViewer.scene.preUpdate.addEventListener(updateHorizonCamera)
        attachHorizonTracking(currentViewer)
        currentViewer.scene.renderError.addEventListener(handleSceneRenderError)
        currentViewer.camera.moveEnd.addEventListener(updateCameraState)
        currentViewer.camera.moveEnd.addEventListener(clampMirrorOverseasZoom)
        mirrorListenerDisposer = window.guEarth.tiles.onMirrorStatus(applyMirrorStatus)
        void window.guEarth.tiles.getMirrorStatus().then((status) => {
          if (viewer.value && !viewer.value.isDestroyed()) applyMirrorStatus(status)
        })
        updateCameraState()
        let terrainSetup: { provider: Cesium.TerrainProvider; id: string } | undefined
        let terrainApplied = false
        const applyInitialTerrain = (): void => {
          if (!terrainSetup || terrainApplied) return
          const activeViewer = viewer.value
          if (!activeViewer || activeViewer.isDestroyed()) return
          terrainApplied = true
          applyTerrain(terrainSetup.provider)
          store.setActiveTerrainId(terrainSetup.id)
          if (terrainSetup.id === 'ellipsoid') {
            initialTerrainReady = true
            evaluateGlobeReady()
          }
          currentViewer.scene.requestRender()
          store.setGlobeLoadStage(terrainSetup.id === 'ellipsoid' ? '正在加载地图瓦片…' : '正在加载首屏地形…')
        }
        initialSurfaceReadyCallback = undefined
        attachInitialSurfaceTracking(currentViewer)
        attachTileProgress()
        startLoadTimeout()
        failureStore.registerRetry('basemap', retryBasemap)
        failureStore.registerRetry('terrain', retryTerrain)
        void terrainPromise.then((resolvedTerrain) => {
          terrainSetup = resolvedTerrain
          applyInitialTerrain()
        })
        const initialLayerId = store.selectedLayerId
        void (async () => {
          const result = await addLayer(initialLayerId, generation)
          if (result.ok) {
            revealBasemap(initialLayerId)
            return
          }
          if (result.reason === 'cancelled' || result.reason === 'inflight') return
          if (initialLayerId !== 'osm') {
            const fallback = await addLayer('osm', generation)
            if (fallback.ok) {
              store.selectBasemap('osm')
              revealBasemap('osm')
              failureStore.reportDegrade(`${result.message}，已切换到 OpenStreetMap`)
              return
            }
          }
          store.setGlobeError(result.message, result.detail)
        })()
      } catch (error) {
        captureError('globe-init', error, { stage: store.globeLoadStage })
        store.setGlobeError('地球初始化失败', error instanceof Error ? error.message : '')
      }
    })()
  })

  onBeforeUnmount(() => {
    generation += 1
    clearLoadTimeout()
    detachInitialSurfaceTracking(viewer.value)
    initialSurfaceReady = false
    initialTerrainReady = false
    initialSurfaceReadyCallback = undefined
    detachTileProgress()
    const currentViewer = viewer.value
    if (!currentViewer || currentViewer.isDestroyed()) return
    currentViewer.camera.moveEnd.removeEventListener(updateCameraState)
    currentViewer.camera.moveEnd.removeEventListener(clampMirrorOverseasZoom)
    mirrorListenerDisposer?.()
    mirrorListenerDisposer = undefined
    currentViewer.scene.preUpdate.removeEventListener(updatePolarCapsVisibility)
    currentViewer.scene.preUpdate.removeEventListener(updateDepthTestDistance)
    currentViewer.scene.preUpdate.removeEventListener(updateCollectionDepthTestDistances)
    currentViewer.scene.preUpdate.removeEventListener(updateHorizonCamera)
    detachHorizonTracking(currentViewer)
    currentViewer.scene.renderError.removeEventListener(handleSceneRenderError)
    currentViewer.destroy()
    viewer.value = undefined
    selectedPlaceMarker = undefined
    polarCaps = undefined
    imageryLayers.clear()
    imageryLayerStyles.clear()
    styleRequestSequences.clear()
  })

  return {
    viewer,
    switchBasemap,
    setProviderStyle,
    setLayerOpacity: (id: string, opacity: number) => { const value = Math.min(1, Math.max(0, opacity)); const layer = imageryLayers.get(id); if (layer) layer.alpha = value; store.setLayerOpacity(id, value) },
    flyTo,
    flyToPlace,
    toggleLevelView,
    setTerrain: (id: string) => { store.setTerrainProvider(id); void setTerrain(id, generation) },
    setTerrainExaggeration: (value: number) => { flightRequestSequence += 1; store.setTerrainExaggeration(value); const currentViewer = viewer.value; if (currentViewer && !currentViewer.isDestroyed()) currentViewer.scene.verticalExaggeration = store.terrainExaggeration },
    setTerrainLighting: (value: boolean) => {
      store.setTerrainLighting(value)
      const currentViewer = viewer.value
      if (currentViewer && !currentViewer.isDestroyed()) currentViewer.scene.globe.enableLighting = value || solarStore.active
      if (polarCaps) polarCaps.appearance = new Cesium.PerInstanceColorAppearance({ flat: !(value || solarStore.active), translucent: false })
    }
  }
}
