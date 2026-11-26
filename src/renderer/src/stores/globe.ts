import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MirrorPolicyId } from '../../../common/mirrorPolicies'
import { DEFAULT_MIRROR_ENDPOINT, isMirrorEndpointId, normalizeMirrorEndpointPreference, normalizeTileMirrorMode } from '../../../common/tileMirror';
import type { MirrorEndpointId, MirrorEndpointPreference, MirrorEndpointProbeResult, TileMirrorMode } from '../../../common/tileMirror';
import { normalizeTouchInteractionMode, resolveTouchInteractionActive } from '../../../common/touchInteraction';
import type { TouchEnvironment, TouchInteractionMode } from '../../../common/touchInteraction';
import { normalizeThemeMode, resolveTheme } from '../../../common/themeMode';
import type { ResolvedTheme, ThemeMode } from '../../../common/themeMode';
import type { TerrainProviderId } from '../../../common/terrainProviders'
import type { GuEarthSettingsPatch, TileMirrorStatus } from '../../../preload'
import { useFailureStore } from './failure'

export type MirrorConsentReason = 'china' | 'slow' | 'settings'

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
  { id: 'viirs-night', name: 'NASA 夜光', description: '全球夜间灯光分布', region: 'global', coordinateSystem: 'WGS84', requiresKey: false, styles: [{ id: 'night', name: '夜光' }], defaultStyleId: 'night' }
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
  id: TerrainProviderId
  name: string
  description: string
}

export const terrainCatalog: TerrainMeta[] = [
  { id: 'arcgis-terrain', name: '全球 3D 地形', description: '真实起伏山地地形' },
  { id: 'cesium-world-terrain', name: 'Cesium 世界地形', description: '高精度全球地形' },
  { id: 'ellipsoid', name: '平滑球面（无起伏）', description: '平滑球体，不显示山脉起伏' }
]

const terrainProviderIds = new Set<string>(terrainCatalog.map((terrain) => terrain.id))

function providerFor(id: string): ProviderMeta | undefined {
  return providerCatalog.find((provider) => provider.id === id) || credentialOnlyProviders.find((provider) => provider.id === id)
}

export function styleFor(providerId: string, styleId: string): string {
  const provider = providerFor(providerId)
  return provider?.styles.some((style) => style.id === styleId) ? styleId : provider?.defaultStyleId ?? 'standard'
}

function apiAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.guEarth?.settings)
}

export interface GlobeState {
  layers: LayerMeta[]
  selectedLayerId: string
  providerStyles: Record<string, string>
  terrainProviderId: string
  terrainExaggeration: number
  terrainLighting: boolean
  tileCacheEnabled: boolean
  tileMirrorMode: TileMirrorMode
  tileMirrorSource: MirrorEndpointPreference
  activeMirrorEndpoint: MirrorEndpointId
  mirrorProbingEndpoints: boolean
  mirrorEndpointProbes: MirrorEndpointProbeResult[]
  mirrorConsentPrompted: boolean
  settingsHydrated: boolean
  mirrorConsentOpen: boolean
  mirrorConsentReason: MirrorConsentReason
  mirrorPolicyOpen: boolean
  mirrorPolicyActiveId: MirrorPolicyId
  mirroredProviders: string[]
  mirrorFallenBackProviders: string[]
  networkProxy: string
  touchInteractionMode: TouchInteractionMode
  touchInteractionActive: boolean
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  providerCredentials: Record<string, { configured: boolean; updatedAt: number | null }>
  isLayerPanelOpen: boolean
  isGlobeReady: boolean
  globeLoadTimedOut: boolean
  globeLoadStage: string
  activeTerrainId: string
  globeError: string
  terrainError: string
  camera: CameraReadout
  sceneMode: SceneMode
  levelViewActive: boolean
}

export interface GlobeActions {
  hydrateSettings: () => Promise<void>
  setLayerPanelOpen: (value: boolean) => void
  setGlobeReady: (value: boolean) => void
  setGlobeLoadTimedOut: (value: boolean) => void
  setGlobeLoadStage: (value: string) => void
  setActiveTerrainId: (id: string) => void
  setGlobeError: (message: string, detail?: string) => void
  setTerrainError: (message: string, detail?: string) => void
  setCameraReadout: (value: CameraReadout) => void
  selectBasemap: (id: string) => void
  setLayerOpacity: (id: string, opacity: number) => void
  setProviderStyle: (providerId: string, styleId: string) => void
  setTerrainProvider: (id: string) => void
  setTerrainExaggeration: (value: number) => void
  setTerrainLighting: (value: boolean) => void
  setTileCacheEnabled: (value: boolean) => void
  setTileMirrorMode: (value: unknown) => void
  setTileMirrorSource: (value: unknown) => void
  applyTileMirrorStatus: (status: TileMirrorStatus) => void
  openMirrorConsent: (reason: MirrorConsentReason) => void
  closeMirrorConsent: () => void
  acceptMirrorConsent: () => void
  declineMirrorConsent: () => void
  openMirrorPolicy: (policyId?: MirrorPolicyId) => void
  closeMirrorPolicy: () => void
  setMirroredProviders: (providerIds: string[]) => void
  setMirrorFallenBackProviders: (providerIds: string[]) => void
  isMirrorActive: (providerId: string) => boolean
  setNetworkProxy: (value: string) => void
  setCredentialStatus: (id: string, status: { configured: boolean; updatedAt: number | null }) => void
  setSceneMode: (mode: SceneMode) => void
  setLevelViewActive: (value: boolean) => void
  setTouchInteractionMode: (value: unknown) => Promise<void>
  setThemeMode: (value: unknown) => Promise<void>
}

export type GlobeStore = GlobeState & GlobeActions

const coarsePointerQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)')
    : undefined

const darkSchemeQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined

function detectSystemPrefersDark(): boolean {
  return Boolean(darkSchemeQuery?.matches)
}

function detectTouchEnvironment(): TouchEnvironment {
  if (typeof window === 'undefined') {return { coarsePointer: false, maxTouchPoints: 0 }}
  const coarsePointer = Boolean(coarsePointerQuery?.matches)
  return {
    coarsePointer,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0)
  }
}

let touchEnvironment: TouchEnvironment = detectTouchEnvironment()

function readInitialTheme(): { themeMode: ThemeMode; resolvedTheme: ResolvedTheme } {
  const boot = typeof window === 'undefined' ? undefined : window.guEarth?.initialTheme
  if (boot) {
    const themeMode = normalizeThemeMode(boot.themeMode)
    const resolvedTheme: ResolvedTheme =
      boot.resolvedTheme === 'dark' || boot.resolvedTheme === 'light'
        ? boot.resolvedTheme
        : resolveTheme(themeMode, detectSystemPrefersDark())
    return { themeMode, resolvedTheme }
  }
  return { themeMode: 'light', resolvedTheme: resolveTheme('light', detectSystemPrefersDark()) }
}

export function createInitialGlobeState(): GlobeState {
  touchEnvironment = detectTouchEnvironment()
  const initialTheme = readInitialTheme()
  return {
    layers: defaultLayers.map((layer) => ({ ...layer })),
    selectedLayerId: 'osm',
    providerStyles: Object.fromEntries(providerCatalog.map((provider) => [provider.id, provider.defaultStyleId])),
    terrainProviderId: 'arcgis-terrain',
    terrainExaggeration: 2,
    terrainLighting: false,
    tileCacheEnabled: true,
    tileMirrorMode: 'off',
    tileMirrorSource: 'auto',
    activeMirrorEndpoint: DEFAULT_MIRROR_ENDPOINT,
    mirrorProbingEndpoints: false,
    mirrorEndpointProbes: [],
    mirrorConsentPrompted: true,
    settingsHydrated: false,
    mirrorConsentOpen: false,
    mirrorConsentReason: 'china',
    mirrorPolicyOpen: false,
    mirrorPolicyActiveId: 'agreement',
    mirroredProviders: [],
    mirrorFallenBackProviders: [],
    networkProxy: '',
    touchInteractionMode: 'auto',
    touchInteractionActive: resolveTouchInteractionActive('auto', touchEnvironment),
    themeMode: initialTheme.themeMode,
    resolvedTheme: initialTheme.resolvedTheme,
    providerCredentials: {},
    isLayerPanelOpen: false,
    isGlobeReady: false,
    globeLoadTimedOut: false,
    globeLoadStage: '',
    activeTerrainId: '',
    globeError: '',
    terrainError: '',
    camera: { longitude: 105, latitude: 35, height: 15_000_000, heading: 0, pitch: 0 },
    sceneMode: '3D',
    levelViewActive: false
  }
}

export function selectGlobeError(state: Pick<GlobeState, 'globeError'>): string {
  return state.globeError
}

export function selectTerrainError(state: Pick<GlobeState, 'terrainError'>): string {
  return state.terrainError
}

let mirrorConsentKnown = false
let mirrorPersistSeq = 0
let mirrorSourcePersistSeq = 0
let mirrorSourceSettledSeq = 0
let touchModePersistSeq = 0
let themeModePersistSeq = 0

async function persistSettingsPatch(patch: GuEarthSettingsPatch): Promise<boolean> {
  if (!apiAvailable()) {return true}
  try {
    await window.guEarth.settings.update(patch)
    return true
  } catch {
    return false
  }
}

export const useGlobeStore = create<GlobeStore>()(
  subscribeWithSelector((set, get) => {
    async function persistSettings(): Promise<boolean> {
      const state = get()
      return persistSettingsPatch({
        selectedImageryProviderId: state.selectedLayerId,
        selectedTerrainProviderId: state.terrainProviderId,
        terrainExaggeration: state.terrainExaggeration,
        terrainLighting: state.terrainLighting,
        tileCacheEnabled: state.tileCacheEnabled,
        networkProxy: state.networkProxy,
        providerStyles: { ...state.providerStyles },
        sceneMode: state.sceneMode
      })
    }

    async function syncMirrorModeAfterFailure(previousMode: TileMirrorMode, seq: number): Promise<void> {
      let nextMode: TileMirrorMode = previousMode
      let nextProviders: string[] | undefined
      let nextFallenBack: string[] | undefined
      let nextProbing: boolean | undefined
      let nextProbes: MirrorEndpointProbeResult[] | undefined
      if (apiAvailable() && typeof window.guEarth.tiles?.getMirrorStatus === 'function') {
        try {
          const status = await window.guEarth.tiles.getMirrorStatus()
          nextMode = status.mode === 'on' ? 'on' : 'off'
          nextProviders = [...status.mirroredProviders]
          nextFallenBack = [...(status.fallenBackProviders ?? [])]
          if (typeof status.probingEndpoints === 'boolean') {nextProbing = status.probingEndpoints}
          if (Array.isArray(status.endpointProbes)) {nextProbes = status.endpointProbes.map((probe) => ({ ...probe }))}
        } catch {
          nextMode = previousMode
        }
      }
      if (seq !== mirrorPersistSeq) {return}
      set((state) => ({
        tileMirrorMode: nextMode,
        mirroredProviders: nextProviders ?? state.mirroredProviders,
        mirrorFallenBackProviders: nextFallenBack ?? state.mirrorFallenBackProviders,
        mirrorProbingEndpoints: nextProbing === undefined ? state.mirrorProbingEndpoints : nextProbing,
        mirrorEndpointProbes: nextProbes ?? state.mirrorEndpointProbes
      }))
      useFailureStore.getState().reportDegrade('镜像服务设置保存失败，已恢复原网络设置')
    }

    async function persistMirrorSettings(previousMode: TileMirrorMode): Promise<void> {
      const seq = ++mirrorPersistSeq
      const state = get()
      const saved = await persistSettingsPatch({
        tileMirrorMode: state.tileMirrorMode,
        ...(mirrorConsentKnown ? { mirrorConsentPrompted: state.mirrorConsentPrompted } : {})
      })
      if (saved || seq !== mirrorPersistSeq) {return}
      await syncMirrorModeAfterFailure(previousMode, seq)
    }

    async function syncMirrorSourceAfterFailure(
      previousSource: MirrorEndpointPreference,
      previousActive: MirrorEndpointId,
      seq: number
    ): Promise<void> {
      let nextSource: MirrorEndpointPreference = previousSource
      let nextActive: MirrorEndpointId = previousActive
      let nextProviders: string[] | undefined
      let nextFallenBack: string[] | undefined
      let nextProbing: boolean | undefined
      let nextProbes: MirrorEndpointProbeResult[] | undefined
      if (apiAvailable() && typeof window.guEarth.tiles?.getMirrorStatus === 'function') {
        try {
          const status = await window.guEarth.tiles.getMirrorStatus()
          if (status.sourcePreference) {nextSource = normalizeMirrorEndpointPreference(status.sourcePreference)}
          if (isMirrorEndpointId(status.activeEndpoint)) {nextActive = status.activeEndpoint}
          nextProviders = [...status.mirroredProviders]
          nextFallenBack = [...(status.fallenBackProviders ?? [])]
          if (typeof status.probingEndpoints === 'boolean') {nextProbing = status.probingEndpoints}
          if (Array.isArray(status.endpointProbes)) {nextProbes = status.endpointProbes.map((probe) => ({ ...probe }))}
        } catch {
          nextSource = previousSource
          nextActive = previousActive
        }
      }
      if (seq !== mirrorSourcePersistSeq) {return}
      mirrorSourceSettledSeq = seq
      set((state) => ({
        tileMirrorSource: nextSource,
        activeMirrorEndpoint: nextActive,
        mirroredProviders: nextProviders ?? state.mirroredProviders,
        mirrorFallenBackProviders: nextFallenBack ?? state.mirrorFallenBackProviders,
        mirrorProbingEndpoints: nextProbing === undefined ? state.mirrorProbingEndpoints : nextProbing,
        mirrorEndpointProbes: nextProbes ?? state.mirrorEndpointProbes
      }))
      useFailureStore.getState().reportDegrade('镜像服务设置保存失败，已恢复原网络设置')
    }

    async function persistMirrorSourceSetting(
      source: MirrorEndpointPreference,
      previousSource: MirrorEndpointPreference,
      previousActive: MirrorEndpointId
    ): Promise<void> {
      const seq = ++mirrorSourcePersistSeq
      const saved = await persistSettingsPatch({ tileMirrorSource: source })
      if (seq !== mirrorSourcePersistSeq) {return}
      if (saved) {
        mirrorSourceSettledSeq = seq
        return
      }
      await syncMirrorSourceAfterFailure(previousSource, previousActive, seq)
    }

    return {
      ...createInitialGlobeState(),
      async hydrateSettings(): Promise<void> {
        if (!apiAvailable()) {return}
        try {
          const settings = await window.guEarth.settings.get()
          const nextTileMirrorSource = normalizeMirrorEndpointPreference(settings.tileMirrorSource)
          const nextTouchInteractionMode = normalizeTouchInteractionMode(settings.touchInteractionMode)
          const nextThemeMode = normalizeThemeMode(settings.themeMode)
          mirrorConsentKnown = true
          set((state) => ({
            selectedLayerId: providerFor(settings.selectedImageryProviderId) ? settings.selectedImageryProviderId : 'osm',
            terrainProviderId: terrainProviderIds.has(settings.selectedTerrainProviderId) ? settings.selectedTerrainProviderId : 'arcgis-terrain',
            terrainExaggeration: Math.min(5, Math.max(1, settings.terrainExaggeration)),
            terrainLighting: settings.terrainLighting,
            tileCacheEnabled: settings.tileCacheEnabled,
            mirrorConsentPrompted: settings.mirrorConsentPrompted === true,
            tileMirrorMode: settings.mirrorConsentPrompted === true && normalizeTileMirrorMode(settings.tileMirrorMode) === 'on' ? 'on' : 'off',
            tileMirrorSource: nextTileMirrorSource,
            activeMirrorEndpoint: nextTileMirrorSource === 'auto' ? state.activeMirrorEndpoint : nextTileMirrorSource,
            touchInteractionMode: nextTouchInteractionMode,
            touchInteractionActive: resolveTouchInteractionActive(nextTouchInteractionMode, touchEnvironment),
            themeMode: nextThemeMode,
            resolvedTheme: resolveTheme(nextThemeMode, detectSystemPrefersDark()),
            networkProxy: settings.networkProxy ?? '',
            providerStyles: Object.fromEntries(providerCatalog.map((provider) => [provider.id, styleFor(provider.id, settings.providerStyles?.[provider.id] ?? provider.defaultStyleId)])),
            providerCredentials: settings.providerCredentials,
            sceneMode: settings.sceneMode ?? '3D',
            settingsHydrated: true
          }))
          useFailureStore.getState().clearFailure('settings')
        } catch {
          mirrorConsentKnown = false
          set({ settingsHydrated: true })
          useFailureStore.getState().reportFailure({ scope: 'settings', message: '设置读取失败，已使用默认设置', retryable: true })
        }
      },
      setLayerPanelOpen(value: boolean): void {
        set({ isLayerPanelOpen: value })
      },
      setGlobeReady(value: boolean): void {
        if (value) {
          set({ isGlobeReady: true, globeLoadTimedOut: false, globeLoadStage: '', globeError: '' })
          useFailureStore.getState().clearFailure('basemap')
          return
        }
        set({ isGlobeReady: false })
      },
      setGlobeLoadTimedOut(value: boolean): void {
        set({ globeLoadTimedOut: value })
      },
      setGlobeLoadStage(value: string): void {
        set({ globeLoadStage: value })
      },
      setActiveTerrainId(id: string): void {
        set({ activeTerrainId: id })
      },
      setGlobeError(message: string, detail?: string): void {
        if (!message) {
          set({ globeError: '' })
          useFailureStore.getState().clearFailure('basemap')
          return
        }
        set({ globeError: message })
        useFailureStore.getState().reportFailure({ scope: 'basemap', message, detail, retryable: true })
      },
      setTerrainError(message: string, detail?: string): void {
        if (!message) {
          set({ terrainError: '' })
          useFailureStore.getState().clearFailure('terrain')
          return
        }
        set({ terrainError: message })
        useFailureStore.getState().reportFailure({ scope: 'terrain', message, detail, retryable: true })
      },
      setCameraReadout(value: CameraReadout): void {
        set({ camera: value })
      },
      selectBasemap(id: string): void {
        set({ selectedLayerId: id })
        void persistSettings()
      },
      setLayerOpacity(id: string, opacity: number): void {
        set((state) => ({
          layers: state.layers.map((layer) => (layer.id === id ? { ...layer, opacity } : layer))
        }))
      },
      setProviderStyle(providerId: string, styleId: string): void {
        const normalized = styleFor(providerId, styleId)
        if (!providerFor(providerId)) {return}
        set((state) => ({
          providerStyles: { ...state.providerStyles, [providerId]: normalized }
        }))
        void persistSettings()
      },
      setTerrainProvider(id: string): void {
        if (terrainProviderIds.has(id)) {set({ terrainProviderId: id })}
        void persistSettings()
      },
      setTerrainExaggeration(value: number): void {
        set({ terrainExaggeration: Math.min(5, Math.max(1, value)) })
        void persistSettings()
      },
      setTerrainLighting(value: boolean): void {
        set({ terrainLighting: value })
        void persistSettings()
      },
      setTileCacheEnabled(value: boolean): void {
        set({ tileCacheEnabled: value })
        void persistSettings()
      },
      setTileMirrorMode(value: unknown): void {
        const mode = normalizeTileMirrorMode(value)
        const previousMode = get().tileMirrorMode
        if (mode === previousMode) {return}
        set({ tileMirrorMode: mode })
        void persistMirrorSettings(previousMode)
      },
      setTileMirrorSource(value: unknown): void {
        const source = normalizeMirrorEndpointPreference(value)
        const state = get()
        if (source === state.tileMirrorSource) {return}
        const previousSource = state.tileMirrorSource
        const previousActive = state.activeMirrorEndpoint
        set({
          tileMirrorSource: source,
          activeMirrorEndpoint: source === 'auto' ? state.activeMirrorEndpoint : source
        })
        void persistMirrorSourceSetting(source, previousSource, previousActive)
      },
      applyTileMirrorStatus(status: TileMirrorStatus): void {
        const sourcePending = mirrorSourcePersistSeq !== mirrorSourceSettledSeq
        set((state) => {
          const nextTileMirrorSource =
            !sourcePending && status.sourcePreference
              ? normalizeMirrorEndpointPreference(status.sourcePreference)
              : state.tileMirrorSource
          const nextActiveMirrorEndpoint =
            isMirrorEndpointId(status.activeEndpoint) &&
            (!sourcePending || nextTileMirrorSource === 'auto' || status.activeEndpoint === nextTileMirrorSource)
              ? status.activeEndpoint
              : state.activeMirrorEndpoint
          return {
            mirroredProviders: [...status.mirroredProviders],
            mirrorFallenBackProviders: [...(status.fallenBackProviders ?? [])],
            tileMirrorSource: nextTileMirrorSource,
            activeMirrorEndpoint: nextActiveMirrorEndpoint,
            mirrorProbingEndpoints:
              typeof status.probingEndpoints === 'boolean' ? status.probingEndpoints : state.mirrorProbingEndpoints,
            mirrorEndpointProbes: Array.isArray(status.endpointProbes)
              ? status.endpointProbes.map((probe) => ({ ...probe }))
              : state.mirrorEndpointProbes
          }
        })
      },
      openMirrorConsent(reason: MirrorConsentReason): void {
        set({ mirrorConsentReason: reason, mirrorConsentOpen: true })
      },
      closeMirrorConsent(): void {
        set({ mirrorConsentOpen: false })
      },
      acceptMirrorConsent(): void {
        const previousMode = get().tileMirrorMode
        mirrorConsentKnown = true
        set({
          mirrorConsentPrompted: true,
          tileMirrorMode: 'on',
          mirrorConsentOpen: false
        })
        void persistMirrorSettings(previousMode)
      },
      declineMirrorConsent(): void {
        const state = get()
        const previousMode = state.tileMirrorMode
        const wasUnprompted = !state.mirrorConsentPrompted
        const reason = state.mirrorConsentReason
        mirrorConsentKnown = true
        set({
          mirrorConsentPrompted: true,
          tileMirrorMode: reason === 'settings' ? state.tileMirrorMode : 'off',
          mirrorConsentOpen: false
        })
        if (wasUnprompted || reason !== 'settings') {void persistMirrorSettings(previousMode)}
      },
      openMirrorPolicy(policyId: MirrorPolicyId = 'agreement'): void {
        set({ mirrorPolicyActiveId: policyId, mirrorPolicyOpen: true })
      },
      closeMirrorPolicy(): void {
        set({ mirrorPolicyOpen: false })
      },
      setMirroredProviders(providerIds: string[]): void {
        set({ mirroredProviders: [...providerIds] })
      },
      setMirrorFallenBackProviders(providerIds: string[]): void {
        set({ mirrorFallenBackProviders: [...providerIds] })
      },
      isMirrorActive(providerId: string): boolean {
        return get().mirroredProviders.includes(providerId)
      },
      setNetworkProxy(value: string): void {
        set({ networkProxy: value })
        void persistSettings()
      },
      setCredentialStatus(id: string, status: { configured: boolean; updatedAt: number | null }): void {
        set((state) => ({
          providerCredentials: { ...state.providerCredentials, [id]: status }
        }))
      },
      setSceneMode(mode: SceneMode): void {
        set({ sceneMode: mode })
        void persistSettings()
      },
      setLevelViewActive(value: boolean): void {
        set({ levelViewActive: value })
      },
      async setTouchInteractionMode(value: unknown): Promise<void> {
        const mode = normalizeTouchInteractionMode(value)
        const previousMode = get().touchInteractionMode
        if (mode === previousMode) {return}
        set({
          touchInteractionMode: mode,
          touchInteractionActive: resolveTouchInteractionActive(mode, touchEnvironment)
        })
        const seq = ++touchModePersistSeq
        const saved = await persistSettingsPatch({ touchInteractionMode: mode })
        if (saved || seq !== touchModePersistSeq) {return}
        let restored = previousMode
        try {
          const settings = await window.guEarth.settings.get()
          restored = normalizeTouchInteractionMode(settings.touchInteractionMode)
        } catch {
          restored = previousMode
        }
        if (seq !== touchModePersistSeq) {return}
        if (get().touchInteractionMode === mode) {
          set({
            touchInteractionMode: restored,
            touchInteractionActive: resolveTouchInteractionActive(restored, touchEnvironment)
          })
        }
        useFailureStore.getState().reportDegrade('触摸操作设置保存失败，已恢复原设置')
      },
      async setThemeMode(value: unknown): Promise<void> {
        const mode = normalizeThemeMode(value)
        const previousMode = get().themeMode
        if (mode === previousMode) {return}
        set({
          themeMode: mode,
          resolvedTheme: resolveTheme(mode, detectSystemPrefersDark())
        })
        const seq = ++themeModePersistSeq
        const saved = await persistSettingsPatch({ themeMode: mode })
        if (saved || seq !== themeModePersistSeq) {return}
        let restored = previousMode
        try {
          const settings = await window.guEarth.settings.get()
          restored = normalizeThemeMode(settings.themeMode)
        } catch {
          restored = previousMode
        }
        if (seq !== themeModePersistSeq) {return}
        if (get().themeMode === mode) {
          set({
            themeMode: restored,
            resolvedTheme: resolveTheme(restored, detectSystemPrefersDark())
          })
        }
        useFailureStore.getState().reportDegrade('外观主题设置保存失败，已恢复原设置')
      }
    }
  })
)

function syncTouchInteractionActive(): void {
  const state = useGlobeStore.getState()
  const active = resolveTouchInteractionActive(state.touchInteractionMode, touchEnvironment)
  if (active !== state.touchInteractionActive) {
    useGlobeStore.setState({ touchInteractionActive: active })
  }
}

function handleEnvironmentPointer(event: PointerEvent): void {
  if (event.pointerType !== 'touch') {return}
  if (touchEnvironment.maxTouchPoints === 0) {
    touchEnvironment = { ...touchEnvironment, maxTouchPoints: Math.max(navigator.maxTouchPoints, 1) }
    syncTouchInteractionActive()
  }
}

function refreshTouchEnvironment(): void {
  const next = detectTouchEnvironment()
  if (next.coarsePointer === touchEnvironment.coarsePointer && next.maxTouchPoints === touchEnvironment.maxTouchPoints) {return}
  touchEnvironment = next
  syncTouchInteractionActive()
}

function syncResolvedTheme(): void {
  const state = useGlobeStore.getState()
  const resolvedTheme = resolveTheme(state.themeMode, detectSystemPrefersDark())
  if (resolvedTheme !== state.resolvedTheme) {
    useGlobeStore.setState({ resolvedTheme })
  }
}

coarsePointerQuery?.addEventListener?.('change', refreshTouchEnvironment)
darkSchemeQuery?.addEventListener?.('change', syncResolvedTheme)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pointerdown', handleEnvironmentPointer)
}

if (typeof useFailureStore.subscribe === 'function') {
  useFailureStore.subscribe((state) => {
    const globeError = state.notices.basemap?.message ?? ''
    const terrainError = state.notices.terrain?.message ?? ''
    const current = useGlobeStore.getState()
    if (current.globeError !== globeError || current.terrainError !== terrainError) {
      useGlobeStore.setState({ globeError, terrainError })
    }
  })
}

export function resetGlobeStore(): void {
  mirrorConsentKnown = false
  mirrorPersistSeq = 0
  mirrorSourcePersistSeq = 0
  mirrorSourceSettledSeq = 0
  touchModePersistSeq = 0
  themeModePersistSeq = 0
  useGlobeStore.setState(createInitialGlobeState())
}
