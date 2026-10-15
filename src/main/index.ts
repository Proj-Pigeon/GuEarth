import * as Sentry from '@sentry/electron/main'
import { app, shell, BrowserWindow, clipboard, dialog, ipcMain, net, protocol, session } from 'electron'
import { attachConsoleLogTee, logger } from '../common/logger'
import { normalizeNetworkProxy } from '../common/networkProxy'

attachConsoleLogTee('main')

Sentry.init({
  dsn: 'https://28239780e3a5ede424bde1114849f448@o4509333304573952.ingest.us.sentry.io/4512192370769920',
  beforeSend(event) {
    event.extra = { ...event.extra, mainProcessLogs: logger.dump(80) }
    return event
  }
})
import { execFileSync, spawn } from 'child_process'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { flushJsonWrites, readJson, serialQueue, writeAtomic, writeJson } from './jsonStore'
import { listTileFiles, pruneTileFiles } from './tileCacheFiles'
import { storageChildPath } from './storagePath'
import { access, constants, mkdtemp, mkdir, open, readFile, rename as renameFile, stat, rm, unlink, writeFile } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import icon from '../../resources/icon.png?asset'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import type { AnnotationDocument, AnnotationEntry, GeoPosition, GuEarthSettings, GuEarthSettingsPatch, NetworkProxyTestResult, OffscreenRecordingProbeResult, OffscreenRecordingScript, PlaceSearchProvider, ProviderCredentialStatus, RecordingSaveResult, SceneCamera, SceneDocument, SceneSnapshot, SceneSimTime, StoredShape, TeachingScene, TileCacheEntry, TileCacheStats, TileKey } from '../preload'
import { offscreenFrameRate, offscreenScriptDurationMs } from './offscreenTiming'
import { assertEncryptionAvailable, assertSafeId, clearProviderKey, hasProviderKey, initKeyVault, readProviderKey, writeProviderKey } from './keyVault'
import { baiduLngLatToTile, tileCenter, wgs84ToBd09 } from './geo'
import { AiSettingsStore } from './ai/settingsStore'
import { AiChatHistoryStore } from './ai/chatHistoryStore'
import { AiMemoryStore } from './ai/memoryStore'
import { registerAiIpcHandlers } from './ai/agent'
import { searchPlaces } from './ai/amap'
import { searchBaiduPlaces } from './ai/baidu'
import { beginPlacesRequest } from './ai/searchThrottle'
import { initDatasets, loadEarthquakeFeed, loadProvinceGeometry } from './datasets'
import { initUpdater } from './updater'

interface PersistedSettings {
  selectedImageryProviderId: string
  selectedTerrainProviderId: string
  terrainExaggeration: number
  terrainLighting: boolean
  tileCacheEnabled: boolean
  networkProxy: string
  providerStyles: Record<string, string>
  providerCredentials: Record<string, ProviderCredentialStatus>
  sceneMode: '2D' | '3D'
  setupGuideDismissed: boolean | null
  recordingDirectory: string | null
}

const defaultSettings: PersistedSettings = {
  selectedImageryProviderId: 'osm',
  selectedTerrainProviderId: 'arcgis-terrain',
  terrainExaggeration: 2,
  terrainLighting: false,
  tileCacheEnabled: true,
  networkProxy: '',
  providerStyles: {
    osm: 'standard',
    'esri-imagery': 'satellite',
    opentopomap: 'topo',
    baidu: 'road'
  },
  providerCredentials: {},
  sceneMode: '3D',
  setupGuideDismissed: null,
  recordingDirectory: null
}

const TILE_TTL_MS = 86_400_000
const TILE_CACHE_MAX_BYTES = 512 * 1024 * 1024
const TILE_CACHE_PRUNE_INTERVAL_MS = 10 * 60 * 1000

let settingsPath = ''
let tileCachePath = ''
let annotationsPath = ''
let scenesPath = ''
let offscreenRecordingWindow: BrowserWindow | null = null
let offscreenProgressTarget: Electron.WebContents | null = null
let cancelOffscreenRecording: (() => void) | null = null
let offscreenPaintStartedAt = 0
let offscreenPaintFrames = 0
let settings: PersistedSettings = { ...defaultSettings, providerCredentials: {} }
let annotations: AnnotationDocument = { shapes: [], entries: [] }
let scenes: SceneDocument = { scenes: [] }
const aiSettings = new AiSettingsStore()
const aiChatHistory = new AiChatHistoryStore()
const aiMemories = new AiMemoryStore()

protocol.registerSchemesAsPrivileged([
  { scheme: 'guearth-tile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const safeId = assertSafeId

async function readSettings(): Promise<PersistedSettings> {
  try {
    const parsed: unknown = await readJson(settingsPath)
    if (!isRecord(parsed)) return { ...defaultSettings, providerCredentials: {} }
    const credentials = isRecord(parsed.providerCredentials) ? parsed.providerCredentials : {}
    const providerCredentials: Record<string, ProviderCredentialStatus> = {}
    for (const [providerId, value] of Object.entries(credentials)) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(providerId)) continue
      if (!isRecord(value)) continue
      providerCredentials[providerId] = {
        configured: value.configured === true,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : null
      }
    }
    const providerStyles = isRecord(parsed.providerStyles) ? parsed.providerStyles : {}
    const normalizedStyles: Record<string, string> = { ...defaultSettings.providerStyles }
    for (const [providerId, styleId] of Object.entries(providerStyles)) {
      if (/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(providerId) && typeof styleId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(styleId)) normalizedStyles[providerId] = styleId
    }
    const legacyTerrain = parsed.terrainExaggeration === undefined
    const storedTerrainProviderId = typeof parsed.selectedTerrainProviderId === 'string' ? parsed.selectedTerrainProviderId : defaultSettings.selectedTerrainProviderId
    const terrainProviderId = storedTerrainProviderId === 'mapbox-terrain' ? 'cesium-world-terrain' : storedTerrainProviderId
    return {
      selectedImageryProviderId: typeof parsed.selectedImageryProviderId === 'string' ? parsed.selectedImageryProviderId : defaultSettings.selectedImageryProviderId,
      selectedTerrainProviderId: legacyTerrain && terrainProviderId === 'ellipsoid' ? defaultSettings.selectedTerrainProviderId : terrainProviderId,
      terrainExaggeration: typeof parsed.terrainExaggeration === 'number' && Number.isFinite(parsed.terrainExaggeration) ? Math.min(5, Math.max(1, parsed.terrainExaggeration)) : defaultSettings.terrainExaggeration,
      terrainLighting: parsed.terrainLighting === true,
      tileCacheEnabled: parsed.tileCacheEnabled !== false,
      networkProxy: normalizeNetworkProxy(parsed.networkProxy),
      providerStyles: normalizedStyles,
      providerCredentials,
      sceneMode: parsed.sceneMode === '2D' ? '2D' : '3D',
      setupGuideDismissed: typeof parsed.setupGuideDismissed === 'boolean' ? parsed.setupGuideDismissed : null,
      recordingDirectory: typeof parsed.recordingDirectory === 'string' && parsed.recordingDirectory.trim() ? parsed.recordingDirectory : null
    }
  } catch (error) {
    logger.error('settings', '读取设置失败，已使用默认设置', error)
    return { ...defaultSettings, providerCredentials: {} }
  }
}

const enqueueSettings = serialQueue()

function saveSettings(update: (current: PersistedSettings) => PersistedSettings): Promise<void> {
  return enqueueSettings(async () => {
    const next = update(structuredClone(settings))
    await writeJson(settingsPath, next)
    settings = next
  })
}

function proxyConfig(proxy: string): Parameters<Electron.Session['setProxy']>[0] {
  if (proxy === '') return { mode: 'system' }
  if (proxy === 'direct') return { mode: 'direct' }
  return { mode: 'fixed_servers', proxyRules: proxy, proxyBypassRules: '<local>' }
}

async function applyNetworkProxy(): Promise<void> {
  try {
    await session.defaultSession.setProxy(proxyConfig(normalizeNetworkProxy(settings.networkProxy)))
  } catch (error) {
    logger.warn('settings', '应用网络代理失败', error)
  }
}

function credentialStatus(providerId: string): ProviderCredentialStatus {
  const configured = hasProviderKey(providerId)
  const saved = settings.providerCredentials[providerId]
  if (!configured) return { configured: false, updatedAt: saved?.updatedAt ?? null }
  return { configured: true, updatedAt: saved?.updatedAt ?? null }
}

async function usableRecordingDirectory(): Promise<string | null> {
  const directory = settings.recordingDirectory
  if (!directory) return null
  try {
    const info = await stat(directory)
    if (!info.isDirectory()) return null
    await access(directory, constants.W_OK)
    return directory
  } catch {
    return null
  }
}

function settingsSnapshot(): GuEarthSettings {
  const providerCredentials: Record<string, ProviderCredentialStatus> = {}
  const providerIds = new Set([...Object.keys(settings.providerCredentials), 'amap', 'baidu'])
  for (const providerId of providerIds) providerCredentials[providerId] = credentialStatus(providerId)
  return { ...settings, providerCredentials }
}

function pathPart(value: number): string {
  if (!Number.isInteger(value)) throw new Error('无效的瓦片坐标')
  return value < 0 ? `n${Math.abs(value)}` : String(value)
}

function tileBasePath(key: TileKey): string {
  return storageChildPath(tileCachePath, safeId(key.providerId), safeId(key.styleId), pathPart(key.level), pathPart(key.x), pathPart(key.y))
}

function tileDataPath(key: TileKey): string {
  return `${tileBasePath(key)}.bin`
}

function tileMetaPath(key: TileKey): string {
  return `${tileBasePath(key)}.json`
}

function toArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

async function readTile(key: TileKey, allowExpired = false): Promise<TileCacheEntry | null> {
  const dataPath = tileDataPath(key)
  const metaPath = tileMetaPath(key)
  try {
    const [metadataText, data] = await Promise.all([readFile(metaPath, 'utf8'), readFile(dataPath)])
    const metadata: unknown = JSON.parse(metadataText)
    if (!isRecord(metadata) || typeof metadata.contentType !== 'string') return null
    const expiresAt = typeof metadata.expiresAt === 'number' ? metadata.expiresAt : null
    if (expiresAt !== null && expiresAt <= Date.now() && !allowExpired) return null
    return { ...key, data: toArrayBuffer(data), contentType: metadata.contentType, expiresAt }
  } catch {
    return null
  }
}

async function cachedTileResponse(key: TileKey, allowExpired: boolean): Promise<Response | null> {
  if (!settings.tileCacheEnabled) return null
  const cached = await readTile(key, allowExpired)
  if (!cached) return null
  const expired = cached.expiresAt !== null && cached.expiresAt <= Date.now()
  return new Response(cached.data, { headers: { 'content-type': cached.contentType, 'x-guearth-cache': expired ? 'stale' : 'hit' } })
}

let tilePruneAt = 0
let tilePrunePromise: Promise<void> | undefined

async function enforceTileCacheLimit(): Promise<void> {
  if (tilePrunePromise) return tilePrunePromise
  const now = Date.now()
  if (now - tilePruneAt < TILE_CACHE_PRUNE_INTERVAL_MS) return
  tilePruneAt = now
  tilePrunePromise = (async () => {
    await pruneTileFiles(tileCachePath, TILE_CACHE_MAX_BYTES)
  })().finally(() => {
    tilePrunePromise = undefined
  })
  return tilePrunePromise
}

const enqueueTileMutation = serialQueue()
let quitting = false

function writeTile(entry: TileCacheEntry): Promise<void> {
  if (quitting) return Promise.resolve()
  return enqueueTileMutation(async () => {
    const key: TileKey = { providerId: entry.providerId, styleId: entry.styleId, level: entry.level, x: entry.x, y: entry.y }
    const basePath = tileBasePath(key)
    try {
      await mkdir(dirname(basePath), { recursive: true })
      await writeAtomic(`${basePath}.bin`, Buffer.from(entry.data))
      await writeJson(`${basePath}.json`, { contentType: entry.contentType, expiresAt: entry.expiresAt })
      void enqueueTileMutation(enforceTileCacheLimit).catch(() => undefined)
    } catch {
      void 0
    }
  })
}

async function cacheStats(): Promise<TileCacheStats> {
  const files = await listTileFiles(tileCachePath)
  return files.reduce<TileCacheStats>((result, file) => {
    if (file.path.endsWith('.bin')) result.files += 1
    result.bytes += file.size
    return result
  }, { files: 0, bytes: 0 })
}

function computeBaiduSn(path: string, queryString: string, sk: string): string {
  const plaintext = encodeURIComponent(`${path}?${queryString}${sk}`)
  return createHash('md5').update(plaintext).digest('hex')
}

function tileRemoteUrl(providerId: string, styleId: string, level: number, x: number, y: number): string | undefined {
  if (providerId === 'osm') return `https://tile.openstreetmap.org/${level}/${x}/${y}.png`
  if (providerId === 'esri-imagery') return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${level}/${y}/${x}`
  if (providerId === 'opentopomap') return `https://${['a', 'b', 'c'][((x % 3) + 3) % 3]}.tile.opentopomap.org/${level}/${x}/${y}.png`
  if (providerId === 'baidu') {
    const key = readProviderKey(providerId)
    if (!key) return undefined
    const subdomain = String(((x % 4) + 4) % 4)
    const [translatedX, translatedY] = baiduLngLatToTile(level, ...wgs84ToBd09(...tileCenter(level, x, y)))
    const ak = key
    const sk = readProviderKey(`${providerId}-sk`)
    if (styleId === 'satellite') {
      const baseQueryString = `qt=satepc&x=${translatedX}&y=${translatedY}&z=${level}&udt=20230101&ak=${encodeURIComponent(ak)}`
      if (!sk) return `https://maponline${subdomain}.bdimg.com/tile/?${baseQueryString}`
      const sn = computeBaiduSn('/tile/', baseQueryString, sk)
      return `https://maponline${subdomain}.bdimg.com/tile/?${baseQueryString}&sn=${sn}`
    }
    const baseQueryString = `x=${translatedX}&y=${translatedY}&z=${level}&ak=${encodeURIComponent(ak)}`
    if (!sk) return `https://online${subdomain}.map.bdimg.com/onlinelabel/?qt=tile&${baseQueryString}&styles=pl&scaler=1&udt=20230101`
    const pathWithQuery = `/onlinelabel/?qt=tile&${baseQueryString}&styles=pl&scaler=1&udt=20230101`
    const sn = computeBaiduSn('/onlinelabel/', `qt=tile&${baseQueryString}&styles=pl&scaler=1&udt=20230101`, sk)
    return `https://online${subdomain}.map.bdimg.com${pathWithQuery}&sn=${sn}`
  }
  return undefined
}

const TILE_FETCH_TIMEOUT_MS = 8000
const TILE_FETCH_ATTEMPTS = 2
const TILE_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
}

async function fetchTileWithRetry(url: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < TILE_FETCH_ATTEMPTS; attempt++) {
    try {
      return await net.fetch(url, { headers: TILE_FETCH_HEADERS, signal: AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS) })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function handleTileProtocol(request: Request): Promise<Response> {
  const parsed = new URL(request.url)
  const providerId = safeId(parsed.hostname)
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length !== 4) return new Response('Bad tile path', { status: 400 })
  const styleId = safeId(parts[0])
  const coordinates = parts.slice(1).map(Number)
  if (!Number.isInteger(coordinates[0]) || coordinates[0] < 0 || !Number.isInteger(coordinates[1]) || !Number.isInteger(coordinates[2])) return new Response('Bad tile path', { status: 400 })
  const [level, x, y] = coordinates
  const key = { providerId, styleId, level, x, y }
  const cached = await cachedTileResponse(key, false)
  if (cached) return cached
  const remoteUrl = tileRemoteUrl(providerId, styleId, level, x, y)
  if (!remoteUrl) return new Response('Unknown provider', { status: 404 })
  try {
    const response = await fetchTileWithRetry(remoteUrl)
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        const stale = await cachedTileResponse(key, true)
        if (stale) return stale
      }
      return new Response(`Tile request failed: ${response.status}`, { status: response.status })
    }
    const data = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/png'
    if (settings.tileCacheEnabled) void writeTile({ ...key, data, contentType, expiresAt: Date.now() + TILE_TTL_MS })
    return new Response(data, { headers: { 'content-type': contentType, 'x-guearth-cache': 'miss' } })
  } catch {
    const stale = await cachedTileResponse(key, true)
    if (stale) return stale
    return new Response('Tile unavailable', { status: 502 })
  }
}

function normalizeShape(value: unknown): StoredShape {
  if (!isRecord(value)) throw new Error('无效的标注数据')
  const id = safeId(value.id)
  if (value.kind !== 'point' && value.kind !== 'polyline' && value.kind !== 'polygon' && value.kind !== 'arrow' && value.kind !== 'text') throw new Error('无效的标注类型')
  if (!Array.isArray(value.positions)) throw new Error('无效的标注坐标')
  const positions: GeoPosition[] = value.positions.map((item) => {
    if (!isRecord(item)) throw new Error('无效的标注坐标')
    const { longitude, latitude, height } = item
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('无效的标注坐标')
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('无效的标注坐标')
    if (typeof height !== 'number' || !Number.isFinite(height) || height < -11000 || height > 20000) throw new Error('无效的标注坐标')
    return { longitude, latitude, height }
  })
  const minimum = value.kind === 'point' || value.kind === 'text' ? 1 : value.kind === 'polygon' ? 3 : 2
  if (positions.length < minimum || positions.length > 500) throw new Error('无效的标注坐标')
  const validColor = (color: unknown, fallback: string): string => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : fallback
  const fontFamily = typeof value.fontFamily === 'string' && value.fontFamily.length <= 128 && /^[\p{L}\p{N} .,'()&_\-]+$/u.test(value.fontFamily) ? value.fontFamily : 'Arial'
  const fontSize = typeof value.fontSize === 'number' && Number.isFinite(value.fontSize) ? Math.min(72, Math.max(8, value.fontSize)) : 13
  const lineWidth = typeof value.lineWidth === 'number' && Number.isFinite(value.lineWidth) ? Math.min(12, Math.max(1, value.lineWidth)) : 3
  return {
    id,
    kind: value.kind,
    positions,
    annotation: typeof value.annotation === 'string' ? value.annotation.slice(0, 200) : '',
    color: validColor(value.color, '#1677ff'),
    textColor: validColor(value.textColor, '#1f1f1f'),
    fontFamily,
    fontSize,
    textFrame: typeof value.textFrame === 'boolean' ? value.textFrame : false,
    lineWidth,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now()
  }
}

function normalizeAnnotations(value: unknown): AnnotationDocument {
  if (!isRecord(value) || !Array.isArray(value.shapes) || !Array.isArray(value.entries)) throw new Error('无效的标注目录')
  const shapes = value.shapes.map(normalizeShape)
  const shapeIds = new Set(shapes.map((shape) => shape.id))
  if (shapeIds.size !== shapes.length) throw new Error('重复的标注')
  const referenced = new Set<string>()
  const folderIds = new Set<string>()
  function normalizeEntries(items: unknown[], depth: number): AnnotationEntry[] {
    if (items.length > 10000) throw new Error('标注目录过大')
    return items.map((item) => {
      if (!isRecord(item)) throw new Error('无效的目录项')
      const id = safeId(item.id)
      if (item.type === 'shape') {
        if (!shapeIds.has(id) || referenced.has(id)) throw new Error('无效的标注引用')
        referenced.add(id)
        return { type: 'shape', id }
      }
      if (item.type !== 'folder' || depth > 5 || !Array.isArray(item.children) || typeof item.name !== 'string') throw new Error('无效的文件夹')
      if (folderIds.has(id) || shapeIds.has(id)) throw new Error('重复的文件夹')
      folderIds.add(id)
      const name = item.name.trim().slice(0, 80)
      if (!name) throw new Error('文件夹名称不能为空')
      return { type: 'folder', id, name, children: normalizeEntries(item.children, depth + 1) }
    })
  }
  const entries = normalizeEntries(value.entries, 1)
  if (referenced.size !== shapeIds.size) throw new Error('缺少标注引用')
  return { shapes, entries }
}

async function readAnnotations(): Promise<AnnotationDocument> {
  try {
    const parsed: unknown = await readJson(annotationsPath)
    if (!Array.isArray(parsed)) return normalizeAnnotations(parsed)
    const shapes = parsed.flatMap((item) => {
      try {
        return [normalizeShape(item)]
      } catch {
        return []
      }
    })
    return { shapes, entries: shapes.map((shape) => ({ type: 'shape' as const, id: shape.id })) }
  } catch (error) {
    logger.warn('annotations', '读取标注失败，已按空目录处理', error)
    return { shapes: [], entries: [] }
  }
}

const enqueueAnnotations = serialQueue()

function saveAnnotations(): Promise<void> {
  const snapshot = annotations
  return enqueueAnnotations(() => writeJson(annotationsPath, snapshot))
}

const MOTION_PANEL_IDS = new Set(['solar-path', 'obliquity', 'rotation-speed'])
const SCENE_MAX = 200

function normalizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function normalizeSceneCamera(value: unknown): SceneCamera {
  if (!isRecord(value)) throw new Error('无效的场景视角')
  const longitude = Number(value.longitude)
  const latitude = Number(value.latitude)
  const height = Number(value.height)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('无效的场景视角')
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('无效的场景视角')
  if (!Number.isFinite(height) || height <= 0 || height > 20000000) throw new Error('无效的场景视角')
  const heading = normalizeNumber(value.heading, -360, 360, 0)
  const pitch = normalizeNumber(value.pitch, -90, 90, -90)
  return { longitude, latitude, height, heading, pitch }
}

function normalizeSceneSimTime(value: unknown): SceneSimTime | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('无效的模拟时间')
  return { date: value.date, hour: normalizeNumber(value.hour, 0, 24, 12) }
}

function normalizeSceneSnapshot(value: unknown): SceneSnapshot {
  if (!isRecord(value)) throw new Error('无效的场景快照')
  const overlays = Array.isArray(value.overlays)
    ? [...new Set(value.overlays.filter((item): item is string => typeof item === 'string').map((item) => safeId(item)))]
    : []
  if (overlays.length > 14) throw new Error('无效的专题图层')
  const motionPanel = typeof value.motionPanel === 'string' && MOTION_PANEL_IDS.has(value.motionPanel) ? value.motionPanel : null
  return {
    camera: normalizeSceneCamera(value.camera),
    basemapId: safeId(value.basemapId ?? 'osm'),
    overlays,
    month: Math.round(normalizeNumber(value.month, 1, 12, 7)),
    simTime: normalizeSceneSimTime(value.simTime),
    motionPanel
  }
}

function normalizeTeachingScene(value: unknown): TeachingScene {
  if (!isRecord(value)) throw new Error('无效的教学场景')
  const id = safeId(value.id)
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : ''
  if (!name) throw new Error('场景名称不能为空')
  return {
    id,
    name,
    narration: typeof value.narration === 'string' ? value.narration.slice(0, 500) : '',
    dwellMs: Math.round(normalizeNumber(value.dwellMs, 1000, 60000, 6000)),
    flyDurationMs: Math.round(normalizeNumber(value.flyDurationMs, 500, 15000, 3500)),
    snapshot: normalizeSceneSnapshot(value.snapshot),
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now()
  }
}

function normalizeSceneDocument(value: unknown): SceneDocument {
  if (!isRecord(value) || !Array.isArray(value.scenes)) throw new Error('无效的场景目录')
  if (value.scenes.length > SCENE_MAX) throw new Error('场景目录过大')
  const scenes = value.scenes.map(normalizeTeachingScene)
  if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length) throw new Error('重复的场景')
  return { scenes }
}

async function readScenes(): Promise<SceneDocument> {
  try {
    return normalizeSceneDocument(await readJson(scenesPath))
  } catch (error) {
    logger.warn('scenes', '读取教学场景失败，已按空目录处理', error)
    return { scenes: [] }
  }
}

const enqueueScenes = serialQueue()

function saveScenes(): Promise<void> {
  const snapshot = scenes
  return enqueueScenes(() => writeJson(scenesPath, snapshot))
}

const RECORDING_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

interface RecordingWriter {
  senderId: number
  path: string
  temporaryPath: string
  handle: FileHandle
  bytes: number
  queue: Promise<void>
  state: 'open' | 'finishing'
}

const recordingWriters = new Map<string, RecordingWriter>()

function recordingExtension(mimeType: unknown): string {
  if (typeof mimeType !== 'string') throw new Error('无效的视频格式')
  const extension = RECORDING_EXTENSIONS[mimeType.split(';')[0].trim().toLowerCase()]
  if (!extension) throw new Error('不支持的视频格式')
  return extension
}

function ffmpegPath(): string {
  return ffmpegInstaller.path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

function finalizeMp4Recording(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stderr: Buffer[] = []
    const process = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-map', '0:v:0', '-c:v', 'copy', '-movflags', '+faststart', '-f', 'mp4', outputPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    process.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    process.once('error', reject)
    process.once('close', (code) => {
      if (code === 0) resolve()
      else {
        const detail = Buffer.concat(stderr).toString('utf8').trim()
        reject(new Error(`视频容器最终化失败（FFmpeg 退出码 ${code ?? '未知'}）${detail ? `：${detail.slice(-1000)}` : ''}`))
      }
    })
  })
}

function getRecordingWriter(recordingId: unknown, senderId: number): RecordingWriter {
  if (typeof recordingId !== 'string') throw new Error('无效的录制会话')
  const writer = recordingWriters.get(recordingId)
  if (!writer || writer.senderId !== senderId || writer.state !== 'open') throw new Error('录制会话已失效')
  return writer
}

async function discardRecordingWriter(recordingId: string, writer: RecordingWriter): Promise<void> {
  writer.state = 'finishing'
  recordingWriters.delete(recordingId)
  await writer.queue.catch(() => undefined)
  await writer.handle.close().catch(() => undefined)
  await unlink(writer.temporaryPath).catch(() => undefined)
}

function registerIpcHandlers(): void {
  ipcMain.handle('system:fonts', (): string[] => {
    const families = new Set(['Arial', 'Segoe UI', 'Microsoft YaHei'])
    const registryKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    ]
    if (process.platform === 'win32') {
      for (const key of registryKeys) {
        try {
          const result = execFileSync('reg.exe', ['query', key], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
          for (const line of result.split(/\r?\n/)) {
            const match = line.match(/^\s+(.+?)\s+REG_\w+\s+/)
            if (!match) continue
            for (const family of match[1].replace(/\s*\([^)]*\)\s*$/, '').split(/\s*&\s*/)) {
              const name = family.trim()
              if (name && name.length <= 128) families.add(name)
            }
          }
        } catch {
          continue
        }
      }
    } else {
      try {
        const result = execFileSync('fc-list', ['--format', '%{family}\n'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
        for (const line of result.split(/\r?\n/)) {
          for (const family of line.split(',')) {
            const name = family.trim()
            if (name && name.length <= 128) families.add(name)
          }
        }
      } catch {
        void 0
      }
    }
    return [...families].sort((first, second) => first.localeCompare(second))
  })
  ipcMain.handle('settings:get', () => settingsSnapshot())
  ipcMain.handle('settings:update', async (_event, patch: GuEarthSettingsPatch): Promise<GuEarthSettings> => {
    if (!isRecord(patch)) throw new Error('无效的设置')
    await saveSettings((settings) => {
      const nextSettings: PersistedSettings = {
        ...settings,
        providerCredentials: settings.providerCredentials
      }
      if (patch.selectedImageryProviderId !== undefined) nextSettings.selectedImageryProviderId = safeId(patch.selectedImageryProviderId)
      if (patch.selectedTerrainProviderId !== undefined) nextSettings.selectedTerrainProviderId = safeId(patch.selectedTerrainProviderId)
      if (patch.terrainExaggeration !== undefined) {
        if (typeof patch.terrainExaggeration !== 'number' || !Number.isFinite(patch.terrainExaggeration)) throw new Error('无效的地形夸张设置')
        nextSettings.terrainExaggeration = Math.min(5, Math.max(1, patch.terrainExaggeration))
      }
      if (patch.terrainLighting !== undefined) {
        if (typeof patch.terrainLighting !== 'boolean') throw new Error('无效的光照设置')
        nextSettings.terrainLighting = patch.terrainLighting
      }
      if (patch.tileCacheEnabled !== undefined) {
        if (typeof patch.tileCacheEnabled !== 'boolean') throw new Error('无效的缓存设置')
        nextSettings.tileCacheEnabled = patch.tileCacheEnabled
      }
      if (patch.networkProxy !== undefined) {
        if (typeof patch.networkProxy !== 'string') throw new Error('无效的代理设置')
        const normalized = normalizeNetworkProxy(patch.networkProxy)
        if (normalized === '' && patch.networkProxy.trim() !== '') throw new Error('无效的代理地址')
        nextSettings.networkProxy = normalized
      }
      if (patch.providerStyles !== undefined) {
        if (!isRecord(patch.providerStyles)) throw new Error('无效的影像样式')
        const providerStyles = { ...settings.providerStyles }
        for (const [providerId, styleId] of Object.entries(patch.providerStyles)) {
          providerStyles[safeId(providerId)] = safeId(styleId)
        }
        nextSettings.providerStyles = providerStyles
      }
      if (patch.setupGuideDismissed !== undefined) {
        if (typeof patch.setupGuideDismissed !== 'boolean') throw new Error('无效的向导设置')
        nextSettings.setupGuideDismissed = patch.setupGuideDismissed
      }
      return nextSettings
    })
    if (patch.networkProxy !== undefined) void applyNetworkProxy()
    return settingsSnapshot()
  })
  ipcMain.handle('settings:set-provider-api-key', async (_event, providerId: string, apiKey: string): Promise<ProviderCredentialStatus> => {
    const id = safeId(providerId)
    writeProviderKey(id, apiKey)
    const status = { configured: true, updatedAt: Date.now() }
    await saveSettings((current) => ({ ...current, providerCredentials: { ...current.providerCredentials, [id]: status } }))
    return status
  })
  ipcMain.handle('settings:clear-provider-api-key', async (_event, providerId: string): Promise<ProviderCredentialStatus> => {
    const id = safeId(providerId)
    clearProviderKey(id)
    const status = { configured: false, updatedAt: null }
    await saveSettings((current) => ({ ...current, providerCredentials: { ...current.providerCredentials, [id]: status } }))
    return status
  })
  ipcMain.handle('settings:has-provider-api-key', (_event, providerId: string): ProviderCredentialStatus => credentialStatus(safeId(providerId)))
  ipcMain.handle('settings:test-network-proxy', async (_event, proxy: unknown): Promise<NetworkProxyTestResult> => {
    const raw = typeof proxy === 'string' ? proxy : ''
    const normalized = normalizeNetworkProxy(raw)
    if (normalized === '' && raw.trim() !== '') return { ok: false, elapsedMs: 0, error: '无效的代理地址' }
    const startedAt = Date.now()
    try {
      const testSession = session.fromPartition('guearth-network-test')
      await testSession.setProxy(proxyConfig(normalized))
      const response = await testSession.fetch('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0', { headers: TILE_FETCH_HEADERS, signal: AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS) })
      if (!response.ok) return { ok: false, elapsedMs: Date.now() - startedAt, error: `HTTP ${response.status}` }
      await response.arrayBuffer()
      return { ok: true, elapsedMs: Date.now() - startedAt, error: '' }
    } catch (error) {
      return { ok: false, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('places:search', async (_event, keyword: unknown, provider: unknown) => {
    if (typeof keyword !== 'string') throw new Error('无效的搜索关键词')
    if (provider !== undefined && provider !== 'amap' && provider !== 'baidu') throw new Error('无效的搜索源')
    const preferred: PlaceSearchProvider = provider ?? (hasProviderKey('amap') ? 'amap' : hasProviderKey('baidu') ? 'baidu' : 'amap')
    const requestId = beginPlacesRequest()
    const primary = preferred === 'baidu' ? await searchBaiduPlaces(keyword, requestId) : await searchPlaces(keyword, undefined, requestId)
    if (primary.superseded || !primary.error) return { ...primary, source: preferred }
    const alternative: PlaceSearchProvider = preferred === 'baidu' ? 'amap' : 'baidu'
    if (!hasProviderKey(alternative)) return { ...primary, source: preferred }
    const fallback = alternative === 'baidu' ? await searchBaiduPlaces(keyword) : await searchPlaces(keyword)
    if (fallback.error || fallback.superseded) return { ...primary, source: preferred }
    return { ...fallback, source: alternative, fellBackFrom: preferred }
  })
  ipcMain.handle('datasets:earthquakes', () => loadEarthquakeFeed())
  ipcMain.handle('datasets:provinces', () => loadProvinceGeometry())
  ipcMain.handle('tiles:get', (_event, key: TileKey) => readTile(key))
  ipcMain.handle('tiles:put', (_event, entry: TileCacheEntry) => writeTile(entry))
  ipcMain.handle('tiles:clear', (_event, providerId?: string) => {
    const target = providerId === undefined ? tileCachePath : storageChildPath(tileCachePath, safeId(providerId))
    return enqueueTileMutation(async () => {
      if (tilePrunePromise) await tilePrunePromise
      await rm(target, { recursive: true, force: true })
      await mkdir(tileCachePath, { recursive: true })
      tilePruneAt = 0
    })
  })
  ipcMain.handle('tiles:stats', () => cacheStats())
  ipcMain.handle('annotations:load', (): AnnotationDocument => annotations)
  ipcMain.handle('annotations:save', async (_event, document: unknown): Promise<void> => {
    annotations = normalizeAnnotations(document)
    await saveAnnotations()
  })
  ipcMain.handle('scenes:load', (): SceneDocument => scenes)
  ipcMain.handle('scenes:save', async (_event, document: unknown): Promise<void> => {
    try {
      scenes = normalizeSceneDocument(document)
      await saveScenes()
    } catch (error) {
      console.error('[scenes] save failed:', error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  })
  ipcMain.handle('recordings:get-directory', (): Promise<string | null> => usableRecordingDirectory())
  ipcMain.handle('recordings:choose-directory', async (event): Promise<string | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '选择视频保存文件夹',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const directory = result.filePaths[0]
    try {
      const info = await stat(directory)
      if (!info.isDirectory()) throw new Error('请选择文件夹')
      await access(directory, constants.W_OK)
    } catch {
      throw new Error('所选文件夹不可写，请选择其他文件夹')
    }
    await saveSettings((current) => ({ ...current, recordingDirectory: directory }))
    return directory
  })
  ipcMain.handle('recordings:offscreen-probe', async (_event, script: unknown): Promise<OffscreenRecordingProbeResult> => {
    if (script === undefined) return startOffscreenRecordingWindow()
    return startOffscreenRecordingWindow(normalizeOffscreenRecordingScript(script))
  })
  ipcMain.handle('recordings:offscreen-encode', async (event, script: unknown): Promise<RecordingSaveResult> => {
    offscreenProgressTarget = event.sender
    try {
      return await encodeOffscreenRecording(normalizeOffscreenRecordingScript(script))
    } finally {
      offscreenProgressTarget = null
    }
  })
  ipcMain.on('recordings:offscreen-progress', (event, payload: unknown): void => {
    const target = offscreenProgressTarget
    if (!target || target.isDestroyed() || event.sender !== offscreenRecordingWindow?.webContents) return
    if (!isRecord(payload)) return
    const sceneIndex = normalizeNumber(payload.sceneIndex, 0, 1000, 0)
    const totalScenes = normalizeNumber(payload.totalScenes, 0, 1000, 0)
    target.send('recordings:offscreen-progress', { sceneIndex: Math.round(sceneIndex), totalScenes: Math.round(totalScenes) })
  })
  ipcMain.handle('recordings:offscreen-self-test', async (): Promise<RecordingSaveResult> => runOffscreenSelfTest())
  ipcMain.handle('recordings:offscreen-cancel', (): void => { cancelOffscreenRecording?.() })
  ipcMain.handle('recordings:offscreen-stats', (): OffscreenRecordingProbeResult => offscreenRecordingStats())
  ipcMain.handle('recordings:start', async (event, mimeType: unknown): Promise<string> => {
    const extension = recordingExtension(mimeType)
    const directory = await usableRecordingDirectory()
    if (!directory) throw new Error('请先选择可用的视频保存文件夹')
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const recordingId = randomUUID()
    const path = join(directory, `GuEarth-${stamp}-${recordingId.slice(0, 8)}.${extension}`)
    const temporaryPath = `${path}.part`
    const handle = await open(temporaryPath, 'wx')
    recordingWriters.set(recordingId, {
      senderId: event.sender.id,
      path,
      temporaryPath,
      handle,
      bytes: 0,
      queue: Promise.resolve(),
      state: 'open'
    })
    return recordingId
  })
  ipcMain.handle('recordings:append', async (event, recordingId: unknown, data: unknown): Promise<void> => {
    const writer = getRecordingWriter(recordingId, event.sender.id)
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > 128 * 1024 * 1024) throw new Error('无效的视频分段')
    const buffer = Buffer.from(data)
    const write = writer.queue.then(async () => {
      let offset = 0
      while (offset < buffer.byteLength) {
        const result = await writer.handle.write(buffer, offset, buffer.byteLength - offset, null)
        if (result.bytesWritten === 0) throw new Error('视频分段写入失败')
        offset += result.bytesWritten
      }
      writer.bytes += buffer.byteLength
    })
    writer.queue = write
    await write
  })
  ipcMain.handle('recordings:finish', async (event, recordingId: unknown): Promise<RecordingSaveResult> => {
    const writer = getRecordingWriter(recordingId, event.sender.id)
    writer.state = 'finishing'
    try {
      await writer.queue
      if (writer.bytes === 0) throw new Error('未能生成视频数据')
      await writer.handle.close()
      if (writer.path.toLowerCase().endsWith('.mp4')) {
        const finalizedPath = `${writer.path}.final.part`
        await unlink(finalizedPath).catch(() => undefined)
        try {
          await finalizeMp4Recording(writer.temporaryPath, finalizedPath)
          await renameFile(finalizedPath, writer.path)
          await unlink(writer.temporaryPath).catch(() => undefined)
        } catch (error) {
          await unlink(finalizedPath).catch(() => undefined)
          throw error
        }
      } else {
        await renameFile(writer.temporaryPath, writer.path)
      }
      recordingWriters.delete(recordingId as string)
      shell.showItemInFolder(writer.path)
      return { path: writer.path, bytes: writer.bytes }
    } catch (error) {
      await discardRecordingWriter(recordingId as string, writer)
      throw error
    }
  })
  ipcMain.handle('recordings:abort', async (event, recordingId: unknown): Promise<void> => {
    if (typeof recordingId !== 'string') throw new Error('无效的录制会话')
    const writer = recordingWriters.get(recordingId)
    if (!writer) return
    if (writer.senderId !== event.sender.id) throw new Error('录制会话已失效')
    await discardRecordingWriter(recordingId, writer)
  })
  ipcMain.handle('logging:copy-report', (_event, rendererDump: unknown): void => {
    if (typeof rendererDump !== 'string') throw new Error('无效的日志数据')
    clipboard.writeText([
      '=== GuEarth 诊断日志 ===',
      `版本 ${app.getVersion()} | Electron ${process.versions.electron} | Chrome ${process.versions.chrome} | Node ${process.versions.node} | ${process.platform} ${process.getSystemVersion()}`,
      `生成时间 ${new Date().toLocaleString()}`,
      '',
      '== 渲染进程 ==',
      rendererDump || '（无日志）',
      '',
      '== 主进程 ==',
      logger.dump() || '（无日志）'
    ].join('\n'))
  })
}

function stopOffscreenRecordingWindow(): void {
  const window = offscreenRecordingWindow
  offscreenRecordingWindow = null
  if (!window || window.isDestroyed()) return
  if (!window.webContents.isDestroyed()) window.webContents.stopPainting()
  window.destroy()
}

async function startOffscreenRecordingWindow(script?: OffscreenRecordingScript): Promise<OffscreenRecordingProbeResult> {
  stopOffscreenRecordingWindow()
  const targetWidth = script?.width ?? 1280
  const targetHeight = script?.height ?? 720
  const targetFps = script?.fps ?? 30
  const window = new BrowserWindow({
    show: false,
    width: targetWidth,
    height: targetHeight,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      offscreen: true,
      backgroundThrottling: false,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  offscreenRecordingWindow = window
  offscreenPaintStartedAt = Date.now()
  offscreenPaintFrames = 0
  window.webContents.on('paint', () => {
    offscreenPaintFrames += 1
  })
  window.webContents.setFrameRate(targetFps)
  const ready = new Promise<void>((resolve, reject) => {
    window.webContents.once('did-finish-load', () => resolve())
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)))
  })
  const loading = process.env['ELECTRON_RENDERER_URL']
    ? window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/offscreen.html`)
    : window.loadFile(join(__dirname, '../renderer/offscreen.html'))
  await Promise.all([loading, ready])
  if (script) {
    const serialized = JSON.stringify(script).replace(/</g, '\\u003c')
    await window.webContents.executeJavaScript(`window.guEarthOffscreenRecorder.play(${serialized})`)
  }
  offscreenPaintStartedAt = Date.now()
  offscreenPaintFrames = 0
  window.webContents.startPainting()
  const durationMs = script ? offscreenSceneDurationMs(script) : 1000
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  const elapsed = Math.max(1, Date.now() - offscreenPaintStartedAt)
  const result = { fps: Math.round(offscreenPaintFrames * 1000 / elapsed), frames: offscreenPaintFrames }
  stopOffscreenRecordingWindow()
  return result
}

function offscreenRecordingStats(): { fps: number; frames: number } {
  const elapsed = Math.max(1, Date.now() - offscreenPaintStartedAt)
  return { fps: Math.round(offscreenPaintFrames * 1000 / elapsed), frames: offscreenPaintFrames }
}

const OFFSCREEN_TERRAIN_PROVIDER_IDS = new Set(['ellipsoid', 'arcgis-terrain', 'cesium-world-terrain'])

function normalizeOffscreenTerrain(value: unknown): OffscreenRecordingScript['terrain'] {
  if (!isRecord(value)) return { providerId: 'ellipsoid', exaggeration: 1, lighting: false }
  return {
    providerId: typeof value.providerId === 'string' && OFFSCREEN_TERRAIN_PROVIDER_IDS.has(value.providerId) ? value.providerId : 'ellipsoid',
    exaggeration: normalizeNumber(value.exaggeration, 1, 5, 1),
    lighting: value.lighting === true
  }
}

function normalizeOffscreenRecordingScript(value: unknown): OffscreenRecordingScript {
  if (!isRecord(value) || !Array.isArray(value.scenes)) throw new Error('无效的离屏录制脚本')
  const sceneDocument = normalizeSceneDocument({ scenes: value.scenes })
  return {
    title: typeof value.title === 'string' ? value.title.slice(0, 120) : '',
    scenes: sceneDocument.scenes,
    annotations: Array.isArray(value.annotations) ? value.annotations.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.sceneId !== 'string' || typeof entry.name !== 'string' || !Array.isArray(entry.positions)) return []
      if (entry.kind !== 'point' && entry.kind !== 'polyline' && entry.kind !== 'polygon') return []
      const positions = entry.positions.flatMap((position) => isRecord(position) ? [{ longitude: normalizeNumber(position.longitude, -180, 180, 0), latitude: normalizeNumber(position.latitude, -90, 90, 0), height: normalizeNumber(position.height, -10000, 100000000, 0) }] : [])
      return positions.length ? [{ sceneId: entry.sceneId, kind: entry.kind, name: entry.name.slice(0, 120), positions }] : []
    }) : [],
    terrain: normalizeOffscreenTerrain(value.terrain),
    width: Math.min(1920, Math.max(320, Math.round(normalizeNumber(value.width, 320, 1920, 1280)))),
    height: Math.min(1080, Math.max(240, Math.round(normalizeNumber(value.height, 240, 1080, 720)))),
    fps: Math.min(60, Math.max(1, Math.round(normalizeNumber(value.fps, 1, 60, 30))))
  }
}

function offscreenSceneDurationMs(script: OffscreenRecordingScript): number {
  return offscreenScriptDurationMs(script.scenes)
}

async function readFileSize(path: string): Promise<number> {
  return (await stat(path)).size
}

function encodeOffscreenRecording(script: OffscreenRecordingScript): Promise<RecordingSaveResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    let tempDir: string | null = null
    let ffmpeg: ReturnType<typeof spawn> | null = null
    let recorderWindow: BrowserWindow | null = null
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      if (cancelOffscreenRecording === cancel) cancelOffscreenRecording = null
      stopOffscreenRecordingWindow()
      if (ffmpeg && !ffmpeg.killed) ffmpeg.kill()
      if (tempDir) void rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const cancel = (): void => fail(new Error('录制已取消'))
    cancelOffscreenRecording = cancel
    void (async () => {
      stopOffscreenRecordingWindow()
      const directory = await usableRecordingDirectory()
      if (settled) return
      if (!directory) throw new Error('请先选择可用的视频保存文件夹')
      tempDir = await mkdtemp(join(directory, '.guearth-offscreen-'))
      if (settled) return
      const frameDirectory = tempDir
      const temporaryPath = join(frameDirectory, 'recording.mp4.part')
      const now = new Date()
      const pad = (value: number): string => String(value).padStart(2, '0')
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const outputPath = join(directory, `GuEarth-${stamp}-${randomUUID().slice(0, 8)}.mp4`)
      const targetFps = script.fps
      recorderWindow = new BrowserWindow({
        show: false,
        width: script.width,
        height: script.height,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          offscreen: true,
          backgroundThrottling: false,
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      const window = recorderWindow
      offscreenRecordingWindow = window
      offscreenPaintStartedAt = Date.now()
      offscreenPaintFrames = 0
      let frameIndex = 0
      let frameWrite: Promise<void> = Promise.resolve()
      let frameWriting = false
      const framePattern = join(frameDirectory, 'frame-%08d.jpg')
      window.webContents.on('paint', (_event, _dirty, image) => {
        offscreenPaintFrames += 1
        if (settled || frameWriting || image.isEmpty()) return
        const frame = image.resize({ width: script.width, height: script.height }).toJPEG(95)
        if (frame.length === 0) return
        frameWriting = true
        const framePath = join(frameDirectory, `frame-${String(frameIndex).padStart(8, '0')}.jpg`)
        frameIndex += 1
        frameWrite = frameWrite.then(() => writeFile(framePath, frame)).catch((error) => { fail(error) }).finally(() => {
          frameWriting = false
          if (!settled && !window.isDestroyed()) window.webContents.startPainting()
        })
        window.webContents.stopPainting()
      })
      const ready = new Promise<void>((resolveReady, rejectReady) => {
        window.webContents.once('did-finish-load', () => resolveReady())
        window.webContents.once('did-fail-load', (_event, code, description) => rejectReady(new Error(`${code}: ${description}`)))
      })
      const loading = process.env['ELECTRON_RENDERER_URL']
        ? window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/offscreen.html`)
        : window.loadFile(join(__dirname, '../renderer/offscreen.html'))
      await Promise.all([loading, ready])
      if (settled) return
      window.webContents.setFrameRate(targetFps)
      const serialized = JSON.stringify(script).replace(/</g, '\\u003c')
      offscreenPaintStartedAt = Date.now()
      const recordingStartedAt = Date.now()
      window.webContents.startPainting()
      await window.webContents.executeJavaScript(`window.guEarthOffscreenRecorder.play(${serialized})`)
      const recordingElapsedMs = Math.max(1, Date.now() - recordingStartedAt)
      if (settled) return
      window.webContents.stopPainting()
      await frameWrite
      if (settled) return
      if (frameIndex === 0) {
        fail(new Error('离屏渲染未产生有效视频帧'))
        return
      }
      const encodedFps = offscreenFrameRate(frameIndex, recordingElapsedMs)
      const stderr: Buffer[] = []
      const encoder = spawn(ffmpegPath(), [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-framerate', encodedFps.toFixed(6), '-i', framePattern,
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', temporaryPath
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      ffmpeg = encoder
      encoder.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
      const code = await new Promise<number | null>((resolveClose, rejectClose) => {
        encoder.once('error', rejectClose)
        encoder.once('close', resolveClose)
      }).catch((error) => { throw error instanceof Error ? error : new Error(String(error)) })
      if (settled) return
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim()
        fail(new Error(`离屏视频编码失败（FFmpeg 退出码 ${code ?? '未知'}）${detail ? `：${detail.slice(-1000)}` : ''}`))
        return
      }
      const bytes = await readFileSize(temporaryPath)
      if (settled) return
      if (bytes === 0) {
        fail(new Error('未能生成离屏视频数据'))
        return
      }
      await renameFile(temporaryPath, outputPath)
      if (settled) return
      await rm(frameDirectory, { recursive: true, force: true }).catch(() => undefined)
      stopOffscreenRecordingWindow()
      if (cancelOffscreenRecording === cancel) cancelOffscreenRecording = null
      if (settled) return
      settled = true
      shell.showItemInFolder(outputPath)
      resolve({ path: outputPath, bytes })
    })().catch((error) => fail(error))
  })
}

function createOffscreenSelfTestScript(): OffscreenRecordingScript {
  const now = Date.now()
  return {
    title: 'Offscreen Recording Self Test',
    width: 640,
    height: 360,
    fps: 15,
    annotations: [],
    terrain: { providerId: 'ellipsoid', exaggeration: 1, lighting: false },
    scenes: [
      {
        id: 'offscreen-self-test',
        name: '离屏录制自测',
        narration: '',
        dwellMs: 1000,
        flyDurationMs: 500,
        createdAt: now,
        snapshot: {
          camera: { longitude: 105, latitude: 35, height: 15000000, heading: 0, pitch: -90 },
          basemapId: 'osm',
          overlays: [],
          month: 7,
          simTime: null,
          motionPanel: null
        }
      }
    ]
  }
}

async function runOffscreenSelfTest(): Promise<RecordingSaveResult> {
  const previousDirectory = settings.recordingDirectory
  const directory = await mkdtemp(join(tmpdir(), 'guearth-offscreen-test-'))
  settings.recordingDirectory = directory
  try {
    return await encodeOffscreenRecording(createOffscreenSelfTestScript())
  } finally {
    settings.recordingDirectory = previousDirectory
  }
}

function displayAppName(): string {
  return app.getLocale().toLowerCase().startsWith('zh') ? '咕咕地球' : 'GuEarth'
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: displayAppName(),
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('page-title-updated', (event) => event.preventDefault())

  win.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('window', `渲染进程退出（${details.reason}）`, `exitCode=${details.exitCode}`)
    Sentry.captureMessage(`渲染进程退出：${details.reason}`, { level: 'fatal', extra: { exitCode: details.exitCode } })
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    logger.error('window', '页面加载失败', `${errorCode} ${errorDescription} ${validatedURL}`)
    Sentry.captureMessage('渲染页面加载失败', { level: 'error', extra: { errorCode, errorDescription, url: validatedURL } })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  logger.info('app', '应用启动', `version=${app.getVersion()} packaged=${app.isPackaged}`)
  const userDataPath = app.getPath('userData')
  settingsPath = join(userDataPath, 'settings.json')
  tileCachePath = join(userDataPath, 'tile-cache')
  annotationsPath = join(userDataPath, 'annotations.json')
  scenesPath = join(userDataPath, 'scenes.json')
  initKeyVault(join(userDataPath, 'credentials'))
  initDatasets(userDataPath)
  await mkdir(tileCachePath, { recursive: true })
  settings = await readSettings()
  await applyNetworkProxy()
  const loaded = await Promise.all([
    readAnnotations(),
    readScenes(),
    aiSettings.init(join(userDataPath, 'ai-settings.json')),
    aiChatHistory.init(join(userDataPath, 'ai-chat-history.json')),
    aiMemories.init(join(userDataPath, 'ai-memories.json'))
  ])
  ;[annotations, scenes] = loaded
  registerIpcHandlers()
  registerAiIpcHandlers(aiSettings, aiChatHistory, aiMemories)
  initUpdater(join(userDataPath, 'updates'))
  logger.info('app', '主进程服务就绪')
  protocol.handle('guearth-tile', async (request) => {
    const response = await handleTileProtocol(request)
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void flushJsonWrites().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let gpuCrashReportedAt = 0

app.on('child-process-gone', (_event, details) => {
  if (details.type !== 'GPU') return
  logger.error('gpu', `GPU 进程退出（${details.reason}）`, `exitCode=${details.exitCode}`)
  if (Date.now() - gpuCrashReportedAt < 60_000) return
  gpuCrashReportedAt = Date.now()
  Sentry.captureMessage(`GPU 进程退出：${details.reason}`, { level: 'error', extra: { exitCode: details.exitCode } })
})
