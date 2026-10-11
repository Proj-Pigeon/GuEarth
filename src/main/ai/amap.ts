import { createHash } from 'crypto'
import { net } from 'electron'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../geo'
import { readProviderKey } from '../keyVault'
import { POI_CATEGORY_LABELS, poiBigCategory } from './poiCategories'
import { createSearchThrottle, delay, isPlacesRequestSuperseded } from './searchThrottle'

export interface AmapPlace {
  name: string
  province: string
  city: string
  district: string
  address: string
  type: string
  longitude: number
  latitude: number
}

export interface AmapSearchResult {
  query: string
  places: AmapPlace[]
  note?: string
  error?: string
  guidance?: string
  superseded?: boolean
}

interface AmapPoi {
  name?: unknown
  pname?: unknown
  cityname?: unknown
  adname?: unknown
  address?: unknown
  type?: unknown
  typecode?: unknown
  location?: unknown
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function toPlaces(pois: AmapPoi[]): AmapPlace[] {
  return pois.flatMap((poi) => {
    const location = typeof poi.location === 'string' ? poi.location.split(',') : []
    const longitude = Number(location[0])
    const latitude = Number(location[1])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return []
    const [wgsLongitude, wgsLatitude] = gcj02ToWgs84(longitude, latitude)
    const text = (value: unknown): string => (typeof value === 'string' ? value : '')
    return [{
      name: text(poi.name),
      province: text(poi.pname),
      city: text(poi.cityname),
      district: text(poi.adname),
      address: text(poi.address),
      type: text(poi.type),
      longitude: roundCoordinate(wgsLongitude),
      latitude: roundCoordinate(wgsLatitude)
    }]
  })
}

interface AmapPoisResponse {
  pois: AmapPoi[]
  total: number
  error?: string
  retryable?: boolean
}

function parsePois(body: unknown): AmapPoisResponse {
  if (typeof body !== 'object' || body === null) return { pois: [], total: 0, error: '高德返回了无效响应' }
  const result = body as { status?: unknown; info?: unknown; infocode?: unknown; count?: unknown; pois?: unknown }
  if (result.status !== '1') {
    if (result.infocode === '10009') return { pois: [], total: 0, error: '高德 Key 的平台类型不匹配，请在高德控制台配置「Web 服务」类型的 Key (10009)' }
    const info = typeof result.info === 'string' ? result.info : '未知错误'
    const code = typeof result.infocode === 'string' ? ` (${result.infocode})` : ''
    const retryable = !/DAILY/i.test(info) && /QPS|FREQUENT/i.test(info)
    return { pois: [], total: 0, error: `高德地点搜索失败：${info}${code}`, retryable }
  }
  if (!Array.isArray(result.pois)) return { pois: [], total: 0, error: '高德返回了无效地点数据' }
  const total = typeof result.count === 'string' || typeof result.count === 'number' ? Number(result.count) : 0
  return { pois: result.pois.filter((poi): poi is AmapPoi => typeof poi === 'object' && poi !== null), total: Number.isFinite(total) ? total : 0 }
}

async function requestPois(url: string): Promise<AmapPoisResponse> {
  try {
    const response = await net.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS) })
    if (!response.ok) {
      return {
        pois: [],
        total: 0,
        error: `高德地点搜索请求失败 (HTTP ${response.status})`,
        retryable: response.status === 429 || response.status >= 500
      }
    }
    return parsePois(await response.json())
  } catch {
    return { pois: [], total: 0, error: '高德地点搜索请求超时或网络异常，请稍后重试', retryable: true }
  }
}

function sortedParams(params: Record<string, string>): string {
  return Object.keys(params).sort().map((name) => `${name}=${params[name]}`).join('&')
}

function requestUrl(base: string, params: Record<string, string>, securityKey?: string): string {
  const query = Object.entries(params).map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  if (securityKey) {
    const sig = createHash('md5').update(`${sortedParams(params)}${securityKey}`, 'utf8').digest('hex')
    query.push(`sig=${sig}`)
  }
  return `${base}?${query.join('&')}`
}

const SEARCH_MIN_INTERVAL_MS = 1_000
const SEARCH_MAX_RETRIES = 2
const SEARCH_RETRY_DELAY_MS = 2_000
const SEARCH_REQUEST_TIMEOUT_MS = 10_000
const amapThrottle = createSearchThrottle(SEARCH_MIN_INTERVAL_MS)

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

const POI_STATS_MAX_SAMPLES = 900
const POI_STATS_PAGE_SIZE = 25
const POI_STATS_MAX_PAGES = 36

export async function poiStatistics(request: PoiStatisticsRequest): Promise<PoiStatisticsResult> {
  const key = readProviderKey('amap')
  const securityKey = readProviderKey('amap-sk')
  if (!key) {
    return {
      center: { name: request.centerName ?? '', longitude: request.longitude ?? 0, latitude: request.latitude ?? 0 },
      types: request.types ?? '',
      sampled: 0,
      total: 0,
      truncated: false,
      categories: [],
      error: '未配置高德地图 Web 服务密钥：请在「图层管理 → 供应商密钥」中保存 Web 服务 API Key'
    }
  }
  const centerName = request.centerName?.trim().slice(0, 40) ?? ''
  let longitude = request.longitude
  let latitude = request.latitude
  let resolvedName = centerName
  if ((longitude === undefined || latitude === undefined) && centerName) {
    const located = await searchPlaces(centerName, request.city)
    if (located.error || located.places.length === 0) {
      return {
        center: { name: centerName, longitude: longitude ?? 0, latitude: latitude ?? 0 },
        types: request.types ?? '',
        sampled: 0,
        total: 0,
        truncated: false,
        categories: [],
        error: located.error ?? `未找到地点「${centerName}」`
      }
    }
    longitude = located.places[0].longitude
    latitude = located.places[0].latitude
    resolvedName = located.places[0].name
  }
  if (longitude === undefined || latitude === undefined) {
    return {
      center: { name: resolvedName, longitude: longitude ?? 0, latitude: latitude ?? 0 },
      types: request.types ?? '',
      sampled: 0,
      total: 0,
      truncated: false,
      categories: [],
      error: '需要提供 centerName 或经纬度（longitude/latitude）'
    }
  }
  const radius = Math.round(Math.min(50_000, Math.max(200, request.radiusMeters ?? 3_000)))
  const maxSamples = Math.min(POI_STATS_MAX_SAMPLES, Math.max(POI_STATS_PAGE_SIZE, request.maxSamples ?? POI_STATS_MAX_SAMPLES))
  const types = request.types
    ?.split('|')
    .map((item) => item.trim())
    .filter((item) => /^\d{2}$|^\d{4}$|^\d{6}$/.test(item))
    .map((item) => item.padEnd(6, '0'))
    .join('|') ?? ''
  const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(longitude, latitude)
  const aroundParams: Record<string, string> = {
    key,
    location: `${roundCoordinate(gcjLongitude)},${roundCoordinate(gcjLatitude)}`,
    radius: String(radius),
    offset: String(POI_STATS_PAGE_SIZE),
    page: '1',
    extensions: 'base',
    sortrule: 'distance'
  }
  if (types) aroundParams.types = types
  if (request.keywords?.trim()) aroundParams.keywords = request.keywords.trim().slice(0, 40)
  const url = requestUrl('https://restapi.amap.com/v3/place/around', aroundParams, securityKey)
  const first = await amapThrottle.run(() => requestPois(url))
  if (!first) {
    return {
      center: { name: resolvedName, longitude, latitude },
      radiusMeters: radius,
      types,
      sampled: 0,
      total: 0,
      truncated: false,
      categories: [],
      error: 'POI 统计请求被取消'
    }
  }
  if (first.error) {
    return {
      center: { name: resolvedName, longitude, latitude },
      radiusMeters: radius,
      types,
      sampled: 0,
      total: 0,
      truncated: false,
      categories: [],
      error: first.error
    }
  }
  const counts = new Map<string, number>()
  let sampled = 0
  const collect = (pois: AmapPoi[]): void => {
    for (const poi of pois) {
      const code = poiBigCategory(poi)
      if (!code) continue
      counts.set(code, (counts.get(code) ?? 0) + 1)
      sampled += 1
    }
  }
  collect(first.pois)
  const reportedTotal = first.total > 0 ? first.total : first.pois.length
  const maxPages = Math.ceil(Math.min(reportedTotal, maxSamples) / POI_STATS_PAGE_SIZE)
  const pageCount = Math.min(POI_STATS_MAX_PAGES, maxPages)
  let pagesFetched = 1
  if (pageCount > 1) {
    for (let page = 2; page <= pageCount && sampled < maxSamples; page += 1) {
      const pageParams: Record<string, string> = { ...aroundParams, page: String(page) }
      const pageUrl = requestUrl('https://restapi.amap.com/v3/place/around', pageParams, securityKey)
      const pageResult = await amapThrottle.run(() => requestPois(pageUrl))
      if (!pageResult || pageResult.error || pageResult.pois.length === 0) break
      pagesFetched = page
      collect(pageResult.pois)
      if (pageResult.pois.length < POI_STATS_PAGE_SIZE) break
    }
  }
  const truncated = reportedTotal > pagesFetched * POI_STATS_PAGE_SIZE
  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: POI_CATEGORY_LABELS[code] ?? code, count }))
  const radiusNote = `以${resolvedName}为中心 ${radius} 米范围内的 POI 抽样统计（共 ${reportedTotal} 条，抽样 ${sampled} 条；受高德分页与配额限制，最多抽样 ${maxSamples} 条）`
  return {
    center: { name: resolvedName, longitude, latitude },
    radiusMeters: radius,
    city: request.city?.trim() || undefined,
    types: types || '全部大类',
    sampled,
    total: reportedTotal,
    truncated,
    categories,
    note: radiusNote
  }
}

export async function searchPlaces(query: string, city?: string, requestId?: number): Promise<AmapSearchResult> {
  const keywords = query.trim().slice(0, 90)
  if (!keywords) return { query, places: [], error: '缺少搜索关键词' }
  const isSuperseded = (): boolean => isPlacesRequestSuperseded(requestId)
  if (isSuperseded()) return { query, places: [], superseded: true }
  const key = readProviderKey('amap')
  const securityKey = readProviderKey('amap-sk')
  if (!key) {
    return {
      query,
      places: [],
      error: '未配置高德地图 Web 服务密钥：请在「图层管理 → 供应商密钥」中保存 Web 服务 API Key'
    }
  }
  const params: Record<string, string> = { key, keywords, offset: '8', page: '1', extensions: 'base' }
  if (city?.trim()) params.city = city.trim().slice(0, 40)
  const url = requestUrl('https://restapi.amap.com/v3/place/text', params, securityKey)
  const first = await amapThrottle.run(() => requestPois(url), isSuperseded)
  if (!first) return { query, places: [], superseded: true }
  let result = first
  for (let attempt = 1; result.error !== undefined && result.retryable === true && attempt <= SEARCH_MAX_RETRIES; attempt += 1) {
    await delay(SEARCH_RETRY_DELAY_MS * attempt)
    const next = await amapThrottle.run(() => requestPois(url), isSuperseded)
    if (!next) return { query, places: [], superseded: true }
    result = next
  }
  if (result.error) return { query, places: [], error: result.error }
  const places = toPlaces(result.pois).slice(0, 8)
  if (places.length === 0) return { query, places: [], note: '没有找到匹配的地点，可换个说法或切换搜索源' }
  return { query, places }
}
