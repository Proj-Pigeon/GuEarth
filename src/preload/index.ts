import '@sentry/electron/preload'
import { contextBridge, ipcRenderer } from 'electron'

export interface ProviderCredentialStatus {
  configured: boolean
  updatedAt: number | null
}

export interface GuEarthSettings {
  selectedImageryProviderId: string
  selectedTerrainProviderId: string
  terrainExaggeration: number
  terrainLighting: boolean
  tileCacheEnabled: boolean
  tileMirrorEnabled: boolean
  networkProxy: string
  providerStyles: Record<string, string>
  providerCredentials: Record<string, ProviderCredentialStatus>
  sceneMode: '2D' | '3D'
  setupGuideDismissed: boolean | null
}

export interface GuEarthSettingsPatch {
  selectedImageryProviderId?: string
  selectedTerrainProviderId?: string
  terrainExaggeration?: number
  terrainLighting?: boolean
  tileCacheEnabled?: boolean
  tileMirrorEnabled?: boolean
  networkProxy?: string
  providerStyles?: Record<string, string>
  sceneMode?: '2D' | '3D'
  setupGuideDismissed?: boolean
}

export interface NetworkProxyTestResult {
  ok: boolean
  elapsedMs: number
  error: string
}

export interface TileKey {
  providerId: string
  styleId: string
  level: number
  x: number
  y: number
}

export interface TileCacheEntry extends TileKey {
  data: ArrayBuffer
  contentType: string
  expiresAt: number | null
}

export interface TileCacheStats {
  files: number
  bytes: number
}

export interface GeoPosition {
  longitude: number
  latitude: number
  height: number
}

export interface StoredShape {
  id: string
  kind: 'point' | 'polyline' | 'polygon' | 'arrow' | 'text'
  positions: GeoPosition[]
  annotation: string
  color: string
  textColor: string
  fontFamily: string
  fontSize: number
  textFrame: boolean
  lineWidth: number
  createdAt: number
}

export type AnnotationEntry =
  | { type: 'folder'; id: string; name: string; children: AnnotationEntry[] }
  | { type: 'shape'; id: string }

export interface AnnotationDocument {
  shapes: StoredShape[]
  entries: AnnotationEntry[]
}

export type AiProtocol = 'openai' | 'anthropic'
export type AiThinkingLevel = 'low' | 'medium' | 'high'

export interface AiModelConfig {
  id: string
  label: string
  contextWindow: number
  streaming: boolean
  vision: boolean
  thinking: boolean
  thinkingLevel: AiThinkingLevel
}

export interface AiProviderConfig {
  id: string
  name: string
  protocol: AiProtocol
  baseUrl: string
  models: AiModelConfig[]
}

export interface AiSearchProviderConfig {
  id: string
  name: string
  kind: 'baidu'
}

export interface AiSearchReference {
  title: string
  url: string
  content: string
  website: string
  date: string
}

export interface AiSettings {
  providers: AiProviderConfig[]
  activeProviderId: string
  activeModelId: string
  searchProviders: AiSearchProviderConfig[]
  activeSearchProviderId: string
  skipDeleteConversationConfirm: boolean
  memoryEnabled: boolean
  socraticEnabled: boolean
}

export interface AgentMemory {
  id: string
  content: string
  source: 'user' | 'agent'
  createdAt: number
}

export interface AiChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiContextEntry {
  role: 'user' | 'assistant' | 'tool'
  content: string
  callId?: string
  name?: string
  isError?: boolean
}

export interface AiContextCategory {
  key: 'system' | 'user' | 'assistant' | 'tool'
  label: string
  tokens: number
  ratio: number
}

export interface AiContextStats {
  usedTokens: number
  contextWindow: number
  usagePercent: number
  categories: AiContextCategory[]
}

export interface AiContextCompressionResult {
  summary: string
  retainedTurns: AiChatTurn[]
  stats: AiContextStats
  beforeTokens: number
  afterTokens: number
}

export interface AiToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AiChatEvent =
  | { sessionId: string; type: 'reasoning-delta'; text: string }
  | { sessionId: string; type: 'text-delta'; text: string }
  | { sessionId: string; type: 'tool-start'; callId: string; name: string; args: unknown }
  | { sessionId: string; type: 'tool-end'; callId: string; ok: boolean; summary: string; result: string; references?: AiSearchReference[] }
  | { sessionId: string; type: 'execute-tool'; callId: string; name: string; args: unknown }
  | { sessionId: string; type: 'context-stats'; stats: AiContextStats }
  | { sessionId: string; type: 'context-compression-start' }
  | { sessionId: string; type: 'context-compressed'; summary: string; retainedTurns: AiChatTurn[]; stats: AiContextStats; beforeTokens: number; afterTokens: number }
  | { sessionId: string; type: 'context-compression-error'; message: string }
  | { sessionId: string; type: 'model-retry'; attempt: number; maxRetries: number; reason: string }
  | { sessionId: string; type: 'done' }
  | { sessionId: string; type: 'error'; message: string }

export interface StoredAiToolStep {
  callId: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'ok' | 'error'
  summary: string
  result: string
  references: AiSearchReference[]
}

export type StoredAiPart =
  | { kind: 'reasoning'; id: string; text: string; ms: number; startedAt: number }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; step: StoredAiToolStep }

export interface StoredAiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: StoredAiPart[]
  status: 'done' | 'error'
  error: string
}

export interface StoredAiCompression {
  summary: string
  coveredMessageIds: string[]
}

export interface StoredAiConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredAiMessage[]
  compression?: StoredAiCompression
}

export interface PlaceSuggestion {
  name: string
  province: string
  city: string
  district: string
  address: string
  type: string
  longitude: number
  latitude: number
}

export interface PlaceSearchResult {
  query: string
  places: PlaceSuggestion[]
  note?: string
  error?: string
  source?: PlaceSearchProvider
  fellBackFrom?: PlaceSearchProvider
  superseded?: boolean
}

export interface EarthquakeEvent {
  magnitude: number
  longitude: number
  latitude: number
  depthKm: number
  place: string
  time: number
}

export interface EarthquakeFeed {
  fetchedAt: number
  events: EarthquakeEvent[]
}

export interface ProvinceFeature {
  name: string
  adcode: number
  center: [number, number]
  centroid: [number, number]
  polygons: number[][][][]
}

export interface ProvinceGeoDocument {
  features: ProvinceFeature[]
}

export type PlaceSearchProvider = 'amap' | 'baidu'

export interface PoiCategoryCount {
  code: string
  label: string
  count: number
}

export interface PoiStatisticsResult {
  center: { name: string; longitude: number; latitude: number }
  radiusMeters?: number
  city?: string
  types: string
  sampled: number
  total: number
  truncated: boolean
  categories: PoiCategoryCount[]
  note?: string
  error?: string
}

export interface PoiStatisticsRequest {
  centerName?: string
  longitude?: number
  latitude?: number
  city?: string
  radiusMeters?: number
  types?: string
  keywords?: string
  maxSamples?: number
}

export interface SceneCamera {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
}

export interface SceneSimTime {
  date: string
  hour: number
}

export interface SceneSnapshot {
  camera: SceneCamera
  basemapId: string
  overlays: string[]
  month: number
  simTime: SceneSimTime | null
  motionPanel: string | null
}

export interface TeachingScene {
  id: string
  name: string
  narration: string
  dwellMs: number
  flyDurationMs: number
  snapshot: SceneSnapshot
  createdAt: number
}

export interface SceneDocument {
  scenes: TeachingScene[]
}

export interface RecordingSaveResult {
  path: string
  bytes: number
}

export interface UpdateState {
  status: 'idle' | 'available' | 'downloading' | 'ready'
  currentVersion: string
  version: string
  received: number
  total: number
}

export type UpdaterEvent =
  | { type: 'available'; version: string; notes: string }
  | { type: 'progress'; received: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

const api = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  },
  settings: {
    get: (): Promise<GuEarthSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: GuEarthSettingsPatch): Promise<GuEarthSettings> => ipcRenderer.invoke('settings:update', patch),
    setProviderApiKey: (providerId: string, apiKey: string): Promise<ProviderCredentialStatus> => ipcRenderer.invoke('settings:set-provider-api-key', providerId, apiKey),
    clearProviderApiKey: (providerId: string): Promise<ProviderCredentialStatus> => ipcRenderer.invoke('settings:clear-provider-api-key', providerId),
    hasProviderApiKey: (providerId: string): Promise<ProviderCredentialStatus> => ipcRenderer.invoke('settings:has-provider-api-key', providerId),
    testNetworkProxy: (proxy: string): Promise<NetworkProxyTestResult> => ipcRenderer.invoke('settings:test-network-proxy', proxy)
  },
  tiles: {
    get: (key: TileKey): Promise<TileCacheEntry | null> => ipcRenderer.invoke('tiles:get', key),
    put: (entry: TileCacheEntry): Promise<void> => ipcRenderer.invoke('tiles:put', entry),
    clear: (providerId?: string): Promise<void> => ipcRenderer.invoke('tiles:clear', providerId),
    stats: (): Promise<TileCacheStats> => ipcRenderer.invoke('tiles:stats')
  },
  annotations: {
    load: (): Promise<AnnotationDocument> => ipcRenderer.invoke('annotations:load'),
    save: (document: AnnotationDocument): Promise<void> => ipcRenderer.invoke('annotations:save', document)
  },
  scenes: {
    load: (): Promise<SceneDocument> => ipcRenderer.invoke('scenes:load'),
    save: (document: SceneDocument): Promise<void> => ipcRenderer.invoke('scenes:save', document)
  },
  recordings: {
    getDirectory: (): Promise<string | null> => ipcRenderer.invoke('recordings:get-directory'),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('recordings:choose-directory'),
    start: (mimeType: string): Promise<string> => ipcRenderer.invoke('recordings:start', mimeType),
    append: (recordingId: string, data: ArrayBuffer): Promise<void> => ipcRenderer.invoke('recordings:append', recordingId, data),
    finish: (recordingId: string): Promise<RecordingSaveResult> => ipcRenderer.invoke('recordings:finish', recordingId),
    abort: (recordingId: string): Promise<void> => ipcRenderer.invoke('recordings:abort', recordingId)
  },
  system: {
    fonts: (): Promise<string[]> => ipcRenderer.invoke('system:fonts')
  },
  logs: {
    copy: (rendererDump: string): Promise<void> => ipcRenderer.invoke('logging:copy-report', rendererDump)
  },
  places: {
    search: (keyword: string, provider?: PlaceSearchProvider): Promise<PlaceSearchResult> => ipcRenderer.invoke('places:search', keyword, provider),
    poiStatistics: (request: PoiStatisticsRequest): Promise<PoiStatisticsResult> => ipcRenderer.invoke('places:poi-statistics', request)
  },
  datasets: {
    getEarthquakes: (): Promise<EarthquakeFeed> => ipcRenderer.invoke('datasets:earthquakes'),
    getProvinces: (): Promise<ProvinceGeoDocument> => ipcRenderer.invoke('datasets:provinces')
  },
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('updater:get-state'),
    download: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onEvent: (listener: (event: UpdaterEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: UpdaterEvent): void => listener(payload)
      ipcRenderer.on('updater:event', wrapped)
      return () => ipcRenderer.removeListener('updater:event', wrapped)
    }
  },
  ai: {
    getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('ai:get-settings'),
    updateSettings: (settings: AiSettings): Promise<AiSettings> => ipcRenderer.invoke('ai:update-settings', settings),
    chat: (sessionId: string, turns: AiChatTurn[], tools: AiToolDefinition[]): Promise<void> => ipcRenderer.invoke('ai:chat', sessionId, turns, tools),
    getContextStats: (entries: AiContextEntry[]): Promise<AiContextStats> => ipcRenderer.invoke('ai:context-stats', entries),
    compressContext: (entries: AiContextEntry[]): Promise<AiContextCompressionResult> => ipcRenderer.invoke('ai:compress-context', entries),
    stop: (sessionId: string): Promise<void> => ipcRenderer.invoke('ai:stop', sessionId),
    toolResult: (sessionId: string, callId: string, ok: boolean, result: unknown): Promise<void> => ipcRenderer.invoke('ai:tool-result', sessionId, callId, ok, result),
    chatHistory: {
      list: (): Promise<StoredAiConversation[]> => ipcRenderer.invoke('ai:history-list'),
      save: (conversation: StoredAiConversation): Promise<StoredAiConversation[]> => ipcRenderer.invoke('ai:history-save', conversation),
      delete: (id: string): Promise<StoredAiConversation[]> => ipcRenderer.invoke('ai:history-delete', id)
    },
    memory: {
      list: (): Promise<AgentMemory[]> => ipcRenderer.invoke('ai:memory-list'),
      add: (content: string): Promise<AgentMemory[]> => ipcRenderer.invoke('ai:memory-add', content),
      delete: (id: string): Promise<AgentMemory[]> => ipcRenderer.invoke('ai:memory-delete', id)
    },
    onEvent: (listener: (event: AiChatEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: AiChatEvent): void => listener(payload)
      ipcRenderer.on('ai:event', wrapped)
      return () => ipcRenderer.removeListener('ai:event', wrapped)
    }
  }
}

export type GuEarthApi = typeof api

contextBridge.exposeInMainWorld('guEarth', api)
