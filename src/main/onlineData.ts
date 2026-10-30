import { createHash } from 'crypto'
import { join } from 'path'
import type { EarthquakeFeed } from '../preload'
import type { OnlineDataSnapshot, TyphoonFeed } from '../common/onlineData'
import { loadEarthquakeFeed } from './datasets'
import { getQWeatherCredentials } from './laboratory'
import { fetchTyphoonFeed, parseCachedTyphoons } from './qweather'
import { readJson, writeJson } from './jsonStore'

let startupData: Promise<OnlineDataSnapshot> | null = null
let dataPath = ''
let typhoonRequest: Promise<OnlineDataSnapshot> | null = null
let typhoonController: AbortController | null = null
let onChange: (snapshot: OnlineDataSnapshot) => void = () => {}
let snapshot: OnlineDataSnapshot = {
  revision: 0, earthquakes: null, earthquakeError: '', typhoons: null,
  typhoonError: '', typhoonConfigured: false, typhoonStatus: 'pending'
}

type TyphoonSnapshot = Pick<OnlineDataSnapshot, 'typhoons' | 'typhoonError' | 'typhoonConfigured' | 'typhoonStatus'>

function publish(patch: Partial<OnlineDataSnapshot>): void {
  snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 }
  onChange(snapshot)
}

async function loadTyphoons(signal: AbortSignal): Promise<TyphoonSnapshot> {
  let cached: TyphoonFeed | null = null
  try {
    const credentials = getQWeatherCredentials()
    if (!credentials) return { typhoons: null, typhoonError: '', typhoonConfigured: false, typhoonStatus: 'unconfigured' }
    const hostId = createHash('sha256').update(credentials.apiHost).digest('hex').slice(0, 16)
    const cachePath = join(dataPath, `typhoons-${hostId}.json`)
    cached = parseCachedTyphoons(await readJson(cachePath).catch(() => null))
    signal.throwIfAborted()
    const typhoons = await fetchTyphoonFeed(credentials, signal)
    signal.throwIfAborted()
    await writeJson(cachePath, typhoons).catch(() => undefined)
    return { typhoons, typhoonError: '', typhoonConfigured: true, typhoonStatus: 'ready' }
  } catch (error) {
    return { typhoons: cached, typhoonError: error instanceof Error ? error.message : '台风数据获取失败', typhoonConfigured: true, typhoonStatus: 'error' }
  }
}

export function invalidateTyphoons(configured: boolean): void {
  typhoonController?.abort()
  typhoonController = null
  typhoonRequest = null
  publish({ typhoons: null, typhoonError: '', typhoonConfigured: configured, typhoonStatus: configured ? 'pending' : 'unconfigured' })
}

export function ensureTyphoons(retry = false): Promise<OnlineDataSnapshot> {
  if (typhoonRequest) return typhoonRequest
  if (snapshot.typhoonStatus !== 'pending' && !(retry && snapshot.typhoonStatus === 'error')) return Promise.resolve(snapshot)
  const controller = new AbortController()
  typhoonController = controller
  publish({ typhoonStatus: 'loading' })
  const request = loadTyphoons(controller.signal).then((typhoons) => {
    if (!controller.signal.aborted) publish(typhoons)
    return snapshot
  }).finally(() => {
    if (typhoonRequest === request) {
      typhoonRequest = null
      typhoonController = null
    }
  })
  typhoonRequest = request
  return request
}

export function startOnlineData(userDataPath: string, listener: (snapshot: OnlineDataSnapshot) => void = () => {}): Promise<OnlineDataSnapshot> {
  if (!startupData) {
    dataPath = userDataPath
    onChange = listener
    startupData = Promise.all([
      loadEarthquakeFeed().then((earthquakes) => publish({ earthquakes, earthquakeError: earthquakes.stale ? 'USGS 本次刷新失败，显示缓存地震数据' : '' }))
        .catch(() => publish({ earthquakes: null, earthquakeError: 'USGS 地震数据获取失败，请检查网络后重新启动' })),
      ensureTyphoons()
    ]).then(() => snapshot)
  }
  return startupData
}

export async function getOnlineData(): Promise<OnlineDataSnapshot> {
  if (!startupData) throw new Error('在线数据尚未初始化')
  await startupData
  return snapshot
}

export async function getStartupEarthquakes(): Promise<EarthquakeFeed> {
  const data = await getOnlineData()
  if (!data.earthquakes) throw new Error(data.earthquakeError)
  return data.earthquakes
}
