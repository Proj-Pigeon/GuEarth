import { net } from 'electron'
import { normalizeQWeatherHost, type LiveStorm, type StormPoint, type TyphoonFeed } from '../common/onlineData'
import type { QWeatherCredentials } from './laboratory'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parsePoint(value: unknown, timeKey: 'time' | 'pubTime' | 'fxTime'): StormPoint {
  if (!isRecord(value)) throw new Error('和风天气台风路径格式无效')
  const longitude = numberValue(value.lon)
  const latitude = numberValue(value.lat)
  const time = value[timeKey]
  if (longitude === null || latitude === null || Math.abs(longitude) > 180 || Math.abs(latitude) > 90
    || typeof time !== 'string' || !Number.isFinite(Date.parse(time))) throw new Error('和风天气台风坐标或时间无效')
  const pressure = numberValue(value.pressure)
  const windSpeed = numberValue(value.windSpeed)
  return {
    time: new Date(time).toISOString(), longitude, latitude,
    type: typeof value.type === 'string' ? value.type.slice(0, 32) : 'UNKNOWN',
    pressure: pressure !== null && pressure > 0 ? pressure : null,
    windSpeed: windSpeed !== null && windSpeed >= 0 ? windSpeed : null
  }
}

function parsePoints(value: unknown, timeKey: 'time' | 'fxTime'): StormPoint[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('和风天气台风路径格式无效')
  const points = value.map((point) => parsePoint(point, timeKey))
  return [...new Map(points.map((point) => [point.time, point])).values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

export function parseStormList(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value) || value.length > 200) throw new Error('和风天气台风列表格式无效')
  return value.flatMap((storm) => {
    if (!isRecord(storm) || !['0', '1'].includes(String(storm.isActive)) || typeof storm.id !== 'string'
      || !/^[a-z0-9_-]{1,64}$/i.test(storm.id)) throw new Error('和风天气台风列表格式无效')
    if (String(storm.isActive) !== '1') return []
    return [{ id: storm.id, name: typeof storm.name === 'string' && storm.name ? storm.name.slice(0, 100) : storm.id }]
  })
}

export function parseStormTrack(id: string, name: string, value: unknown): LiveStorm {
  if (!isRecord(value) || !['0', '1'].includes(String(value.isActive))) throw new Error('和风天气台风实况格式无效')
  return {
    id, name, active: String(value.isActive) === '1',
    now: value.now == null ? null : parsePoint(value.now, 'pubTime'),
    track: parsePoints(value.track, 'time'), forecast: [], forecastError: ''
  }
}

export function parseStormForecast(value: unknown): StormPoint[] {
  return value == null ? [] : parsePoints(value, 'fxTime')
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 512)) : []
}

function apiError(code: string): Error {
  const reason: Record<string, string> = {
    '400': '请求参数无效', '401': '认证失败，请检查 API Key',
    '402': '额度不足，请检查账户余额', '403': '没有台风接口权限，请检查订阅与 API Host',
    '404': '数据不存在', '429': '请求限额已达上限'
  }
  return new Error(`和风天气：${reason[code] ?? `服务异常（${/^\d{3}$/.test(code) ? code : '未知状态'}）`}`)
}

export async function fetchTyphoonFeed(credentials: QWeatherCredentials, cancellation?: AbortSignal): Promise<TyphoonFeed> {
  const host = normalizeQWeatherHost(credentials.apiHost)
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000), ...(cancellation ? [cancellation] : [])])
  const sources = new Set<string>()
  const license = new Set<string>()
  async function request(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    signal.throwIfAborted()
    let response: Response
    try {
      response = await net.fetch(`https://${host}/v7/tropical/${endpoint}?${new URLSearchParams({ ...params, unit: 'm' })}`, {
        headers: { 'X-QW-Api-Key': credentials.apiKey }, redirect: 'error', signal
      })
    } catch {
      throw new Error(signal.aborted ? '和风天气请求超时' : '和风天气连接失败，请检查网络和 API Host')
    }
    if (!response.ok) throw apiError(String(response.status))
    if (response.status === 204) return { storm: [], forecast: [] }
    const body = await response.text()
    if (body.length > 5_000_000) throw new Error('和风天气响应过大')
    let data: unknown
    try { data = JSON.parse(body) } catch { throw new Error('和风天气响应不是有效 JSON') }
    if (!isRecord(data)) throw new Error('和风天气响应格式无效')
    const code = String(data.code)
    if (code === '204') return { storm: [], forecast: [] }
    if (code !== '200') throw apiError(code)
    if (isRecord(data.refer)) {
      strings(data.refer.sources).forEach((source) => sources.add(source))
      strings(data.refer.license).forEach((item) => license.add(item))
    }
    return data
  }
  try {
    const year = new Date().getUTCFullYear()
    const lists = await Promise.all([year, year - 1].map(async (value) => parseStormList((await request('storm-list', { basin: 'NP', year: String(value) })).storm)))
    const storms = [...new Map(lists.flat().map((storm) => [storm.id, storm])).values()]
    const results: LiveStorm[] = []
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(3, storms.length) }, async () => {
      while (cursor < storms.length) {
        const storm = storms[cursor++]
        const track = parseStormTrack(storm.id, storm.name, await request('storm-track', { stormid: storm.id }))
        if (track.active) {
          try {
            track.forecast = parseStormForecast((await request('storm-forecast', { stormid: storm.id })).forecast)
              .filter((point) => !track.now || Date.parse(point.time) > Date.parse(track.now.time))
          } catch (error) {
            track.forecastError = error instanceof Error ? error.message : '台风预报获取失败'
          }
        }
        results.push(track)
      }
    }))
    return { fetchedAt: Date.now(), storms: results.sort((a, b) => a.id.localeCompare(b.id)), sources: [...sources], license: [...license] }
  } finally {
    controller.abort()
  }
}

export function parseCachedTyphoons(value: unknown): TyphoonFeed | null {
  if (!isRecord(value) || typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt)
    || !Array.isArray(value.storms) || value.storms.length > 200) return null
  try {
    const fromCachedPoint = (point: unknown): StormPoint => {
      if (!isRecord(point)) throw new Error('无效缓存')
      return parsePoint({ ...point, lon: point.longitude, lat: point.latitude }, 'time')
    }
    const storms: LiveStorm[] = value.storms.map((storm) => {
      if (!isRecord(storm) || typeof storm.id !== 'string' || typeof storm.name !== 'string' || typeof storm.active !== 'boolean'
        || !Array.isArray(storm.track) || !Array.isArray(storm.forecast) || storm.track.length > 5000 || storm.forecast.length > 5000) throw new Error('无效缓存')
      return {
        id: storm.id, name: storm.name, active: storm.active, now: storm.now === null ? null : fromCachedPoint(storm.now),
        track: storm.track.map(fromCachedPoint), forecast: storm.forecast.map(fromCachedPoint),
        forecastError: typeof storm.forecastError === 'string' ? storm.forecastError : ''
      }
    })
    return { fetchedAt: value.fetchedAt, storms, sources: strings(value.sources), license: strings(value.license) }
  } catch { return null }
}
