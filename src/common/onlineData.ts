import type { EarthquakeFeed } from '../preload'

export interface LaboratoryProvider {
  category: 'weather'
  provider: 'qweather'
  apiHost: string
  configured: boolean
}

export interface LaboratoryProviderInput {
  category: 'weather'
  provider: 'qweather'
  apiHost: string
  apiKey?: string
}

export interface StormPoint {
  time: string
  longitude: number
  latitude: number
  type: string
  pressure: number | null
  windSpeed: number | null
}

export interface LiveStorm {
  id: string
  name: string
  active: boolean
  now: StormPoint | null
  track: StormPoint[]
  forecast: StormPoint[]
  forecastError: string
}

export interface TyphoonFeed {
  fetchedAt: number
  storms: LiveStorm[]
  sources: string[]
  license: string[]
}

export interface OnlineDataSnapshot {
  revision: number
  earthquakes: EarthquakeFeed | null
  earthquakeError: string
  typhoons: TyphoonFeed | null
  typhoonError: string
  typhoonConfigured: boolean
  typhoonStatus: 'unconfigured' | 'pending' | 'loading' | 'ready' | 'error'
}

export function validateQWeatherApiKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(value.trim())) {
    throw new Error('API Key 仅支持可见 ASCII 字符，长度 1-512，且不能包含空格或换行')
  }
  return value.trim()
}

export function normalizeQWeatherHost(value: unknown): string {
  if (typeof value !== 'string') throw new Error('请输入和风天气 API Host')
  const host = value.trim().replace(/^https:\/\//i, '').replace(/\/$/, '').toLowerCase()
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*qweatherapi\.com$/.test(host)) {
    throw new Error('API Host 必须为 qweatherapi.com 或其子域名，不含路径或端口')
  }
  return host
}
