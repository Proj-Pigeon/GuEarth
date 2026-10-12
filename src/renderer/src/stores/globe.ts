import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { normalizeTileMirrorMode, type TileMirrorMode } from '../../../common/tileMirror'
import { useFailureStore } from './failure'

export type LayerKind = 'basemap' | 'overlay'
export type ProviderRegion = 'global' | 'china'

export interface ProviderStyle {
  id: string
  name: string
}

export interface ProviderMeta {
  id: string
  name: string
  description: string
  region: ProviderRegion
  coordinateSystem: 'WGS84' | 'GCJ02' | 'BD09'
  requiresKey: boolean
  requiresSk?: boolean
  skOptional?: boolean
  requiresSecurityKey?: boolean
  securityKeyOptional?: boolean
  styles: ProviderStyle[]
  defaultStyleId: string
}

export interface LayerMeta {
  id: string
  providerId: string
  name: string
  description: string
  kind: LayerKind
  opacity: number
}

export interface CameraReadout {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
}

export type SceneMode = '2D' | '3D'

export const providerCatalog: ProviderMeta[] = [
  { id: 'osm', name: 'OpenStreetMap', description: '道路与地名', region: 'global', coordinateSystem: 'WGS84', requiresKey: false, styles: [{ id: 'standard', name: '标准' }], defaultStyleId: 'standard' },
  { id: 'esri-imagery', name: 'Esri', description: '卫星影像', region: 'global', coordinateSystem: 'WGS84', requiresKey: false, styles: [{ id: 'satellite', name: '卫星' }], defaultStyleId: 'satellite' },
  { id: 'opentopomap', name: 'OpenTopoMap', description: '地形晕渲', region: 'global', coordinateSystem: 'WGS84', requiresKey: false, styles: [{ id: 'topo', name: '地形' }], defaultStyleId: 'topo' },
  { id: 'viirs-night', name: 'NASA 夜光', description: 'VIIRS 夜间灯光（Black Marble）', region: 'global', coordinateSystem: 'WGS84', requiresKey: false, styles: [{ id: 'night', name: '夜光' }], defaultStyleId: 'night' }
]

export interface BasemapCategoryMeta {
  id: string
  name: string
  providerIds: string[]
}

export const basemapCategories: BasemapCategoryMeta[] = [
  { id: 'road', name: '道路', providerIds: ['osm'] },
  { id: 'satellite', name: '卫星', providerIds: ['esri-imagery'] },
  { id: 'topo', name: '地形', providerIds: ['opentopomap'] },
  { id: 'night', name: '夜光', providerIds: ['viirs-night'] }
]

export const credentialOnlyProviders: ProviderMeta[] = [
  { id: 'amap', name: '高德', description: '地点检索（Web 服务）', region: 'china', coordinateSystem: 'GCJ02', requiresKey: true, requiresSecurityKey: true, securityKeyOptional: true, styles: [{ id: 'road', name: '道路' }, { id: 'satellite', name: '卫星' }], defaultStyleId: 'road' },
  { id: 'baidu', name: '百度', description: '大陆地图', region: 'china', coordinateSystem: 'BD09', requiresKey: true, requiresSk: true, skOptional: true, styles: [{ id: 'road', name: '道路' }, { id: 'satellite', name: '卫星' }], defaultStyleId: 'road' }
]

const defaultLayers: LayerMeta[] = providerCatalog.map((provider) => ({
  id: provider.id,
  providerId: provider.id,
  name: provider.name,
  description: provider.description,
  kind: 'basemap',
  opacity: 1
}))

export interface TerrainMeta {
  id: string
  name: string
  description: string
}

export const terrainCatalog: TerrainMeta[] = [
  { id: 'arcgis-terrain', name: '全球 3D 地形', description: 'ArcGIS 高程，免密钥' },
  { id: 'cesium-world-terrain', name: 'Cesium 世界地形', description: 'Cesium ion 官方高程' },
  { id: 'ellipsoid', name: '椭球（无起伏）', description: '光滑球面，无山脉' }
]

const terrainProviderIds = new Set(terrainCatalog.map((terrain) => terrain.id))

function providerFor(id: string): ProviderMeta | undefined {
  return providerCatalog.find((provider) => provider.id === id) || credentialOnlyProviders.find((provider) => provider.id === id)
}

function styleFor(providerId: string, styleId: string): string {
  const provider = providerFor(providerId)
  return provider?.styles.some((style) => style.id === styleId) ? styleId : provider?.defaultStyleId ?? 'standard'
}

function apiAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.guEarth?.settings)
}

export const useGlobeStore = defineStore('globe', () => {
  const layers = ref<LayerMeta[]>(defaultLayers.map((layer) => ({ ...layer })))
  const selectedLayerId = ref('osm')
  const providerStyles = ref<Record<string, string>>(Object.fromEntries(providerCatalog.map((provider) => [provider.id, provider.defaultStyleId])))
  const terrainProviderId = ref('arcgis-terrain')
  const terrainExaggeration = ref(2)
  const terrainLighting = ref(false)
  const tileCacheEnabled = ref(true)
  const tileMirrorMode = ref<TileMirrorMode>('auto')
  const mirroredProviders = ref<string[]>([])
  const networkProxy = ref('')
  const providerCredentials = ref<Record<string, { configured: boolean; updatedAt: number | null }>>({})
  const isLayerPanelOpen = ref(false)
  const failureStore = useFailureStore()
  const isGlobeReady = ref(false)
  const globeLoadTimedOut = ref(false)
  const globeLoadStage = ref('')
  const activeTerrainId = ref('')
  const globeError = computed(() => failureStore.notices.basemap?.message ?? '')
  const terrainError = computed(() => failureStore.notices.terrain?.message ?? '')
  const camera = ref<CameraReadout>({ longitude: 105, latitude: 35, height: 15000000, heading: 0, pitch: 0 })
  const sceneMode = ref<SceneMode>('3D')
  const levelViewActive = ref(false)

  async function hydrateSettings(): Promise<void> {
    if (!apiAvailable()) return
    try {
      const settings = await window.guEarth.settings.get()
      selectedLayerId.value = providerFor(settings.selectedImageryProviderId) ? settings.selectedImageryProviderId : 'osm'
      terrainProviderId.value = terrainProviderIds.has(settings.selectedTerrainProviderId) ? settings.selectedTerrainProviderId : 'arcgis-terrain'
      terrainExaggeration.value = Math.min(5, Math.max(1, settings.terrainExaggeration))
      terrainLighting.value = settings.terrainLighting
      tileCacheEnabled.value = settings.tileCacheEnabled
      tileMirrorMode.value = normalizeTileMirrorMode(settings.tileMirrorMode)
      networkProxy.value = settings.networkProxy ?? ''
      providerStyles.value = Object.fromEntries(providerCatalog.map((provider) => [provider.id, styleFor(provider.id, settings.providerStyles?.[provider.id] ?? provider.defaultStyleId)]))
      providerCredentials.value = settings.providerCredentials
      sceneMode.value = settings.sceneMode ?? '3D'
      failureStore.clearFailure('settings')
    } catch {
      failureStore.reportFailure({ scope: 'settings', message: '设置读取失败，已使用默认设置', retryable: true })
    }
  }

  async function persistSettings(): Promise<void> {
    if (!apiAvailable()) return
    await window.guEarth.settings.update({
      selectedImageryProviderId: selectedLayerId.value,
      selectedTerrainProviderId: terrainProviderId.value,
      terrainExaggeration: terrainExaggeration.value,
      terrainLighting: terrainLighting.value,
      tileCacheEnabled: tileCacheEnabled.value,
      tileMirrorMode: tileMirrorMode.value,
      networkProxy: networkProxy.value,
      providerStyles: { ...providerStyles.value },
      sceneMode: sceneMode.value
    })
  }

  function setLayerPanelOpen(value: boolean): void { isLayerPanelOpen.value = value }
  function setGlobeReady(value: boolean): void {
    isGlobeReady.value = value
    if (value) {
      globeLoadTimedOut.value = false
      globeLoadStage.value = ''
      failureStore.clearFailure('basemap')
    }
  }
  function setGlobeLoadTimedOut(value: boolean): void { globeLoadTimedOut.value = value }
  function setGlobeLoadStage(value: string): void { globeLoadStage.value = value }
  function setActiveTerrainId(id: string): void { activeTerrainId.value = id }
  function setGlobeError(message: string, detail?: string): void {
    if (!message) {
      failureStore.clearFailure('basemap')
      return
    }
    failureStore.reportFailure({ scope: 'basemap', message, detail, retryable: true })
  }
  function setTerrainError(message: string, detail?: string): void {
    if (!message) {
      failureStore.clearFailure('terrain')
      return
    }
    failureStore.reportFailure({ scope: 'terrain', message, detail, retryable: true })
  }
  function setCameraReadout(value: CameraReadout): void { camera.value = value }
  function selectBasemap(id: string): void { selectedLayerId.value = id; void persistSettings() }
  function setLayerOpacity(id: string, opacity: number): void { layers.value = layers.value.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)) }
  function setProviderStyle(providerId: string, styleId: string): void {
    const normalized = styleFor(providerId, styleId)
    if (!providerFor(providerId)) return
    providerStyles.value = { ...providerStyles.value, [providerId]: normalized }
    void persistSettings()
  }
  function setTerrainProvider(id: string): void { if (terrainProviderIds.has(id)) terrainProviderId.value = id; void persistSettings() }
  function setTerrainExaggeration(value: number): void { terrainExaggeration.value = Math.min(5, Math.max(1, value)); void persistSettings() }
  function setTerrainLighting(value: boolean): void { terrainLighting.value = value; void persistSettings() }
  function setTileCacheEnabled(value: boolean): void { tileCacheEnabled.value = value; void persistSettings() }
  function setTileMirrorMode(value: unknown): void {
    const mode = normalizeTileMirrorMode(value)
    if (mode === tileMirrorMode.value) return
    tileMirrorMode.value = mode
    void persistSettings()
  }
  function setMirroredProviders(providerIds: string[]): void { mirroredProviders.value = [...providerIds] }
  function isMirrorActive(providerId: string): boolean { return mirroredProviders.value.includes(providerId) }
  function setNetworkProxy(value: string): void { networkProxy.value = value; void persistSettings() }
  function setCredentialStatus(id: string, status: { configured: boolean; updatedAt: number | null }): void { providerCredentials.value = { ...providerCredentials.value, [id]: status } }
  function setSceneMode(mode: SceneMode): void { sceneMode.value = mode; void persistSettings() }
  function setLevelViewActive(value: boolean): void { levelViewActive.value = value }

  return {
    layers, selectedLayerId, providerStyles, terrainProviderId, terrainExaggeration, terrainLighting, tileCacheEnabled, tileMirrorMode, mirroredProviders, networkProxy,
    providerCredentials, isLayerPanelOpen, isGlobeReady, globeLoadTimedOut, globeLoadStage, activeTerrainId, globeError, terrainError, camera, sceneMode, levelViewActive, hydrateSettings,
    setLayerPanelOpen, setGlobeReady, setGlobeLoadTimedOut, setGlobeLoadStage, setActiveTerrainId, setGlobeError, setTerrainError, setCameraReadout, selectBasemap, setLayerOpacity,
    setProviderStyle, setTerrainProvider, setTerrainExaggeration, setTerrainLighting, setTileCacheEnabled, setTileMirrorMode, setMirroredProviders, isMirrorActive, setNetworkProxy, setCredentialStatus, setSceneMode, setLevelViewActive
  }
})
