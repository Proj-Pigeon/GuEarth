import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { compileFunction } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as shared from '../src/common/onlineData.ts'

const require = createRequire(import.meta.url)
function load(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } })
  const exports = {}
  compileFunction(outputText, ['require', 'exports', ...Object.keys(globals)])((id) => {
    if (id in dependencies) return dependencies[id]
    throw new Error(`Unexpected dependency: ${id}`)
  }, exports, ...Object.values(globals))
  return exports
}

const point = (time, extra = {}) => ({ time, lat: '18.5', lon: '130.2', type: 'STS', pressure: '980', windSpeed: '30', ...extra })
const now = { ...point(undefined), pubTime: '2026-10-30T08:00+08:00' }
const track = { isActive: '1', now, track: [point('2026-10-30T05:00+08:00')] }
const credentials = { apiHost: 'test.qweatherapi.com', apiKey: 'test-key-not-a-secret' }
const storm = { id: 'NP_2601', name: '测试台风', isActive: '1' }

function weather(respond, globals) {
  const requests = []
  const api = load('../src/main/qweather.ts', {
    electron: { net: { fetch: async (url, options) => { requests.push({ url, ...options }); return respond(new URL(url), options) } } },
    '../common/onlineData': shared
  }, globals)
  return { ...api, requests }
}

const ok = (data) => Response.json({ code: '200', ...data })

test('QWeather hosts accept only official HTTPS origins without paths, credentials or ports', () => {
  assert.equal(shared.normalizeQWeatherHost(' HTTPS://Test.qweatherapi.com/ '), 'test.qweatherapi.com')
  for (const value of ['http://test.qweatherapi.com', 'test.qweatherapi.com.evil.test', 'qweatherapi.com', '127.0.0.1', 'user@test.qweatherapi.com', 'test.qweatherapi.com:443', 'test.qweatherapi.com/v7', 'test.qweatherapi.com?key=abc', 'test.qweatherapi.com#fragment', 'test.qweatherapi.com\\evil', 'a.b.qweatherapi.com', null]) {
    assert.throws(() => shared.normalizeQWeatherHost(value))
  }
})

test('provider settings use the vault, never return keys, retain blank edits, and recover unreadable credentials', () => {
  const secrets = new Map()
  const api = load('../src/main/laboratory.ts', {
    '../common/onlineData': shared,
    './keyVault': {
      hasProviderKey: (id) => secrets.has(id), readProviderKey: (id) => secrets.get(id),
      writeProviderKey: (id, value) => secrets.set(id, value), clearProviderKey: (id) => secrets.delete(id)
    }
  })
  assert.deepEqual(api.listLaboratoryProviders(), [])
  const input = { category: 'weather', provider: 'qweather', ...credentials }
  const result = api.saveLaboratoryProvider(input)
  assert.equal(result[0].configured, true)
  assert.equal(JSON.stringify(result).includes(credentials.apiKey), false)
  api.saveLaboratoryProvider({ ...input, apiKey: '' })
  assert.equal(api.getQWeatherCredentials().apiKey, credentials.apiKey)
  assert.throws(() => api.saveLaboratoryProvider({ ...input, category: 'other' }))
  assert.throws(() => api.saveLaboratoryProvider({ ...input, apiKey: 'bad\r\nkey' }))
  secrets.set('laboratory-qweather', 'invalid encrypted payload')
  assert.equal(api.listLaboratoryProviders()[0].configured, false)
  api.saveLaboratoryProvider(input)
  assert.equal(api.listLaboratoryProviders()[0].configured, true)
  assert.throws(() => api.removeLaboratoryProvider('../anything'))
  assert.deepEqual(api.removeLaboratoryProvider('qweather'), [])
  assert.equal(secrets.size, 0)
})

test('typhoon startup queries both years, deduplicates active storms, uses header auth and filters old forecasts', async () => {
  const api = weather((url) => {
    if (url.pathname.endsWith('storm-list')) return ok({ storm: [storm, { ...storm, id: 'ended', isActive: '0' }] })
    if (url.pathname.endsWith('storm-track')) return ok({ ...track, refer: { sources: ['test source'], license: ['test license'] } })
    return ok({ forecast: [
      { ...point(undefined), fxTime: now.pubTime },
      { ...point(undefined), fxTime: '2026-10-30T20:00+08:00' }
    ] })
  })
  const feed = await api.fetchTyphoonFeed(credentials)
  assert.equal(api.requests.length, 4)
  assert.deepEqual(api.requests.slice(0, 2).map((r) => new URL(r.url).searchParams.get('year')), [String(new Date().getUTCFullYear()), String(new Date().getUTCFullYear() - 1)])
  for (const req of api.requests) {
    assert.equal(req.headers['X-QW-Api-Key'], credentials.apiKey)
    assert.equal(req.redirect, 'error')
    assert.equal(req.url.includes(credentials.apiKey), false)
    assert.equal(new URL(req.url).searchParams.get('unit'), 'm')
  }
  assert.equal(feed.storms.length, 1)
  assert.equal(feed.storms[0].forecast.length, 1)
  assert.equal(feed.storms[0].now.longitude, 130.2)
  assert.deepEqual(feed.sources, ['test source'])
  assert.deepEqual(feed.license, ['test license'])
  assert.deepEqual(api.parseCachedTyphoons(feed), feed)
})

test('no active storms and no-data codes produce a fresh empty feed without track requests', async () => {
  for (const response of [() => ok({ storm: [] }), () => Response.json({ code: '204' }), () => new Response(null, { status: 204 })]) {
    const api = weather(response)
    const feed = await api.fetchTyphoonFeed(credentials)
    assert.deepEqual(feed.storms, [])
    assert.equal(api.requests.length, 2)
  }
})

test('forecast failure preserves current observations and ended storms do not request a forecast', async () => {
  for (const active of ['0', '1']) {
    const api = weather((url) => {
      if (url.pathname.endsWith('storm-list')) return ok({ storm: [storm] })
      if (url.pathname.endsWith('storm-track')) return ok({ ...track, isActive: active, now: active === '0' ? null : now })
      return Response.json({ code: '403' })
    })
    const feed = await api.fetchTyphoonFeed(credentials)
    assert.equal(feed.storms[0].active, active === '1')
    assert.equal(api.requests.length, active === '1' ? 4 : 3)
    assert.equal(Boolean(feed.storms[0].forecastError), active === '1')
    assert.deepEqual(feed.storms[0].forecast, [])
  }
})

test('invalid coordinates/timestamps are rejected and missing wind values are not turned into zero', () => {
  const api = weather(() => {})
  const parsed = api.parseStormTrack('id', 'name', { ...track, now: { ...now, pressure: '', windSpeed: '' } })
  assert.equal(parsed.now.windSpeed, null)
  assert.equal(parsed.now.pressure, null)
  for (const extra of [{ lon: '' }, { lon: '181' }, { lat: 'NaN' }, { pubTime: '' }]) {
    assert.throws(() => api.parseStormTrack('id', 'name', { ...track, now: { ...now, ...extra } }))
  }
  assert.throws(() => api.parseStormList({}))
  assert.equal(api.parseCachedTyphoons({ fetchedAt: 1, storms: [null] }), null)
})

test('authentication and transport failures are sanitized and abort outstanding requests', async () => {
  const api = weather(() => Response.json({ code: '401', error: credentials.apiKey }))
  await assert.rejects(api.fetchTyphoonFeed(credentials), /认证失败/)
  assert.ok(api.requests.every((request) => request.signal.aborted))
  const failed = weather(() => { throw new Error(`transport ${credentials.apiKey}`) })
  await assert.rejects(failed.fetchTyphoonFeed(credentials), (error) => !error.message.includes(credentials.apiKey))
})

test('one overall deadline bounds startup instead of multiplying timeout per storm', async () => {
  const controller = new AbortController()
  const durations = []
  const api = weather((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), {
    AbortSignal: { any: AbortSignal.any.bind(AbortSignal), timeout: (ms) => { durations.push(ms); return controller.signal } }
  })
  const fetching = api.fetchTyphoonFeed(credentials)
  const rejected = assert.rejects(fetching, /超时/)
  controller.abort()
  await rejected
  assert.deepEqual(durations, [20000])
})

function startupFixture({ configured = true, quakeFails = false, weatherFails = false, cached = null } = {}) {
  let earthquakes = 0
  let typhoons = 0
  const writes = []
  const feed = { fetchedAt: 100, storms: [], sources: [], license: [] }
  const api = load('../src/main/onlineData.ts', {
    crypto: require('node:crypto'), path: require('node:path'),
    './datasets': { loadEarthquakeFeed: async () => { earthquakes++; if (quakeFails) throw new Error('offline'); return { fetchedAt: 100, events: [] } } },
    './laboratory': { getQWeatherCredentials: () => configured ? credentials : null },
    './qweather': { fetchTyphoonFeed: async () => { typhoons++; if (weatherFails) throw new Error('offline'); return feed }, parseCachedTyphoons: (value) => value },
    './jsonStore': { readJson: async () => cached, writeJson: async (path, value) => writes.push({ path, value }) }
  })
  return { api, writes, counts: () => ({ earthquakes, typhoons }) }
}

test('startup is deduplicated, getters are network-free, and a new process refreshes again', async () => {
  for (let launch = 0; launch < 2; launch++) {
    const { api, counts } = startupFixture()
    const first = api.startOnlineData('/test')
    assert.equal(api.startOnlineData('/test'), first)
    const snapshot = await first
    assert.equal(snapshot.typhoonError, '')
    await api.getStartupEarthquakes()
    await api.getStartupEarthquakes()
    assert.equal(await api.getOnlineData(), snapshot)
    assert.deepEqual(counts(), { earthquakes: 1, typhoons: 1 })
  }
})

test('unconfigured startup skips QWeather even with cache, and quake failures do not block typhoons', async () => {
  const unconfigured = startupFixture({ configured: false, cached: { fetchedAt: 1 } })
  const snapshot = await unconfigured.api.startOnlineData('/test')
  assert.equal(snapshot.typhoonConfigured, false)
  assert.equal(snapshot.typhoons, null)
  assert.deepEqual(unconfigured.counts(), { earthquakes: 1, typhoons: 0 })
  const failed = startupFixture({ quakeFails: true })
  const partial = await failed.api.startOnlineData('/test')
  assert.ok(partial.typhoons)
  assert.equal(partial.earthquakes, null)
  await assert.rejects(failed.api.getStartupEarthquakes())
})

test('failed typhoon refresh exposes cache age and error without overwriting cache', async () => {
  const cached = { fetchedAt: 1, storms: [], sources: [], license: [] }
  const fixture = startupFixture({ weatherFails: true, cached })
  const data = await fixture.api.startOnlineData('/test')
  assert.equal(data.typhoons, cached)
  assert.equal(data.typhoonError, 'offline')
  assert.deepEqual(fixture.writes, [])
})

test('earthquakes always refresh at startup even when cache is younger than six hours', async () => {
  let requests = 0
  let offline = false
  const cached = { fetchedAt: Date.now(), events: [] }
  const api = load('../src/main/datasets.ts', {
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify(cached) }, path: require('node:path'),
    electron: { net: { fetch: async () => { requests++; if (offline) throw new Error('offline'); return ok({ features: [] }) } } },
    './geo/gcj02': {}, './jsonStore': { writeJson: async () => {} },
    '../../resources/geo/china-provinces.geojson?asset': ''
  })
  api.initDatasets('/test')
  assert.equal((await api.loadEarthquakeFeed()).stale, undefined)
  assert.equal(requests, 1)
  offline = true
  const fallback = await api.loadEarthquakeFeed()
  assert.equal(fallback.stale, true)
  assert.equal(fallback.fetchedAt, cached.fetchedAt)
})
