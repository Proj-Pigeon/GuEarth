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
  earthquakes: EarthquakeFeed | null
  earthquakeError: string
  typhoons: TyphoonFeed | null
  typhoonError: string
  typhoonConfigured: boolean
}

export function normalizeQWeatherHost(value: unknown): string {
  if (typeof value !== 'string') throw new Error('请输入和风天气 API Host')
  const host = value.trim().replace(/^https:\/\//i, '').replace(/\/$/, '').toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.qweatherapi\.com$/.test(host)) {
    throw new Error('API Host 必须是和风天气控制台提供的 *.qweatherapi.com 域名，不含路径或端口')
  }
  return host
}
