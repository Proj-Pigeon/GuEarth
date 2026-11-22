import { createHash } from 'crypto'

import { net } from 'electron'

import type { PlaceSearchResult, PlaceSuggestion } from '../../preload'
import { gcj02ToWgs84 } from '../geo'
import { readProviderKey } from '../keyVault'
import { createSearchThrottle, delay, isPlacesRequestSuperseded } from './searchThrottle'

interface BaiduSuggestion {
  name?: unknown
  province?: unknown
  city?: unknown
  district?: unknown
  address?: unknown
  tag?: unknown
  location?: unknown
}

interface BaiduSuggestionsResponse {
  results: BaiduSuggestion[]
  error?: string
  retryable?: boolean
}

const SEARCH_MIN_INTERVAL_MS = 1_000
const SEARCH_MAX_RETRIES = 2
const SEARCH_RETRY_DELAY_MS = 2_000
const SEARCH_REQUEST_TIMEOUT_MS = 10_000
const SUGGEST_PATH = '/place/v3/suggestion'
const baiduThrottle = createSearchThrottle(SEARCH_MIN_INTERVAL_MS)

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function toPlaces(results: BaiduSuggestion[]): PlaceSuggestion[] {
  return results.flatMap(result => {
    if (typeof result.location !== 'object' || result.location === null) return []
    const location = result.location as { lng?: unknown; lat?: unknown }
    const longitude = location.lng
    const latitude = location.lat
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return []
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return []
    if (
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90 ||
      !text(result.name).trim()
    )
      return []
    const [wgsLongitude, wgsLatitude] = gcj02ToWgs84(longitude, latitude)
    return [
      {
        name: text(result.name),
        province: text(result.province),
        city: text(result.city),
        district: text(result.district),
        address: text(result.address),
        type: text(result.tag),
        longitude: roundCoordinate(wgsLongitude),
        latitude: roundCoordinate(wgsLatitude)
      }
    ]
  })
}

function parseSuggestions(body: unknown): BaiduSuggestionsResponse {
  if (typeof body !== 'object' || body === null) return { results: [], error: '百度返回了无效响应' }
  const result = body as { status?: unknown; message?: unknown; results?: unknown }
  if (result.status !== 0) {
    const message = text(result.message) || '未知错误'
    const code =
      typeof result.status === 'number' || typeof result.status === 'string'
        ? ` (${result.status})`
        : ''
    return { results: [], error: `百度地点搜索失败：${message}${code}` }
  }
  if (!Array.isArray(result.results)) return { results: [], error: '百度返回了无效地点数据' }
  return {
    results: result.results.filter(
      (item): item is BaiduSuggestion => typeof item === 'object' && item !== null
    )
  }
}

async function requestSuggestions(url: string): Promise<BaiduSuggestionsResponse> {
  try {
    const response = await net.fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) {
      return {
        results: [],
        error: `百度地点搜索请求失败 (HTTP ${response.status})`,
        retryable: response.status === 429 || response.status >= 500
      }
    }
    return parseSuggestions(await response.json())
  } catch {
    return { results: [], error: '百度地点搜索请求超时或网络异常，请稍后重试', retryable: true }
  }
}

function suggestUrl(keywords: string, key: string, securityKey?: string): string {
  const params: Record<string, string> = {
    query: keywords,
    region: '全国',
    region_limit: 'false',
    ak: key,
    ret_coordtype: 'gcj02ll',
    output: 'json'
  }
  if (securityKey) params.timestamp = String(Math.floor(Date.now() / 1000))
  const query = Object.entries(params)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&')
  if (!securityKey) return `https://api.map.baidu.com${SUGGEST_PATH}?${query}`
  const sn = createHash('md5')
    .update(encodeURIComponent(`${SUGGEST_PATH}?${query}${securityKey}`))
    .digest('hex')
  return `https://api.map.baidu.com${SUGGEST_PATH}?${query}&sn=${sn}`
}

export async function searchBaiduPlaces(
  query: string,
  requestId?: number
): Promise<PlaceSearchResult> {
  const keywords = query.trim().slice(0, 90)
  if (!keywords) return { query, places: [], error: '缺少搜索关键词' }
  const isSuperseded = (): boolean => isPlacesRequestSuperseded(requestId)
  if (isSuperseded()) return { query, places: [], superseded: true }
  const key = readProviderKey('baidu')
  if (!key)
    return {
      query,
      places: [],
      error: '未配置百度地图 API Key：请在「图层管理 → 供应商密钥」中保存 API Key'
    }
  const securityKey = readProviderKey('baidu-sk')
  const first = await baiduThrottle.run(
    () => requestSuggestions(suggestUrl(keywords, key, securityKey)),
    isSuperseded
  )
  if (!first) return { query, places: [], superseded: true }
  let result = first
  for (
    let attempt = 1;
    result.error !== undefined && result.retryable === true && attempt <= SEARCH_MAX_RETRIES;
    attempt += 1
  ) {
    await delay(SEARCH_RETRY_DELAY_MS * attempt)
    const next = await baiduThrottle.run(
      () => requestSuggestions(suggestUrl(keywords, key, securityKey)),
      isSuperseded
    )
    if (!next) return { query, places: [], superseded: true }
    result = next
  }
  if (result.error) return { query, places: [], error: result.error }
  const places = toPlaces(result.results).slice(0, 10)
  if (places.length === 0)
    return { query, places: [], note: '没有找到匹配的地点，可换个说法或切换搜索源' }
  return { query, places }
}
