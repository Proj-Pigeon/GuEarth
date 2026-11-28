import { captureError, captureWarning } from '@renderer/lib/crashReporter'
import { useFailureStore } from '@renderer/stores/failure'
import { useGlobeStore, providerCatalog, terrainCatalog } from '@renderer/stores/globe'
import type { ProviderMeta } from '@renderer/stores/globe'
import { useSolarStore } from '@renderer/stores/solar'
import { terrainProviderFactory, terrainRegistry } from '@renderer/terrain/terrainRegistry'
import * as Cesium from 'cesium'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  advanceBufferGap,
  backingStoreSize,
  BUFFER_MISSING_REPORT_MS,
  classifyRenderFault,
  contextOptionsForAttempt,
  decideRenderFrame,
  glRendererName,
  isWebGlInitializationError,
  nudgedCanvasSize,
  RENDER_HALTED_DETAIL,
  RENDER_HALTED_MESSAGE,
  shouldStopRenderLoop,
  shouldUseSoftwareMsaaWorkaround,
  surfaceFailureCopy,
  WEBGL_CONTEXT_ATTEMPTS,
  WEBGL_RETRY_STAGE,
  WEBGL_UNAVAILABLE_DETAIL,
  WEBGL_UNAVAILABLE_MESSAGE,
  webGlRetryDelayMs
} from '../../../common/globeSurface'
import type {
  BufferGapState,
  GlRendererSource,
  SurfaceFrameKind,
  SurfaceSize,
  WebGlContextAttempt
} from '../../../common/globeSurface'
import { logger, stringifyLogValue } from '../../../common/logger'
import { performanceBudget } from '../../../common/performanceBudget'
import {
  DEFAULT_MIRROR_ENDPOINT,
  isLikelyMainlandChinaEnv,
  mirrorEligibleProviders
} from '../../../common/tileMirror'
import type { MirrorEndpointId } from '../../../common/tileMirror'
import type { PlaceSuggestion, TileMirrorStatus } from '../../../preload'
import { flightArrivalAllowed, flightPointerIsSteering } from '../lib/flightFraming'
import { createBasemapImageryProvider } from './basemapImagery'
import { createPolarCaps } from './polarCaps'
import { resolveFlightDestination } from './terrainFlight'
import { cancelTransectFlight } from './useTransectFlight'

interface LayerProvider {
  meta: ProviderMeta
  createImageryProvider: (styleId: string) => Promise<Cesium.ImageryProvider>
}

const providerMeta = (id: string): ProviderMeta =>
  providerCatalog.find(provider => provider.id === id) ?? providerCatalog[0]

const layerRegistry: Record<string, LayerProvider> = {
  osm: {
    meta: providerMeta('osm'),
    createImageryProvider: async styleId => createBasemapImageryProvider('osm', styleId)
  },
  'esri-imagery': {
    meta: providerMeta('esri-imagery'),
    createImageryProvider: async styleId => createBasemapImageryProvider('esri-imagery', styleId)
  },
  opentopomap: {
    meta: providerMeta('opentopomap'),
    createImageryProvider: async styleId => createBasemapImageryProvider('opentopomap', styleId)
  },
  baidu: {
    meta: providerMeta('baidu'),
    createImageryProvider: async styleId => createBasemapImageryProvider('baidu', styleId)
  },
  'viirs-night': {
    meta: providerMeta('viirs-night'),
    createImageryProvider: async styleId => createBasemapImageryProvider('viirs-night', styleId)
  }
}

const terrainName = (id: string): string =>
  terrainCatalog.find(terrain => terrain.id === id)?.name ?? id
const providerName = (id: string): string => layerRegistry[id]?.meta.name ?? id

const GLOBE_LOAD_TIMEOUT_MS = 20_000
const TILE_RECOVERY_GRACE_MS = 3000
const TERRAIN_RESOLVE_BUDGET_MS = 10_000

type LayerLoadResult =
  | { ok: true }
  | {
      ok: false
      reason: 'key' | 'create' | 'cancelled' | 'inflight'
      message: string
      detail: string
    }

const DEPTH_TEST_FREE_HEIGHT_FACTOR = 1.3
const MIN_DEPTH_TEST_FREE_DISTANCE = 10_000
const MAX_DEPTH_TEST_FREE_DISTANCE = 8_000_000
const COARSE_DEPTH_TEST_DISTANCE = 100_000_000
const COLLECTION_STAMP_INTERVAL_MS = 2000

function normalizeHeading(radians: number): number {
  const degrees = Cesium.Math.toDegrees(radians) % 360
  return degrees < 0 ? degrees + 360 : degrees
}

function mirrorRouteSignature(
  mirroredProviders: readonly string[],
  activeEndpoint: MirrorEndpointId
): string {
  const providers = [...mirroredProviders].sort().join(',')
  return providers ? `${activeEndpoint}:${providers}` : ''
}

export interface UseCesiumViewerResult {
  viewer: Cesium.Viewer | undefined
  switchBasemap: (id: string) => void
  setProviderStyle: (id: string, styleId: string) => void
  setLayerOpacity: (id: string, opacity: number) => void
  flyTo: (longitude: number, latitude: number, height: number) => Promise<number | undefined>
  flyToPlace: (place: PlaceSuggestion) => void
  toggleLevelView: () => void
  setTerrain: (id: string) => void
  setTerrainExaggeration: (value: number) => void
  setTerrainLighting: (value: boolean) => void
}

function createCesiumViewerController(
  containerRef: RefObject<HTMLDivElement | null>,
  viewerRef: RefObject<Cesium.Viewer | undefined>,
  setCurrentViewer: (next: Cesium.Viewer | undefined) => void
) {
  const imageryLayers = new Map<string, Cesium.ImageryLayer>()
  const imageryLayerStyles = new Map<string, string>()
  const styleRequestSequences = new Map<string, number>()
  const layersInFlight = new Set<string>()
  let generation = 0
  let flightRequestSequence = 0
  let terrainRequestSeq = 0
  let terrainRequestInFlight = false
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
  let lastMirrorRouteSignature: string | undefined
  let terrainMirrorState: 'off' | MirrorEndpointId | undefined
  let bootstrapGeneration = 0
  let renderLoopGeneration = 0
  let renderLoopRunning = false
  let renderLoopDetach: (() => void) | undefined
  let renderRequested = true
  let pointerActive = false
  let settleFrames = 24
  let renderViewReady = false
  let defaultMsaaSamples = 1
  let softwareRenderHinted = false
  const renderViewScratch = new Cesium.Matrix4()
  const renderRequestBound = new WeakSet<Cesium.Scene>()
  let renderHalted = false
  let webglContextLost = false
  let surfaceRecoveryAttempted = false
  let consecutiveRenderFaults = 0
  let stuckSurfaceReported = false
  let lastRecoverableRenderLogAt = 0
  let contextRecoveryDetach: (() => void) | undefined
  const bufferGap: BufferGapState = { since: 0, reported: false }

  function updatePolarCapsVisibility(): void {
    if (polarCaps && viewerRef.current) {
      polarCaps.show = viewerRef.current.scene.mode === Cesium.SceneMode.SCENE3D
    }
  }

  function updateDepthTestDistance(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const height = currentViewer.camera.positionCartographic.height
    const distance = Math.min(
      Math.max(height * DEPTH_TEST_FREE_HEIGHT_FACTOR, MIN_DEPTH_TEST_FREE_DISTANCE),
      MAX_DEPTH_TEST_FREE_DISTANCE
    )
    currentViewer.scene.minimumDisableDepthTestDistance = distance
  }

  const coarseStampedCollections = new WeakSet()
  const dataSourceDetachers = new Map<Cesium.DataSource, () => void>()
  let defaultEntitiesDetacher: (() => void) | undefined
  let lastCollectionStampAt = 0

  function applyCoarseDepthTestDistance(collection: unknown): void {
    if (!collection || coarseStampedCollections.has(collection)) {
      return
    }
    coarseStampedCollections.add(collection)
    ;(collection as { coarseDepthTestDistance: number }).coarseDepthTestDistance =
      COARSE_DEPTH_TEST_DISTANCE
  }

  function stampEntityClusterDepthRanges(cluster: Cesium.EntityCluster): void {
    const slots = cluster as unknown as Record<string, unknown>
    applyCoarseDepthTestDistance(slots._labelCollection)
    applyCoarseDepthTestDistance(slots._billboardCollection)
    applyCoarseDepthTestDistance(slots._clusterLabelCollection)
    applyCoarseDepthTestDistance(slots._clusterBillboardCollection)
  }

  function stampCoarseDepthTestDistance(
    primitives: Cesium.PrimitiveCollection,
    visited: Set<object>
  ): void {
    for (let index = 0; index < primitives.length; index += 1) {
      const primitive = primitives.get(index)
      if (!primitive || visited.has(primitive)) {
        continue
      }
      visited.add(primitive)
      if (primitive instanceof Cesium.PrimitiveCollection) {
        stampCoarseDepthTestDistance(primitive, visited)
        continue
      }
      if (primitive instanceof Cesium.EntityCluster) {
        stampEntityClusterDepthRanges(primitive)
        continue
      }
      if (
        primitive instanceof Cesium.LabelCollection ||
        primitive instanceof Cesium.BillboardCollection
      ) {
        applyCoarseDepthTestDistance(primitive)
      }
    }
  }

  function updateCollectionDepthTestDistances(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const now = performance.now()
    if (now - lastCollectionStampAt < COLLECTION_STAMP_INTERVAL_MS) {
      return
    }
    lastCollectionStampAt = now
    stampCoarseDepthTestDistance(currentViewer.scene.primitives, new Set())
  }

  const horizonWrappedGraphics = new WeakSet()
  interface EllipsoidalOccluderLike {
    cameraPosition: Cesium.Cartesian3
    isPointVisible: (point: Cesium.Cartesian3) => boolean
  }
  const createEllipsoidalOccluder = Cesium as unknown as {
    EllipsoidalOccluder: new (
      ellipsoid: Cesium.Ellipsoid,
      position: Cesium.Cartesian3
    ) => EllipsoidalOccluderLike
  }
  const horizonOccluder = new createEllipsoidalOccluder.EllipsoidalOccluder(
    Cesium.Ellipsoid.WGS84,
    Cesium.Cartesian3.ZERO
  )
  const horizonScratchPosition = new Cesium.Cartesian3()

  function wrapGraphicsShowForHorizon(
    graphics: { show?: Cesium.Property },
    entity: Cesium.Entity
  ): void {
    if (!entity.position || horizonWrappedGraphics.has(graphics)) {
      return
    }
    horizonWrappedGraphics.add(graphics)
    const original = graphics.show
    graphics.show = new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
      if (original && !original.getValue(time)) {
        return false
      }
      const currentViewer = viewerRef.current
      if (
        !currentViewer ||
        currentViewer.isDestroyed() ||
        currentViewer.scene.mode !== Cesium.SceneMode.SCENE3D
      ) {
        return true
      }
      const point = entity.position?.getValue(time, horizonScratchPosition)
      if (!point) {
        return true
      }
      return horizonOccluder.isPointVisible(point)
    }, false)
  }

  function updateHorizonCamera(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    horizonOccluder.cameraPosition = currentViewer.camera.positionWC
  }

  function wrapEntityGraphics(entity: Cesium.Entity): void {
    if (entity.label) {
      wrapGraphicsShowForHorizon(entity.label, entity)
    }
    if (entity.point) {
      wrapGraphicsShowForHorizon(entity.point, entity)
    }
  }

  function trackEntityCollection(entities: Cesium.EntityCollection): () => void {
    const listener = (_collection: Cesium.EntityCollection, added: Cesium.Entity[]): void => {
      for (const entity of added) {
        wrapEntityGraphics(entity)
      }
    }
    entities.collectionChanged.addEventListener(listener)
    for (const entity of entities.values) {
      wrapEntityGraphics(entity)
    }
    return () => {
      entities.collectionChanged.removeEventListener(listener)
    }
  }

  function handleDataSourceAdded(
    _collection: Cesium.DataSourceCollection,
    dataSource: Cesium.DataSource
  ): void {
    dataSourceDetachers.set(dataSource, trackEntityCollection(dataSource.entities))
  }

  function handleDataSourceRemoved(
    _collection: Cesium.DataSourceCollection,
    dataSource: Cesium.DataSource
  ): void {
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
    for (const detach of dataSourceDetachers.values()) {
      detach()
    }
    dataSourceDetachers.clear()
  }

  function applyTerrain(terrain: Cesium.TerrainProvider): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    flightRequestSequence += 1
    if (currentViewer.terrainProvider !== terrain) {
      cancelTransectFlight()
    }
    currentViewer.terrainProvider = terrain
    currentViewer.scene.requestRender()
    if (polarCaps) {
      currentViewer.scene.primitives.remove(polarCaps)
    }
    polarCaps = createPolarCaps(terrain)
    if (polarCaps) {
      polarCaps.appearance = new Cesium.PerInstanceColorAppearance({
        flat: !(useGlobeStore.getState().terrainLighting || useSolarStore.getState().active),
        translucent: false
      })
      currentViewer.scene.primitives.add(polarCaps)
      updatePolarCapsVisibility()
    }
  }

  function updateCameraState(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const camera = currentViewer.camera
    const cartographic = camera.positionCartographic
    useGlobeStore.getState().setCameraReadout({
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
      heading: normalizeHeading(camera.heading),
      pitch: Cesium.Math.toDegrees(camera.pitch)
    })
  }

  function layerMeta(id: string) {
    return useGlobeStore.getState().layers.find(layer => layer.id === id)
  }

  function handleTileError(id: string, name: string, error: unknown): void {
    if (id !== useGlobeStore.getState().selectedLayerId) {
      return
    }
    lastTileErrorAt = Date.now()
    const detail =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : `${name}瓦片请求失败`
    if (Date.now() - lastTileErrorLoggedAt > 5000) {
      lastTileErrorLoggedAt = Date.now()
      logger.warn('basemap', `${name}瓦片加载失败`, detail)
    }
    useGlobeStore.getState().setGlobeError('地图加载失败，暂显示已缓存画面', detail)
  }

  async function addLayer(id: string, expectedGeneration: number): Promise<LayerLoadResult> {
    const provider = layerRegistry[id]
    if (!viewerRef.current || !provider) {
      return { ok: false, reason: 'cancelled', message: '', detail: '' }
    }
    if (imageryLayers.has(id)) {
      return { ok: true }
    }
    if (layersInFlight.has(id)) {
      return { ok: false, reason: 'inflight', message: '', detail: '' }
    }
    if (
      provider.meta.requiresKey &&
      !useGlobeStore.getState().providerCredentials[id]?.configured
    ) {
      return {
        ok: false,
        reason: 'key',
        message: `${provider.meta.name}需要配置密钥`,
        detail: '请在「设置 → 地图」中配置密钥后重试'
      }
    }
    layersInFlight.add(id)
    try {
      const styleId = useGlobeStore.getState().providerStyles[id] ?? provider.meta.defaultStyleId
      const imageryProvider = await provider.createImageryProvider(styleId)
      imageryProvider.errorEvent.addEventListener(error =>
        handleTileError(id, provider.meta.name, error)
      )
      const currentViewer = viewerRef.current
      if (!currentViewer || currentViewer.isDestroyed() || expectedGeneration !== generation) {
        return { ok: false, reason: 'cancelled', message: '', detail: '' }
      }
      const layer = currentViewer.imageryLayers.addImageryProvider(imageryProvider)
      layer.show = id === useGlobeStore.getState().selectedLayerId
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
    imageryLayers.forEach((layer, layerId) => {
      layer.show = layerId === id
    })
    activeBasemapId = id
    useFailureStore.getState().clearFailure('basemap')
    evaluateGlobeReady()
  }

  function retireImageryLayer(layer: Cesium.ImageryLayer): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      layer.destroy()
      return
    }
    currentViewer.imageryLayers.remove(layer, false)
    window.setTimeout(() => {
      if (!layer.isDestroyed()) {
        layer.destroy()
      }
    }, 1000)
  }

  function switchBasemap(id: string): void {
    const provider = layerRegistry[id]
    if (!provider || !viewerRef.current || viewerRef.current.isDestroyed()) {
      return
    }
    const previousId = activeBasemapId
    useGlobeStore.getState().selectBasemap(id)
    if (imageryLayers.has(id)) {
      revealBasemap(id)
      return
    }
    void addLayer(id, generation).then(result => {
      if (useGlobeStore.getState().selectedLayerId !== id) {
        return
      }
      if (result.ok) {
        revealBasemap(id)
        return
      }
      if (result.reason === 'cancelled' || result.reason === 'inflight') {
        return
      }
      if (previousId && previousId !== id && imageryLayers.has(previousId)) {
        useGlobeStore.getState().selectBasemap(previousId)
        revealBasemap(previousId)
        useFailureStore
          .getState()
          .reportDegrade(`${result.message}，已回到 ${providerName(previousId)}`)
        return
      }
      useGlobeStore.getState().setGlobeError(result.message, result.detail)
    })
  }

  function setProviderStyle(id: string, styleId: string): void {
    const provider = layerRegistry[id]
    if (!provider || !provider.meta.styles.some(style => style.id === styleId)) {
      return
    }
    const previousStyleId =
      useGlobeStore.getState().providerStyles[id] ?? provider.meta.defaultStyleId
    if (previousStyleId === styleId) {
      return
    }
    useGlobeStore.getState().setProviderStyle(id, styleId)
    const layer = imageryLayers.get(id)
    if (!layer || !viewerRef.current || viewerRef.current.isDestroyed()) {
      return
    }
    const requestSequence = (styleRequestSequences.get(id) ?? 0) + 1
    styleRequestSequences.set(id, requestSequence)
    const activeStyleId = imageryLayerStyles.get(id) ?? previousStyleId
    void provider
      .createImageryProvider(styleId)
      .then(imageryProvider => {
        if (styleRequestSequences.get(id) !== requestSequence) {
          return
        }
        const currentViewer = viewerRef.current
        if (!currentViewer || currentViewer.isDestroyed() || layer.isDestroyed()) {
          return
        }
        imageryProvider.errorEvent.addEventListener(error =>
          handleTileError(id, provider.meta.name, error)
        )
        const replacement = currentViewer.imageryLayers.addImageryProvider(imageryProvider)
        replacement.show = false
        replacement.alpha = layer.alpha
        imageryLayers.set(id, replacement)
        imageryLayerStyles.set(id, styleId)
        if (id === useGlobeStore.getState().selectedLayerId) {
          revealBasemap(id)
        }
        retireImageryLayer(layer)
      })
      .catch((error: unknown) => {
        if (styleRequestSequences.get(id) !== requestSequence) {
          return
        }
        useGlobeStore.getState().setProviderStyle(id, activeStyleId)
        layer.show = id === useGlobeStore.getState().selectedLayerId
        useGlobeStore
          .getState()
          .setGlobeError(
            `${provider.meta.name}样式切换失败`,
            error instanceof Error ? error.message : ''
          )
      })
  }

  async function setTerrain(id: string, expectedGeneration: number): Promise<void> {
    terrainMirrorState =
      id === 'arcgis-terrain'
        ? useGlobeStore.getState().tileMirrorMode === 'on'
          ? useGlobeStore.getState().activeMirrorEndpoint
          : 'off'
        : undefined
    const create = terrainProviderFactory(id)
    terrainRequestSeq += 1
    const requestSeq = terrainRequestSeq
    terrainRequestInFlight = true
    try {
      const terrain = await create()
      if (
        !viewerRef.current ||
        viewerRef.current.isDestroyed() ||
        expectedGeneration !== generation ||
        requestSeq !== terrainRequestSeq
      ) {
        return
      }
      applyTerrain(terrain)
      useGlobeStore.getState().setActiveTerrainId(id)
      useGlobeStore.getState().setTerrainError('')
      if (id === 'ellipsoid') {
        markEllipsoidTerrainReady()
      }
    } catch (error) {
      if (requestSeq !== terrainRequestSeq) {
        return
      }
      const detail = error instanceof Error ? error.message : ''
      logger.warn('terrain', `${terrainName(id)}不可用`, detail)
      if (id === 'ellipsoid') {
        useGlobeStore.getState().setTerrainError('地形加载失败', detail)
        return
      }
      const fallback = await terrainRegistry.ellipsoid()
      if (
        !viewerRef.current ||
        viewerRef.current.isDestroyed() ||
        expectedGeneration !== generation ||
        requestSeq !== terrainRequestSeq
      ) {
        return
      }
      applyTerrain(fallback)
      useGlobeStore.getState().setTerrainError('')
      useGlobeStore.getState().setActiveTerrainId('ellipsoid')
      markEllipsoidTerrainReady()
      useFailureStore.getState().reportDegrade(`${terrainName(id)}加载失败，已切换为平滑球面`)
    } finally {
      if (requestSeq === terrainRequestSeq) {
        terrainRequestInFlight = false
      }
    }
  }

  function clearLoadTimeout(): void {
    if (loadTimeoutTimer !== undefined) {
      window.clearTimeout(loadTimeoutTimer)
      loadTimeoutTimer = undefined
    }
    useGlobeStore.getState().setGlobeLoadTimedOut(false)
  }

  const TERRAIN_READY_STATE = 6

  function hasVisibleGlobeSurface(currentViewer: Cesium.Viewer): boolean {
    const canvas = currentViewer.scene.canvas
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) {
      return false
    }
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
    const ray = currentViewer.camera.getPickRay(center)
    if (!ray) {
      return false
    }
    try {
      return currentViewer.scene.globe.pick(ray, currentViewer.scene) !== undefined
    } catch {
      return false
    }
  }

  function hasRenderedInitialSurface(currentViewer: Cesium.Viewer): {
    terrain: boolean
    imagery: boolean
  } {
    if (!hasVisibleGlobeSurface(currentViewer)) {
      return { terrain: false, imagery: false }
    }
    const activeLayer = imageryLayers.get(useGlobeStore.getState().selectedLayerId)
    const fallback = (): { terrain: boolean; imagery: boolean } => ({
      terrain: currentViewer.scene.globe.tilesLoaded,
      imagery:
        currentViewer.scene.globe.tilesLoaded &&
        Boolean(activeLayer && !activeLayer.isDestroyed() && activeLayer.show && activeLayer.ready)
    })
    try {
      const surface = (
        currentViewer.scene.globe as unknown as {
          _surface?: {
            _tilesToRender?: {
              data?: {
                renderedMesh?: unknown
                terrainState?: number
                imagery?: {
                  useWebMercatorT?: boolean
                  readyImagery?: {
                    imageryLayer?: Cesium.ImageryLayer
                    texture?: unknown
                    textureWebMercator?: unknown
                  }
                }[]
              }
            }[]
          }
        }
      )._surface
      const tiles = surface?._tilesToRender
      if (!Array.isArray(tiles)) {
        return fallback()
      }
      let terrain = false
      let imagery = false
      for (const tile of tiles) {
        const data = tile?.data
        if (!data?.renderedMesh || data.terrainState !== TERRAIN_READY_STATE) {
          continue
        }
        terrain = true
        if (
          activeLayer?.show &&
          Array.isArray(data.imagery) &&
          data.imagery.some(
            item =>
              item?.readyImagery?.imageryLayer === activeLayer &&
              Boolean(
                item.useWebMercatorT
                  ? item.readyImagery.textureWebMercator
                  : item.readyImagery.texture
              )
          )
        ) {
          imagery = true
        }
        if (terrain && imagery) {
          break
        }
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
        if (!initialTerrainReady) {
          return
        }
        if (rendered.imagery) {
          initialImageryReady = true
        }
        if (initialImageryReady) {
          detachInitialSurfaceTracking(currentViewer)
          evaluateGlobeReady()
          return
        }
      } else {
        if (rendered.terrain) {
          initialTerrainReady = true
        }
        if (rendered.imagery) {
          initialImageryReady = true
        }
        if (initialTerrainReady && initialImageryReady) {
          detachInitialSurfaceTracking(currentViewer)
          evaluateGlobeReady()
          return
        }
      }
      if (initialSurfaceCheckTimer === undefined) {
        initialSurfaceCheckTimer = window.setTimeout(() => {
          initialSurfaceCheckTimer = undefined
          if (!currentViewer.isDestroyed()) {
            currentViewer.scene.requestRender()
          }
        }, 250)
      }
    }
    initialSurfaceRenderListener = listener
    currentViewer.scene.postRender.addEventListener(listener)
    currentViewer.scene.requestRender()
  }

  function evaluateGlobeReady(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    if (useGlobeStore.getState().isGlobeReady) {
      return
    }
    if (!initialTerrainReady || !initialImageryReady || !currentViewer.scene.globe.show) {
      return
    }
    if (imageryLayers.size === 0) {
      return
    }
    clearLoadTimeout()
    useGlobeStore.getState().setGlobeReady(true)
  }

  function markEllipsoidTerrainReady(): void {
    initialTerrainReady = true
    evaluateGlobeReady()
  }

  function resolvedTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }

  function shouldDeferInitialTerrainForConsent(id: string): boolean {
    if (id !== 'arcgis-terrain' || useGlobeStore.getState().mirrorConsentPrompted) {
      return false
    }
    return (
      useGlobeStore.getState().mirrorConsentOpen ||
      isLikelyMainlandChinaEnv(navigator.language, resolvedTimeZone())
    )
  }

  async function resolveInitialTerrain(
    id: string
  ): Promise<{ provider: Cesium.TerrainProvider; id: string; deferred?: boolean }> {
    terrainMirrorState =
      id === 'arcgis-terrain'
        ? useGlobeStore.getState().tileMirrorMode === 'on'
          ? useGlobeStore.getState().activeMirrorEndpoint
          : 'off'
        : undefined
    if (shouldDeferInitialTerrainForConsent(id)) {
      return { provider: await terrainRegistry.ellipsoid(), id: 'ellipsoid', deferred: true }
    }
    const create = terrainProviderFactory(id)
    let settled = false
    const timeout = new Promise<{ provider: Cesium.TerrainProvider; id: string }>(resolve => {
      window.setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        logger.warn('terrain', `${terrainName(id)}加载超时，已降级为平滑球面`)
        useFailureStore.getState().reportDegrade(`${terrainName(id)}加载超时，已切换为平滑球面`)
        void terrainRegistry.ellipsoid().then(provider => resolve({ provider, id: 'ellipsoid' }))
      }, TERRAIN_RESOLVE_BUDGET_MS)
    })
    try {
      const attempt = create().then(provider => ({ provider, id }))
      const resolved = await Promise.race([attempt, timeout])
      settled = true
      return resolved
    } catch (error) {
      settled = true
      logger.warn('terrain', `${terrainName(id)}不可用，已降级为平滑球面`, error)
      useFailureStore.getState().reportDegrade(`${terrainName(id)}不可用，已切换为平滑球面`)
      return { provider: await terrainRegistry.ellipsoid(), id: 'ellipsoid' }
    }
  }

  function startLoadTimeout(): void {
    clearLoadTimeout()
    loadTimeoutTimer = window.setTimeout(() => {
      loadTimeoutTimer = undefined
      evaluateGlobeReady()
      if (useGlobeStore.getState().isGlobeReady) {
        return
      }
      logger.warn(
        'globe',
        `地球加载超时（${GLOBE_LOAD_TIMEOUT_MS / 1000} 秒未就绪）`,
        `stage=${useGlobeStore.getState().globeLoadStage}`
      )
      if (!loadTimeoutReported) {
        loadTimeoutReported = true
        captureWarning('globe-load', `地球加载超时（${GLOBE_LOAD_TIMEOUT_MS / 1000} 秒未就绪）`, {
          stage: useGlobeStore.getState().globeLoadStage
        })
      }
      useGlobeStore.getState().setGlobeLoadTimedOut(true)
    }, GLOBE_LOAD_TIMEOUT_MS)
  }

  function readWidgetSurface(widget: Cesium.CesiumWidget): SurfaceSize {
    return {
      clientWidth: widget.canvas.clientWidth,
      clientHeight: widget.canvas.clientHeight,
      drawingBufferWidth: widget.scene.drawingBufferWidth,
      drawingBufferHeight: widget.scene.drawingBufferHeight
    }
  }

  function canvasRendererName(canvas: HTMLCanvasElement): string {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) {
      return ''
    }
    const source: GlRendererSource = {
      RENDERER: gl.RENDERER,
      getExtension: name => gl.getExtension(name) as { UNMASKED_RENDERER_WEBGL: number } | null,
      getParameter: parameter => gl.getParameter(parameter)
    }
    return glRendererName(source)
  }

  function canvasContextLost(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return Boolean(gl?.isContextLost())
  }

  function forceWidgetResize(widget: Cesium.CesiumWidget): void {
    const canvas = widget.canvas
    const pixelRatio = widget.useBrowserRecommendedResolution ? 1 : window.devicePixelRatio
    const target = backingStoreSize(
      canvas.clientWidth,
      canvas.clientHeight,
      pixelRatio,
      widget.resolutionScale
    )
    if (target.width < 1 || target.height < 1) {
      return
    }
    const nudged = nudgedCanvasSize(canvas.width, canvas.height, target.width, target.height)
    if (nudged.width !== canvas.width || nudged.height !== canvas.height) {
      canvas.width = nudged.width
      canvas.height = nudged.height
    }
    ;(widget as Cesium.CesiumWidget & { _forceResize: boolean })._forceResize = true
    try {
      widget.resize()
    } catch (error) {
      logger.warn('globe', '重新匹配画布尺寸失败', error)
    }
  }

  function reportSurfaceFailure(
    message: string,
    detail: string,
    error: unknown,
    scope: 'globe-render' | 'globe-init',
    sentry = true
  ): void {
    useFailureStore.getState().reportFailure({ scope: 'webgl', message, detail, retryable: true })
    if (!sentry) {
      return
    }
    captureError(scope, error instanceof Error ? error : new Error(stringifyLogValue(error)), {
      surfaceNotified: true,
      stage: useGlobeStore.getState().globeLoadStage
    })
  }

  function noteSurfaceFrame(kind: SurfaceFrameKind): void {
    const outcome = advanceBufferGap(bufferGap, kind, Date.now(), BUFFER_MISSING_REPORT_MS)
    if (kind === 'rendered') {
      if (useFailureStore.getState().notices.webgl) {
        useFailureStore.getState().clearFailure('webgl')
      }
      return
    }
    if (outcome !== 'report') {
      return
    }
    const copy = surfaceFailureCopy(webglContextLost)
    if (!stuckSurfaceReported) {
      stuckSurfaceReported = true
      reportSurfaceFailure(
        copy.message,
        copy.detail,
        new Error('WebGL drawing buffer stayed at 0 while the globe view had a layout size'),
        'globe-render'
      )
      return
    }
    useFailureStore.getState().reportFailure({
      scope: 'webgl',
      message: copy.message,
      detail: copy.detail,
      retryable: true
    })
  }

  function stopOwnedRenderLoop(): void {
    renderLoopGeneration += 1
    renderLoopRunning = false
    renderLoopDetach?.()
    renderLoopDetach = undefined
    pointerActive = false
    renderViewReady = false
  }

  function bindSceneRenderRequests(scene: Cesium.Scene): void {
    if (renderRequestBound.has(scene)) {
      return
    }
    renderRequestBound.add(scene)
    const original = scene.requestRender.bind(scene)
    scene.requestRender = () => {
      renderRequested = true
      original()
    }
  }

  function bindCanvasActivity(canvas: HTMLCanvasElement): void {
    renderLoopDetach?.()
    const press = (): void => {
      pointerActive = true
    }
    const release = (): void => {
      pointerActive = false
      settleFrames = Math.max(settleFrames, 24)
    }
    const bump = (): void => {
      settleFrames = Math.max(settleFrames, 24)
    }
    canvas.addEventListener('pointerdown', press)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('wheel', bump, { passive: true })
    canvas.addEventListener('keydown', bump)
    renderLoopDetach = () => {
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerup', release)
      canvas.removeEventListener('pointercancel', release)
      canvas.removeEventListener('wheel', bump)
      canvas.removeEventListener('keydown', bump)
    }
  }

  function shouldDrawFrame(): boolean {
    const requested = renderRequested
    renderRequested = false
    return pointerActive || settleFrames > 0 || requested || !renderViewReady
  }

  function noteCameraMotion(widget: Cesium.CesiumWidget): void {
    const viewMatrix = widget.scene.camera.viewMatrix
    const moved =
      renderViewReady && !Cesium.Matrix4.equalsEpsilon(renderViewScratch, viewMatrix, 1e-7)
    Cesium.Matrix4.clone(viewMatrix, renderViewScratch)
    renderViewReady = true
    if (pointerActive || moved) {
      settleFrames = pointerActive ? 8 : 24
    } else if (settleFrames > 0) {
      settleFrames -= 1
    }
  }

  function startOwnedRenderLoop(widget: Cesium.CesiumWidget): void {
    const runId = ++renderLoopGeneration
    renderLoopRunning = true
    renderRequested = true
    settleFrames = 24
    renderViewReady = false
    bindSceneRenderRequests(widget.scene)
    bindCanvasActivity(widget.canvas)
    let lastClientWidth = -1
    let lastClientHeight = -1
    const frame = (): void => {
      if (runId !== renderLoopGeneration) {
        return
      }
      if (widget.isDestroyed()) {
        renderLoopRunning = false
        return
      }
      if (renderHalted) {
        renderLoopRunning = false
        return
      }
      try {
        if (widget.canvas.clientWidth >= 1 && widget.canvas.clientHeight >= 1) {
          widget.resize()
        }
        const size = readWidgetSurface(widget)
        if (size.clientWidth !== lastClientWidth || size.clientHeight !== lastClientHeight) {
          surfaceRecoveryAttempted = false
          lastClientWidth = size.clientWidth
          lastClientHeight = size.clientHeight
        }
        const decision = decideRenderFrame(size, surfaceRecoveryAttempted)
        if (decision.action === 'render') {
          surfaceRecoveryAttempted = false
          if (shouldDrawFrame()) {
            const faultsBefore = consecutiveRenderFaults
            widget.render()
            if (runId !== renderLoopGeneration || renderHalted) {
              if (runId === renderLoopGeneration) {
                renderLoopRunning = false
              }
              return
            }
            noteCameraMotion(widget)
            if (consecutiveRenderFaults === faultsBefore) {
              consecutiveRenderFaults = 0
              noteSurfaceFrame('rendered')
            }
          } else {
            widget.clock.tick()
            noteSurfaceFrame('rendered')
          }
        } else if (decision.action === 'recover-resize') {
          surfaceRecoveryAttempted = true
          forceWidgetResize(widget)
          const resized = readWidgetSurface(widget)
          if (decideRenderFrame(resized, true).action === 'render') {
            const faultsBefore = consecutiveRenderFaults
            widget.render()
            if (runId !== renderLoopGeneration || renderHalted) {
              if (runId === renderLoopGeneration) {
                renderLoopRunning = false
              }
              return
            }
            if (consecutiveRenderFaults === faultsBefore) {
              consecutiveRenderFaults = 0
              noteSurfaceFrame('rendered')
            }
          } else {
            widget.clock.tick()
            noteSurfaceFrame('buffer-missing')
          }
        } else {
          widget.clock.tick()
          noteSurfaceFrame(decision.reason)
        }
      } catch (error) {
        if (isWebGlInitializationError(error) || classifyRenderFault(error, false) === 'recover') {
          noteSurfaceFrame('buffer-missing')
          if (!widget.isDestroyed()) {
            widget.scene.requestRender()
          }
        } else if (Date.now() - lastRenderErrorAt > 5000) {
          lastRenderErrorAt = Date.now()
          logger.warn('globe', '渲染循环异常', error)
        }
      }
      if (runId !== renderLoopGeneration || renderHalted || widget.isDestroyed()) {
        if (runId === renderLoopGeneration) {
          renderLoopRunning = false
        }
        return
      }
      window.requestAnimationFrame(frame)
    }
    window.requestAnimationFrame(frame)
  }

  function attachContextRecovery(canvas: HTMLCanvasElement): void {
    contextRecoveryDetach?.()
    const onLost = (event: Event): void => {
      event.preventDefault()
      webglContextLost = true
      surfaceRecoveryAttempted = false
      logger.warn('globe', 'WebGL 上下文丢失，等待图形驱动恢复')
    }
    const onRestored = (): void => {
      logger.info('globe', 'WebGL 上下文已恢复，正在重新创建地球')
      void bootstrapViewer()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    contextRecoveryDetach = () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }

  function viewerOptions(attempt: WebGlContextAttempt): Cesium.Viewer.ConstructorOptions {
    const budget = performanceBudget(useGlobeStore.getState().performanceMode)
    const contextAttempt = budget.antialias ? attempt : { ...attempt, antialias: false }
    return {
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
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      useBrowserRecommendedResolution: true,
      useDefaultRenderLoop: false,
      showRenderLoopErrors: false,
      contextOptions: contextOptionsForAttempt(contextAttempt)
    }
  }

  function waitForRetry(delayMs: number, runId: number): Promise<boolean> {
    return new Promise(resolve => {
      window.setTimeout(() => resolve(runId === bootstrapGeneration), delayMs)
    })
  }

  async function createViewerWithRetries(runId: number): Promise<Cesium.Viewer | undefined> {
    let lastError: unknown
    for (let attempt = 0; attempt < WEBGL_CONTEXT_ATTEMPTS.length; attempt += 1) {
      const host = containerRef.current
      if (!host || runId !== bootstrapGeneration) {
        return undefined
      }
      const delayMs = webGlRetryDelayMs(attempt)
      if (delayMs > 0) {
        useGlobeStore.getState().setGlobeLoadStage(WEBGL_RETRY_STAGE)
        const stillCurrent = await waitForRetry(delayMs, runId)
        if (!stillCurrent || containerRef.current !== host) {
          return undefined
        }
      }
      if (runId !== bootstrapGeneration) {
        return undefined
      }
      host.replaceChildren()
      const attemptOptions = WEBGL_CONTEXT_ATTEMPTS[attempt]
      if (!attemptOptions) {
        return undefined
      }
      try {
        const created = new Cesium.Viewer(host, viewerOptions(attemptOptions))
        if (runId !== bootstrapGeneration) {
          created.destroy()
          return undefined
        }
        if (!attemptOptions.preserveDrawingBuffer) {
          logger.warn('globe', '已放宽图形上下文选项以启动地球，截图可能无法保存当前画面')
        }
        const rendererName = canvasRendererName(created.canvas)
        defaultMsaaSamples = created.scene.msaaSamples
        if (shouldUseSoftwareMsaaWorkaround(rendererName)) {
          created.scene.msaaSamples = 1
          logger.info('globe', '检测到软件渲染，已关闭多重采样', rendererName)
          if (!softwareRenderHinted && useGlobeStore.getState().performanceMode !== 'fluent') {
            softwareRenderHinted = true
            useFailureStore
              .getState()
              .reportDegrade('检测到图形性能较弱，可在设置的地图页切换到「流畅优先」')
          }
        }
        return created
      } catch (error) {
        lastError = error
        host.replaceChildren()
        const retryable =
          isWebGlInitializationError(error) && attempt < WEBGL_CONTEXT_ATTEMPTS.length - 1
        if (!retryable) {
          throw error
        }
        logger.warn(
          'globe',
          `WebGL 初始化未成功，正在重试（${attempt + 1}/${WEBGL_CONTEXT_ATTEMPTS.length}）`,
          error
        )
      }
    }
    throw lastError instanceof Error ? lastError : new Error('WebGL 初始化失败')
  }

  function resetSurfaceRecovery(): void {
    renderHalted = false
    surfaceRecoveryAttempted = false
    consecutiveRenderFaults = 0
    stuckSurfaceReported = false
    renderErrorReported = false
    webglContextLost = false
    bufferGap.since = 0
    bufferGap.reported = false
  }

  function destroyActiveViewer(): void {
    generation += 1
    terrainRequestSeq = 0
    terrainRequestInFlight = false
    clearLoadTimeout()
    stopOwnedRenderLoop()
    contextRecoveryDetach?.()
    contextRecoveryDetach = undefined
    detachInitialSurfaceTracking(viewerRef.current)
    initialSurfaceReady = false
    initialTerrainReady = false
    initialImageryReady = false
    initialSurfaceReadyCallback = undefined
    detachTileProgress()
    const currentViewer = viewerRef.current
    setCurrentViewer(undefined)
    selectedPlaceMarker = undefined
    polarCaps = undefined
    imageryLayers.clear()
    imageryLayerStyles.clear()
    styleRequestSequences.clear()
    layersInFlight.clear()
    activeBasemapId = ''
    mirrorListenerDisposer?.()
    mirrorListenerDisposer = undefined
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    currentViewer.camera.moveEnd.removeEventListener(updateCameraState)
    currentViewer.scene.preUpdate.removeEventListener(updatePolarCapsVisibility)
    currentViewer.scene.preUpdate.removeEventListener(updateDepthTestDistance)
    currentViewer.scene.preUpdate.removeEventListener(updateCollectionDepthTestDistances)
    currentViewer.scene.preUpdate.removeEventListener(updateHorizonCamera)
    detachHorizonTracking(currentViewer)
    currentViewer.scene.renderError.removeEventListener(handleSceneRenderError)
    currentViewer.destroy()
  }

  function handleSceneRenderError(_scene: Cesium.Scene, error: unknown): void {
    const current = viewerRef.current
    const lost = Boolean(current && !current.isDestroyed() && canvasContextLost(current.canvas))
    if (lost) {
      webglContextLost = true
    }
    const kind = classifyRenderFault(error, lost)
    if (kind === 'recover') {
      consecutiveRenderFaults += 1
      surfaceRecoveryAttempted = false
      if (current && !current.isDestroyed()) {
        current.scene.requestRender()
      }
      if (!shouldStopRenderLoop(kind, consecutiveRenderFaults)) {
        if (Date.now() - lastRecoverableRenderLogAt > 5000) {
          lastRecoverableRenderLogAt = Date.now()
          logger.warn('globe', '渲染跳过不可用的图形表面', error)
        }
        return
      }
    }
    if (renderHalted) {
      return
    }
    renderHalted = true
    const surfaced = kind === 'recover'
    const copy = surfaceFailureCopy(webglContextLost)
    const sentry = !renderErrorReported
    renderErrorReported = true
    reportSurfaceFailure(
      surfaced ? copy.message : RENDER_HALTED_MESSAGE,
      surfaced ? copy.detail : RENDER_HALTED_DETAIL,
      error,
      'globe-render',
      sentry
    )
  }

  async function bootstrapViewer(): Promise<void> {
    const runId = ++bootstrapGeneration
    destroyActiveViewer()
    if (runId !== bootstrapGeneration) {
      return
    }
    resetSurfaceRecovery()
    const expectedGeneration = generation
    const host = containerRef.current
    if (!host) {
      return
    }
    useGlobeStore.getState().setGlobeLoadStage('正在启动地球…')
    const terrainPromise = resolveInitialTerrain(useGlobeStore.getState().terrainProviderId)
    try {
      const created = await createViewerWithRetries(runId)
      if (!created || runId !== bootstrapGeneration) {
        return
      }
      setCurrentViewer(created)
      const currentViewer = created
      attachContextRecovery(currentViewer.canvas)
      startOwnedRenderLoop(currentViewer.cesiumWidget)
      currentViewer.scene.globe.show = true
      applyPerformanceBudget()
      useGlobeStore.getState().setGlobeLoadStage('正在准备画面…')
      currentViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(105, 35, 15_000_000)
      })
      const initialMode =
        useGlobeStore.getState().sceneMode === '2D'
          ? Cesium.SceneMode.SCENE2D
          : Cesium.SceneMode.SCENE3D
      currentViewer.scene.mode = initialMode
      applyTerrainRendering()
      currentViewer.scene.preUpdate.addEventListener(updatePolarCapsVisibility)
      currentViewer.scene.preUpdate.addEventListener(updateDepthTestDistance)
      currentViewer.scene.preUpdate.addEventListener(updateCollectionDepthTestDistances)
      currentViewer.scene.preUpdate.addEventListener(updateHorizonCamera)
      attachHorizonTracking(currentViewer)
      currentViewer.scene.renderError.addEventListener(handleSceneRenderError)
      currentViewer.camera.moveEnd.addEventListener(updateCameraState)
      mirrorListenerDisposer = window.guEarth.tiles.onMirrorStatus(applyMirrorStatus)
      void window.guEarth.tiles.getMirrorStatus().then(status => {
        if (
          runId !== bootstrapGeneration ||
          !viewerRef.current ||
          viewerRef.current.isDestroyed()
        ) {
          return
        }
        applyMirrorStatus(status)
      })
      updateCameraState()
      let terrainSetup:
        | { provider: Cesium.TerrainProvider; id: string; deferred?: boolean }
        | undefined
      let terrainApplied = false
      const applyInitialTerrain = (): void => {
        if (
          runId !== bootstrapGeneration ||
          !terrainSetup ||
          terrainApplied ||
          terrainRequestSeq !== 0
        ) {
          return
        }
        const activeViewer = viewerRef.current
        if (!activeViewer || activeViewer.isDestroyed() || activeViewer !== currentViewer) {
          return
        }
        terrainApplied = true
        applyTerrain(terrainSetup.provider)
        useGlobeStore.getState().setActiveTerrainId(terrainSetup.id)
        if (terrainSetup.id === 'ellipsoid') {
          markEllipsoidTerrainReady()
        }
        currentViewer.scene.requestRender()
        useGlobeStore
          .getState()
          .setGlobeLoadStage(terrainSetup.id === 'ellipsoid' ? '正在加载地图…' : '正在加载地形…')
        if (
          terrainSetup.deferred &&
          !useGlobeStore.getState().mirrorConsentOpen &&
          useGlobeStore.getState().terrainProviderId === 'arcgis-terrain'
        ) {
          void retryTerrain()
        }
      }
      initialSurfaceReadyCallback = undefined
      attachInitialSurfaceTracking(currentViewer)
      attachTileProgress()
      startLoadTimeout()
      useFailureStore.getState().registerRetry('basemap', retryBasemap)
      useFailureStore.getState().registerRetry('terrain', retryTerrain)
      void terrainPromise.then(resolvedTerrain => {
        if (runId !== bootstrapGeneration) {
          return
        }
        terrainSetup = resolvedTerrain
        applyInitialTerrain()
      })
      const initialLayerId = useGlobeStore.getState().selectedLayerId
      void (async () => {
        const result = await addLayer(initialLayerId, expectedGeneration)
        if (runId !== bootstrapGeneration || expectedGeneration !== generation) {
          return
        }
        if (result.ok) {
          revealBasemap(initialLayerId)
          return
        }
        if (result.reason === 'cancelled' || result.reason === 'inflight') {
          return
        }
        if (initialLayerId !== 'osm') {
          const fallback = await addLayer('osm', expectedGeneration)
          if (runId !== bootstrapGeneration || expectedGeneration !== generation) {
            return
          }
          if (fallback.ok) {
            useGlobeStore.getState().selectBasemap('osm')
            revealBasemap('osm')
            useFailureStore.getState().reportDegrade(`${result.message}，已切换到 OpenStreetMap`)
            return
          }
        }
        useGlobeStore.getState().setGlobeError(result.message, result.detail)
      })()
    } catch (error) {
      if (runId !== bootstrapGeneration) {
        return
      }
      const webglFailed = isWebGlInitializationError(error)
      if (webglFailed) {
        reportSurfaceFailure(
          WEBGL_UNAVAILABLE_MESSAGE,
          WEBGL_UNAVAILABLE_DETAIL,
          error,
          'globe-init'
        )
        useGlobeStore.getState().setGlobeLoadStage('')
        return
      }
      captureError('globe-init', error, { stage: useGlobeStore.getState().globeLoadStage })
      useGlobeStore
        .getState()
        .setGlobeError('地球初始化失败', error instanceof Error ? error.message : '')
    }
  }

  async function retryWebGlSurface(): Promise<void> {
    const halted = renderHalted
    const current = viewerRef.current
    const bufferMissing = Boolean(
      current &&
      !current.isDestroyed() &&
      current.canvas.clientWidth >= 1 &&
      current.canvas.clientHeight >= 1 &&
      (current.scene.drawingBufferWidth < 1 || current.scene.drawingBufferHeight < 1)
    )
    useFailureStore.getState().clearFailure('webgl')
    resetSurfaceRecovery()
    if (current && !current.isDestroyed() && !halted && !bufferMissing) {
      forceWidgetResize(current.cesiumWidget)
      current.scene.requestRender()
      if (!renderLoopRunning) {
        startOwnedRenderLoop(current.cesiumWidget)
      }
      return
    }
    await bootstrapViewer()
  }

  function detachTileProgress(): void {
    const currentViewer = viewerRef.current
    if (tileProgressListener && currentViewer && !currentViewer.isDestroyed()) {
      currentViewer.scene.globe.tileLoadProgressEvent.removeEventListener(tileProgressListener)
    }
    tileProgressListener = undefined
  }

  function attachTileProgress(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    detachTileProgress()
    const listener = (pending: number): void => {
      if (pending > 0) {
        return
      }
      if (!useGlobeStore.getState().isGlobeReady) {
        evaluateGlobeReady()
        return
      }
      if (lastTileErrorAt && Date.now() - lastTileErrorAt > TILE_RECOVERY_GRACE_MS) {
        lastTileErrorAt = 0
        useGlobeStore.getState().setGlobeError('')
      }
    }
    tileProgressListener = listener
    currentViewer.scene.globe.tileLoadProgressEvent.addEventListener(listener)
  }

  async function retryBasemap(): Promise<void> {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const expectedGeneration = generation
    const id = useGlobeStore.getState().selectedLayerId
    useGlobeStore.getState().setGlobeError('')
    useGlobeStore.getState().setGlobeLoadStage('正在重新加载地图…')
    startLoadTimeout()
    if (
      mirrorEligibleProviders[id] &&
      typeof window.guEarth?.tiles?.resetMirrorFallback === 'function'
    ) {
      try {
        const status = await window.guEarth.tiles.resetMirrorFallback(id, false)
        useGlobeStore.getState().applyTileMirrorStatus(status)
        lastMirrorRouteSignature = mirrorRouteSignature(
          status.mirroredProviders,
          status.activeEndpoint ?? useGlobeStore.getState().activeMirrorEndpoint
        )
      } catch {
        void 0
      }
    }
    if (
      viewerRef.current !== currentViewer ||
      currentViewer.isDestroyed() ||
      generation !== expectedGeneration ||
      useGlobeStore.getState().selectedLayerId !== id
    ) {
      return
    }
    const existing = imageryLayers.get(id)
    if (existing) {
      retireImageryLayer(existing)
      imageryLayers.delete(id)
    }
    const result = await addLayer(id, expectedGeneration)
    if (
      viewerRef.current !== currentViewer ||
      currentViewer.isDestroyed() ||
      generation !== expectedGeneration ||
      useGlobeStore.getState().selectedLayerId !== id
    ) {
      return
    }
    if (result.ok) {
      revealBasemap(id)
      return
    }
    if (result.reason === 'cancelled' || result.reason === 'inflight') {
      return
    }
    useGlobeStore.getState().setGlobeError(result.message, result.detail)
  }

  async function retryTerrain(): Promise<void> {
    useGlobeStore.getState().setTerrainError('')
    await setTerrain(useGlobeStore.getState().terrainProviderId, generation)
  }

  function reloadMirrorBasemapLayers(): void {
    for (const id of Object.keys(mirrorEligibleProviders)) {
      const layer = imageryLayers.get(id)
      if (!layer) {
        continue
      }
      imageryLayers.delete(id)
      retireImageryLayer(layer)
    }
    const id = useGlobeStore.getState().selectedLayerId
    if (!mirrorEligibleProviders[id]) {
      return
    }
    void addLayer(id, generation).then(result => {
      if (result.ok) {
        if (useGlobeStore.getState().selectedLayerId === id) {
          revealBasemap(id)
        }
        return
      }
      if (result.reason === 'cancelled' || result.reason === 'inflight') {
        return
      }
      useGlobeStore.getState().setGlobeError(result.message, result.detail)
    })
  }

  function applyMirrorStatus(status: TileMirrorStatus): void {
    useGlobeStore.getState().applyTileMirrorStatus(status)
    const activeEndpoint =
      status.activeEndpoint ??
      useGlobeStore.getState().activeMirrorEndpoint ??
      DEFAULT_MIRROR_ENDPOINT
    const signature = mirrorRouteSignature(status.mirroredProviders, activeEndpoint)
    const nextTerrainMirrorState: 'off' | MirrorEndpointId =
      status.mode === 'on' ? activeEndpoint : 'off'
    const routeChanged =
      lastMirrorRouteSignature !== undefined && lastMirrorRouteSignature !== signature
    const initialTerrainMirrorMismatch =
      lastMirrorRouteSignature === undefined &&
      useGlobeStore.getState().terrainProviderId === 'arcgis-terrain' &&
      terrainMirrorState !== undefined &&
      terrainMirrorState !== nextTerrainMirrorState
    const terrainMatchesNextState =
      terrainMirrorState === nextTerrainMirrorState &&
      (useGlobeStore.getState().activeTerrainId === 'arcgis-terrain' || terrainRequestInFlight)
    if (routeChanged) {
      reloadMirrorBasemapLayers()
      if (
        useGlobeStore.getState().terrainProviderId === 'arcgis-terrain' &&
        !terrainMatchesNextState
      ) {
        void retryTerrain()
      }
    } else if (initialTerrainMirrorMismatch && !terrainMatchesNextState) {
      void retryTerrain()
    }
    lastMirrorRouteSignature = signature
    if (status.notice) {
      useFailureStore.getState().reportDegrade(status.notice)
    }
  }

  function applyPerformanceBudget(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const budget = performanceBudget(useGlobeStore.getState().performanceMode)
    const software = shouldUseSoftwareMsaaWorkaround(canvasRendererName(currentViewer.canvas))
    currentViewer.resolutionScale = budget.resolutionScale
    currentViewer.scene.globe.maximumScreenSpaceError = budget.screenSpaceError
    currentViewer.scene.globe.tileCacheSize = budget.tileCacheSize
    currentViewer.scene.globe.depthTestAgainstTerrain = budget.depthTestAgainstTerrain
    currentViewer.scene.msaaSamples = software ? 1 : (budget.msaaSamples ?? defaultMsaaSamples)
    currentViewer.scene.requestRender()
  }

  function applyTerrainRendering(): void {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const store = useGlobeStore.getState()
    const solarStore = useSolarStore.getState()
    const budget = performanceBudget(store.performanceMode)
    currentViewer.scene.verticalExaggeration = store.terrainExaggeration
    currentViewer.scene.globe.enableLighting = store.terrainLighting || solarStore.active
    currentViewer.scene.globe.depthTestAgainstTerrain = budget.depthTestAgainstTerrain
    currentViewer.scene.requestRender()
  }

  function toggleLevelView(): void {
    flightRequestSequence += 1
    if (!viewerRef.current || viewerRef.current.isDestroyed()) {
      return
    }
    const currentViewer = viewerRef.current
    const camera = currentViewer.camera
    const cartographic = camera.positionCartographic
    const longitude = Cesium.Math.toDegrees(cartographic.longitude)
    const latitude = Cesium.Math.toDegrees(cartographic.latitude)
    const activate = !useGlobeStore.getState().levelViewActive
    useGlobeStore.getState().setLevelViewActive(activate)
    const height = activate
      ? Math.min(Math.max(cartographic.height * 0.35, 15_000), 120_000)
      : Math.min(Math.max(cartographic.height * 2, 40_000), 4_000_000)
    const pitch = activate ? -12 : -45
    const flyToOrientation = () => {
      if (currentViewer.isDestroyed()) {
        return
      }
      currentViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: camera.heading,
          pitch: Cesium.Math.toRadians(pitch),
          roll: 0
        },
        duration: 1.2,
        complete: updateCameraState
      })
    }
    if (currentViewer.scene.mode === Cesium.SceneMode.SCENE3D) {
      flyToOrientation()
    } else {
      const morphComplete = () => {
        currentViewer.scene.morphComplete.removeEventListener(morphComplete)
        flyToOrientation()
      }
      currentViewer.scene.morphComplete.addEventListener(morphComplete)
      currentViewer.scene.morphTo3D(1)
      useGlobeStore.getState().setSceneMode('3D')
    }
  }

  async function flyTo(
    longitude: number,
    latitude: number,
    height: number
  ): Promise<number | undefined> {
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    if (
      ![longitude, latitude, height].every(Number.isFinite) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90 ||
      height <= 0
    ) {
      return
    }
    currentViewer.camera.cancelFlight()
    const requestSequence = ++flightRequestSequence
    let userSteered = false
    const markSteered = (): void => {
      userSteered = true
    }
    const markDragged = (event: Event): void => {
      if (event instanceof PointerEvent && flightPointerIsSteering(event.buttons)) {
        userSteered = true
      }
    }
    const canvas = currentViewer.scene.canvas
    canvas.addEventListener('pointerdown', markSteered)
    canvas.addEventListener('pointermove', markDragged)
    canvas.addEventListener('wheel', markSteered, { passive: true })
    canvas.addEventListener('keydown', markSteered)
    try {
      const destination = await resolveFlightDestination(
        currentViewer.scene,
        longitude,
        latitude,
        height,
        {
          isCancelled: () =>
            userSteered ||
            viewerRef.current !== currentViewer ||
            currentViewer.isDestroyed() ||
            requestSequence !== flightRequestSequence
        }
      )
      if (
        !destination ||
        !flightArrivalAllowed({
          requestSequence,
          activeSequence: flightRequestSequence,
          viewerAlive: viewerRef.current === currentViewer && !currentViewer.isDestroyed(),
          userSteered
        })
      ) {
        return
      }
      currentViewer.camera.flyTo({ destination, duration: 1.2, complete: updateCameraState })
      return Cesium.Cartographic.fromCartesian(destination).height
    } finally {
      canvas.removeEventListener('pointerdown', markSteered)
      canvas.removeEventListener('pointermove', markDragged)
      canvas.removeEventListener('wheel', markSteered)
      canvas.removeEventListener('keydown', markSteered)
    }
  }

  function flyToPlace(place: PlaceSuggestion): void {
    flightRequestSequence += 1
    const currentViewer = viewerRef.current
    if (!currentViewer || currentViewer.isDestroyed()) {
      return
    }
    const { longitude, latitude } = place
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      return
    }
    if (selectedPlaceMarker) {
      currentViewer.entities.remove(selectedPlaceMarker)
    }
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
        font: '14px -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif',
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
    void currentViewer
      .flyTo(selectedPlaceMarker, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), 5000),
        duration: 1.2
      })
      .then(updateCameraState)
  }

  function mount(): () => void {
    let cancelled = false
    const unsubscribePerformance = useGlobeStore.subscribe(
      state => state.performanceMode,
      () => {
        applyPerformanceBudget()
      }
    )
    const unsubscribeSolar = useSolarStore.subscribe(
      state => [state.active, state.utcMs] as const,
      () => {
        const currentViewer = viewerRef.current
        if (!currentViewer || currentViewer.isDestroyed()) {
          return
        }
        const store = useGlobeStore.getState()
        const solarStore = useSolarStore.getState()
        currentViewer.clock.currentTime = solarStore.active
          ? Cesium.JulianDate.fromDate(new Date(solarStore.utcMs))
          : Cesium.JulianDate.now()
        currentViewer.scene.globe.enableLighting = store.terrainLighting || solarStore.active
        currentViewer.scene.requestRender()
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] }
    )
    const unsubscribeMirror = useGlobeStore.subscribe(
      state =>
        [
          state.mirrorConsentOpen,
          state.tileMirrorMode,
          state.activeMirrorEndpoint,
          state.activeTerrainId
        ] as const,
      ([open, mirrorMode, activeEndpoint, activeTerrainId], previous) => {
        const wasOpen = previous[0]
        const prevMirrorMode = previous[1]
        const prevEndpoint = previous[2]
        if (open || useGlobeStore.getState().terrainProviderId !== 'arcgis-terrain') {
          return
        }
        if (!viewerRef.current || viewerRef.current.isDestroyed()) {
          return
        }
        const consentJustClosed = wasOpen && !open
        const mirrorModeChanged = prevMirrorMode !== mirrorMode
        const endpointChanged = prevEndpoint !== activeEndpoint && mirrorMode === 'on'
        if (activeTerrainId === 'arcgis-terrain' && !endpointChanged) {
          return
        }
        if (!consentJustClosed && !mirrorModeChanged && !endpointChanged) {
          return
        }
        const desiredTerrainState: 'off' | MirrorEndpointId =
          mirrorMode === 'on' ? activeEndpoint : 'off'
        if (
          terrainMirrorState === desiredTerrainState &&
          (activeTerrainId === 'arcgis-terrain' || terrainRequestInFlight)
        ) {
          return
        }
        void retryTerrain()
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] }
    )
    useFailureStore.getState().registerRetry('webgl', retryWebGlSurface)
    void (async () => {
      if (cancelled || !containerRef.current) {
        return
      }
      useGlobeStore.getState().setGlobeLoadStage('正在读取设置…')
      useFailureStore.getState().registerRetry('settings', async () => {
        useGlobeStore.getState().setGlobeLoadStage('正在重新读取设置…')
        await useGlobeStore.getState().hydrateSettings()
        if (useGlobeStore.getState().selectedLayerId !== activeBasemapId) {
          switchBasemap(useGlobeStore.getState().selectedLayerId)
        }
        await setTerrain(useGlobeStore.getState().terrainProviderId, generation)
      })
      await useGlobeStore.getState().hydrateSettings()
      if (cancelled || !containerRef.current) {
        return
      }
      await bootstrapViewer()
    })()
    return () => {
      cancelled = true
      unsubscribePerformance()
      unsubscribeSolar()
      unsubscribeMirror()
      bootstrapGeneration += 1
      destroyActiveViewer()
    }
  }

  return {
    mount,
    switchBasemap,
    setProviderStyle,
    setLayerOpacity: (id: string, opacity: number) => {
      const value = Math.min(1, Math.max(0, opacity))
      const layer = imageryLayers.get(id)
      if (layer) {
        layer.alpha = value
      }
      useGlobeStore.getState().setLayerOpacity(id, value)
    },
    flyTo,
    flyToPlace,
    toggleLevelView,
    setTerrain: (id: string) => {
      cancelTransectFlight()
      useGlobeStore.getState().setTerrainProvider(id)
      void setTerrain(id, generation)
    },
    setTerrainExaggeration: (value: number) => {
      flightRequestSequence += 1
      useGlobeStore.getState().setTerrainExaggeration(value)
      const currentViewer = viewerRef.current
      if (currentViewer && !currentViewer.isDestroyed()) {
        currentViewer.scene.verticalExaggeration = useGlobeStore.getState().terrainExaggeration
      }
    },
    setTerrainLighting: (value: boolean) => {
      useGlobeStore.getState().setTerrainLighting(value)
      const currentViewer = viewerRef.current
      if (currentViewer && !currentViewer.isDestroyed()) {
        currentViewer.scene.globe.enableLighting = value || useSolarStore.getState().active
      }
      if (polarCaps) {
        polarCaps.appearance = new Cesium.PerInstanceColorAppearance({
          flat: !(value || useSolarStore.getState().active),
          translucent: false
        })
      }
    }
  }
}

export function useCesiumViewer(
  containerRef: RefObject<HTMLDivElement | null>
): UseCesiumViewerResult {
  const [viewer, setViewer] = useState<Cesium.Viewer | undefined>()
  const viewerRef = useRef<Cesium.Viewer | undefined>(undefined)
  const mountedRef = useRef(false)
  const [controller] = useState(() =>
    createCesiumViewerController(containerRef, viewerRef, next => {
      viewerRef.current = next
      if (mountedRef.current) {
        setViewer(next)
      }
    })
  )

  useEffect(() => {
    mountedRef.current = true
    const cleanup = controller.mount()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [controller])

  return useMemo(
    () => ({
      viewer,
      switchBasemap: controller.switchBasemap,
      setProviderStyle: controller.setProviderStyle,
      setLayerOpacity: controller.setLayerOpacity,
      flyTo: controller.flyTo,
      flyToPlace: controller.flyToPlace,
      toggleLevelView: controller.toggleLevelView,
      setTerrain: controller.setTerrain,
      setTerrainExaggeration: controller.setTerrainExaggeration,
      setTerrainLighting: controller.setTerrainLighting
    }),
    [viewer, controller]
  )
}
