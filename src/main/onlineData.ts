import { createHash } from 'crypto'
import { join } from 'path'
import type { EarthquakeFeed } from '../preload'
import type { OnlineDataSnapshot, TyphoonFeed } from '../common/onlineData'
import { loadEarthquakeFeed } from './datasets'
import { getQWeatherCredentials } from './laboratory'
import { fetchTyphoonFeed, parseCachedTyphoons } from './qweather'
import { readJson, writeJson } from './jsonStore'

let startupData: Promise<OnlineDataSnapshot> | null = null

async function loadTyphoons(userDataPath: string): Promise<Pick<OnlineDataSnapshot, 'typhoons' | 'typhoonError' | 'typhoonConfigured'>> {
  let cached: TyphoonFeed | null = null
  try {
    const credentials = getQWeatherCredentials()
    if (!credentials) return { typhoons: null, typhoonError: '', typhoonConfigured: false }
    const hostId = createHash('sha256').update(credentials.apiHost).digest('hex').slice(0, 16)
    const cachePath = join(userDataPath, `typhoons-${hostId}.json`)
    cached = parseCachedTyphoons(await readJson(cachePath).catch(() => null))
    const typhoons = await fetchTyphoonFeed(credentials)
    await writeJson(cachePath, typhoons).catch(() => undefined)
    return { typhoons, typhoonError: '', typhoonConfigured: true }
  } catch (error) {
    return { typhoons: cached, typhoonError: error instanceof Error ? error.message : '台风数据获取失败', typhoonConfigured: true }
  }
}

export function startOnlineData(userDataPath: string): Promise<OnlineDataSnapshot> {
  if (!startupData) {
    startupData = Promise.all([
      loadEarthquakeFeed().then((earthquakes) => ({ earthquakes, earthquakeError: earthquakes.stale ? 'USGS 本次刷新失败，显示缓存地震数据' : '' }))
        .catch(() => ({ earthquakes: null, earthquakeError: 'USGS 地震数据获取失败，请检查网络后重新启动' })),
      loadTyphoons(userDataPath)
    ]).then(([earthquakes, typhoons]) => ({ ...earthquakes, ...typhoons }))
  }
  return startupData
}

export function getOnlineData(): Promise<OnlineDataSnapshot> {
  if (!startupData) throw new Error('在线数据尚未初始化')
  return startupData
}

export async function getStartupEarthquakes(): Promise<EarthquakeFeed> {
  const snapshot = await getOnlineData()
  if (!snapshot.earthquakes) throw new Error(snapshot.earthquakeError)
  return snapshot.earthquakes
}
