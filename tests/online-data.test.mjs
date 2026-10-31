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

test('QWeather hosts accept official domains and nested subdomains without paths, credentials or ports', () => {
  assert.equal(shared.normalizeQWeatherHost(' HTTPS://Test.qweatherapi.com/ '), 'test.qweatherapi.com')
  assert.equal(shared.normalizeQWeatherHost(' HTTPS://Test.Yun.qweatherapi.com/ '), 'test.yun.qweatherapi.com')
  assert.equal(shared.normalizeQWeatherHost('a.b.qweatherapi.com'), 'a.b.qweatherapi.com')
  assert.equal(shared.normalizeQWeatherHost('qweatherapi.com'), 'qweatherapi.com')
  for (const value of ['http://test.qweatherapi.com', 'test.qweatherapi.com.evil.test', 'evilqweatherapi.com', '127.0.0.1', 'user@test.qweatherapi.com', 'test.qweatherapi.com:443', 'test.qweatherapi.com/v7', 'test.qweatherapi.com?key=abc', 'test.qweatherapi.com#fragment', 'test.qweatherapi.com\\evil', 'test..qweatherapi.com', '-test.qweatherapi.com', 'test-.qweatherapi.com', `${'a'.repeat(64)}.qweatherapi.com`, `${'a.'.repeat(120)}qweatherapi.com`, null]) {
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

for (const endpoint of ['storm-list', 'storm-track']) {
  test(`QWeather forwards external cancellation to outstanding ${endpoint} requests`, async () => {
    const controller = new AbortController()
    const started = deferred()
    const api = weather((url, { signal }) => {
      if (!url.pathname.endsWith(endpoint)) return ok({ storm: [storm] })
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        started.resolve()
      })
    })
    const fetching = api.fetchTyphoonFeed(credentials, controller.signal)
    const rejected = assert.rejects(fetching, (error) => !error.message.includes(credentials.apiKey))
    await started.promise
    const requestCount = endpoint === 'storm-list' ? 2 : 3
    assert.equal(api.requests.length, requestCount)
    assert.ok(api.requests.every((request) => request.signal instanceof AbortSignal && !request.signal.aborted))
    controller.abort(new Error('provider changed'))
    assert.ok(api.requests.every((request) => request.signal.aborted && request.signal.reason === controller.signal.reason))
    await rejected
    assert.equal(api.requests.length, requestCount)
  })
}

test('QWeather skips all network requests when the external signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const api = weather(() => assert.fail('aborted requests must not reach net.fetch'))
  await assert.rejects(api.fetchTyphoonFeed(credentials, controller.signal), { name: 'AbortError' })
  assert.deepEqual(api.requests, [])
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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function typhoonFeed(fetchedAt = 100, id = storm.id) {
  const observation = { time: new Date(now.pubTime).toISOString(), latitude: 18.5, longitude: 130.2, type: 'STS', pressure: 980, windSpeed: 30 }
  return {
    fetchedAt, sources: ['test source'], license: ['test license'],
    storms: [{ id, name: storm.name, active: true, now: observation, track: [observation], forecast: [], forecastError: '' }]
  }
}

function typhoonCachePath(apiHost) {
  const hostId = require('node:crypto').createHash('sha256').update(apiHost).digest('hex').slice(0, 16)
  return require('node:path').join('/test', `typhoons-${hostId}.json`)
}

function startupFixture({ configured = true, quakeFails = false, weatherFails = false, cached = null, deferWeather = false, earthquakeResponse, readCache } = {}) {
  let failQuake = quakeFails
  let earthquakes = 0
  let currentCredentials = configured ? credentials : null
  const requests = []
  const requestWaiters = []
  const reads = []
  const writes = []
  const feed = typhoonFeed()
  const api = load('../src/main/onlineData.ts', {
    crypto: require('node:crypto'), path: require('node:path'),
    './datasets': { loadEarthquakeFeed: async () => {
      earthquakes++
      if (failQuake) throw new Error('offline')
      return earthquakeResponse ?? { fetchedAt: 100, events: [] }
    } },
    './laboratory': { getQWeatherCredentials: () => currentCredentials },
    './qweather': {
      fetchTyphoonFeed: async (value, signal) => {
        const request = { credentials: { ...value }, signal, ...(deferWeather ? deferred() : {}) }
        requests.push(request)
        requestWaiters[requests.length - 1]?.resolve(request)
        if (deferWeather) return request.promise
        if (weatherFails) throw new Error('offline')
        return feed
      },
      parseCachedTyphoons: (value) => value
    },
    './jsonStore': {
      readJson: async (path) => { reads.push(path); return readCache ? readCache(path) : cached },
      writeJson: async (path, value) => { writes.push({ path, value }) }
    }
  })
  return {
    api, reads, writes, requests, feed,
    counts: () => ({ earthquakes, typhoons: requests.length }),
    setCredentials: (value) => { currentCredentials = value },
    setQuakeFails: (value) => { failQuake = value },
    waitForRequest: (index = 0) => requests[index] ? Promise.resolve(requests[index]) : (requestWaiters[index] ??= deferred()).promise
  }
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

test('earthquake refresh retries the live feed and updates the snapshot', async () => {
  const fixture = startupFixture({ quakeFails: true })
  const initial = await fixture.api.startOnlineData('/test')
  assert.equal(initial.earthquakes, null)
  await assert.rejects(fixture.api.getStartupEarthquakes())
  fixture.setQuakeFails(false)
  const refreshed = await fixture.api.refreshEarthquakes()
  assert.equal(refreshed.fetchedAt, 100)
  const data = await fixture.api.getOnlineData()
  assert.equal(data.earthquakes, refreshed)
  assert.equal(data.earthquakeError, '')
  assert.equal(await fixture.api.getStartupEarthquakes(), refreshed)
  assert.deepEqual(fixture.counts(), { earthquakes: 2, typhoons: 1 })
})

test('earthquake refresh requests are deduplicated and keep the failure state on error', async () => {
  const fixture = startupFixture({ quakeFails: true })
  await fixture.api.startOnlineData('/test')
  const first = fixture.api.refreshEarthquakes()
  assert.equal(fixture.api.refreshEarthquakes(), first)
  await assert.rejects(first)
  const failed = await fixture.api.getOnlineData()
  assert.equal(failed.earthquakes, null)
  assert.equal(failed.earthquakeError, 'USGS 地震数据获取失败，请检查网络后重试')
  assert.deepEqual(fixture.counts(), { earthquakes: 2, typhoons: 1 })
})

test('failed typhoon refresh exposes cache age and error without overwriting cache', async () => {
  const cached = { fetchedAt: 1, storms: [], sources: [], license: [] }
  const fixture = startupFixture({ weatherFails: true, cached })
  const data = await fixture.api.startOnlineData('/test')
  assert.equal(data.typhoons, cached)
  assert.equal(data.typhoons.fetchedAt, 1)
  assert.equal(data.typhoonStatus, 'error')
  assert.equal(data.typhoonConfigured, true)
  assert.equal(data.typhoonError, 'offline')
  assert.equal(await fixture.api.ensureTyphoons(), data)
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
  assert.deepEqual(fixture.writes, [])
})

test('adding QWeather after startup stays network-free until ensure and deduplicates concurrent consumers', async () => {
  const fixture = startupFixture({ configured: false, deferWeather: true })
  const { api } = fixture
  const startup = api.startOnlineData('/test')
  const initial = await startup
  const earthquakes = await api.getStartupEarthquakes()
  assert.equal(initial.typhoonStatus, 'unconfigured')
  fixture.setCredentials(credentials)
  api.invalidateTyphoons(true)
  const pending = await api.getOnlineData()
  assert.equal(pending.typhoonStatus, 'pending')
  assert.equal(pending.typhoonConfigured, true)
  assert.equal(pending.typhoons, null)
  assert.equal(pending.typhoonError, '')
  assert.ok(pending.revision > initial.revision)
  for (let read = 0; read < 3; read++) {
    assert.equal(await api.getOnlineData(), pending)
    assert.equal(await api.getStartupEarthquakes(), earthquakes)
    assert.equal(api.startOnlineData('/test'), startup)
  }
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 0 })
  assert.deepEqual(fixture.reads, [])
  const first = api.ensureTyphoons()
  for (let consumer = 0; consumer < 3; consumer++) {
    assert.equal(api.ensureTyphoons(), first)
    assert.equal(api.ensureTyphoons(true), first)
  }
  const request = await fixture.waitForRequest()
  assert.deepEqual(request.credentials, credentials)
  const loading = await api.getOnlineData()
  assert.equal(loading.typhoonStatus, 'loading')
  assert.equal(loading.typhoons, null)
  assert.equal(await api.getStartupEarthquakes(), earthquakes)
  request.resolve(fixture.feed)
  const live = await first
  assert.equal(live.typhoonStatus, 'ready')
  assert.equal(live.typhoons, fixture.feed)
  assert.equal(live.typhoons.storms[0].id, storm.id)
  assert.equal(live.typhoonError, '')
  assert.equal(live.earthquakes, earthquakes)
  for (let consumer = 0; consumer < 3; consumer++) {
    assert.equal(await api.ensureTyphoons(), live)
    assert.equal(await api.ensureTyphoons(true), live)
    assert.equal(await api.getOnlineData(), live)
  }
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
  assert.deepEqual(fixture.writes, [{ path: typhoonCachePath(credentials.apiHost), value: fixture.feed }])
})

test('editing the host or only the key clears prior state and uses the latest credentials without refetching earthquakes', async () => {
  const cached = typhoonFeed(1)
  const fixture = startupFixture({ deferWeather: true, cached })
  const { api } = fixture
  const startup = api.startOnlineData('/test')
  const initialRequest = await fixture.waitForRequest()
  initialRequest.reject(new Error('offline'))
  const initial = await startup
  assert.equal(initial.typhoonStatus, 'error')
  assert.equal(initial.typhoonError, 'offline')
  assert.equal(initial.typhoons, cached)
  const edits = [
    { apiHost: 'updated.qweatherapi.com', apiKey: 'updated-key-not-a-secret' },
    { apiHost: 'updated.qweatherapi.com', apiKey: 'rotated-key-not-a-secret' }
  ]
  for (const [index, nextCredentials] of edits.entries()) {
    fixture.setCredentials(nextCredentials)
    api.invalidateTyphoons(true)
    const pending = await api.getOnlineData()
    assert.equal(pending.typhoonStatus, 'pending')
    assert.equal(pending.typhoons, null)
    assert.equal(pending.typhoonError, '')
    assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: index + 1 })
    const fetching = api.ensureTyphoons()
    const request = await fixture.waitForRequest(index + 1)
    assert.deepEqual(request.credentials, nextCredentials)
    assert.equal(request.signal.aborted, false)
    const feed = typhoonFeed(200 + index, `NP_260${index + 2}`)
    request.resolve(feed)
    const updated = await fetching
    assert.equal(updated.typhoonStatus, 'ready')
    assert.equal(updated.typhoons, feed)
    assert.equal(updated.earthquakes, initial.earthquakes)
    assert.equal(api.startOnlineData('/test'), startup)
    assert.equal(await api.getOnlineData(), updated)
    assert.deepEqual(fixture.writes.at(-1), { path: typhoonCachePath(nextCredentials.apiHost), value: feed })
  }
  assert.deepEqual(fixture.requests.map((request) => request.credentials), [credentials, ...edits])
  assert.deepEqual(fixture.reads, [credentials, ...edits].map((value) => typhoonCachePath(value.apiHost)))
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 3 })
})

for (const weatherFails of [false, true]) {
  test(`removing QWeather immediately clears ${weatherFails ? 'cached data and errors' : 'live data'} without fetching`, async () => {
    const fixture = startupFixture({ weatherFails, cached: typhoonFeed(1) })
    const { api } = fixture
    const notifications = []
    const initial = await api.startOnlineData('/test', (snapshot) => notifications.push(snapshot))
    assert.ok(initial.typhoons)
    assert.equal(initial.typhoonStatus, weatherFails ? 'error' : 'ready')
    const writes = fixture.writes.slice()
    const reads = fixture.reads.slice()
    const previousNotifications = notifications.length
    fixture.setCredentials(null)
    api.invalidateTyphoons(false)
    assert.equal(notifications.length, previousNotifications + 1)
    const removed = notifications.at(-1)
    assert.equal(removed.typhoonStatus, 'unconfigured')
    assert.equal(removed.typhoonConfigured, false)
    assert.equal(removed.typhoons, null)
    assert.equal(removed.typhoonError, '')
    assert.ok(removed.revision > initial.revision)
    for (let read = 0; read < 3; read++) {
      assert.equal(await api.getOnlineData(), removed)
      assert.equal(await api.ensureTyphoons(), removed)
      assert.equal(await api.ensureTyphoons(true), removed)
      assert.equal(await api.getStartupEarthquakes(), initial.earthquakes)
    }
    assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
    assert.deepEqual(fixture.reads, reads)
    assert.deepEqual(fixture.writes, writes)
    assert.equal(notifications.length, previousNotifications + 1)
  })
}

for (const outcome of ['resolve', 'reject']) {
  for (const oldSettlesFirst of [true, false]) {
    test(`an edited provider ignores an old ${outcome} ${oldSettlesFirst ? 'before' : 'after'} the replacement completes`, async () => {
      const fixture = startupFixture({ configured: false, deferWeather: true, cached: typhoonFeed(1) })
      const { api } = fixture
      const notifications = []
      await api.startOnlineData('/test', (snapshot) => notifications.push(snapshot))
      fixture.setCredentials(credentials)
      api.invalidateTyphoons(true)
      const oldFetching = api.ensureTyphoons()
      const oldRequest = await fixture.waitForRequest()
      const replacementCredentials = { apiHost: 'replacement.qweatherapi.com', apiKey: 'replacement-key-not-a-secret' }
      fixture.setCredentials(replacementCredentials)
      api.invalidateTyphoons(true)
      assert.equal(oldRequest.signal.aborted, true)
      const replacementFetching = api.ensureTyphoons()
      const replacementRequest = await fixture.waitForRequest(1)
      assert.deepEqual(replacementRequest.credentials, replacementCredentials)
      const replacementFeed = typhoonFeed(300, 'NP_2603')
      if (!oldSettlesFirst) {
        replacementRequest.resolve(replacementFeed)
        await replacementFetching
      }
      const beforeStaleResult = await api.getOnlineData()
      const previousNotifications = notifications.length
      const previousWrites = fixture.writes.slice()
      oldRequest[outcome](outcome === 'resolve' ? typhoonFeed(200, 'NP_2602') : new Error('late failure from old provider'))
      assert.equal(await oldFetching, beforeStaleResult)
      assert.equal(await api.getOnlineData(), beforeStaleResult)
      assert.equal(notifications.length, previousNotifications)
      assert.deepEqual(fixture.writes, previousWrites)
      if (oldSettlesFirst) {
        assert.equal(beforeStaleResult.typhoonStatus, 'loading')
        assert.equal(replacementRequest.signal.aborted, false)
        assert.equal(api.ensureTyphoons(), replacementFetching)
        assert.equal(api.ensureTyphoons(true), replacementFetching)
        replacementRequest.resolve(replacementFeed)
        await replacementFetching
      }
      const live = await api.getOnlineData()
      assert.equal(live.typhoonStatus, 'ready')
      assert.equal(live.typhoons, replacementFeed)
      assert.equal(live.typhoonError, '')
      assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 2 })
      assert.deepEqual(fixture.writes, [{ path: typhoonCachePath(replacementCredentials.apiHost), value: replacementFeed }])
    })
  }

  test(`removing QWeather aborts an in-flight request and ignores its late ${outcome}`, async () => {
    const fixture = startupFixture({ configured: false, deferWeather: true, cached: typhoonFeed(1) })
    const { api } = fixture
    const notifications = []
    await api.startOnlineData('/test', (snapshot) => notifications.push(snapshot))
    fixture.setCredentials(credentials)
    api.invalidateTyphoons(true)
    const fetching = api.ensureTyphoons()
    const request = await fixture.waitForRequest()
    fixture.setCredentials(null)
    api.invalidateTyphoons(false)
    const removed = await api.getOnlineData()
    const previousNotifications = notifications.length
    assert.equal(request.signal.aborted, true)
    assert.equal(removed.typhoonStatus, 'unconfigured')
    assert.equal(removed.typhoons, null)
    assert.equal(removed.typhoonError, '')
    assert.equal(await api.ensureTyphoons(true), removed)
    request[outcome](outcome === 'resolve' ? fixture.feed : new Error('late failure after removal'))
    assert.equal(await fetching, removed)
    assert.equal(await api.getOnlineData(), removed)
    assert.equal(notifications.length, previousNotifications)
    assert.deepEqual(fixture.writes, [])
    assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
  })
}

test('failed requests keep marked cache until an explicit deduplicated retry succeeds', async () => {
  const cached = typhoonFeed(1)
  const fixture = startupFixture({ cached, deferWeather: true })
  const { api } = fixture
  const startup = api.startOnlineData('/test')
  const failedRequest = await fixture.waitForRequest()
  failedRequest.reject(new Error('offline'))
  const failed = await startup
  assert.equal(failed.typhoonStatus, 'error')
  assert.equal(failed.typhoonConfigured, true)
  assert.equal(failed.typhoons, cached)
  assert.equal(failed.typhoons.fetchedAt, 1)
  assert.equal(failed.typhoonError, 'offline')
  for (let read = 0; read < 3; read++) {
    assert.equal(await api.ensureTyphoons(), failed)
    assert.equal(await api.ensureTyphoons(false), failed)
    assert.equal(await api.getOnlineData(), failed)
    assert.equal(await api.getStartupEarthquakes(), failed.earthquakes)
  }
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
  assert.deepEqual(fixture.writes, [])
  const retry = api.ensureTyphoons(true)
  assert.equal(api.ensureTyphoons(true), retry)
  assert.equal(api.ensureTyphoons(), retry)
  const retryRequest = await fixture.waitForRequest(1)
  const loading = await api.getOnlineData()
  assert.equal(loading.typhoonStatus, 'loading')
  assert.equal(loading.typhoonError, 'offline')
  assert.equal(loading.typhoons, cached)
  assert.equal(loading.earthquakes, failed.earthquakes)
  retryRequest.resolve(fixture.feed)
  const recovered = await retry
  assert.equal(recovered.typhoonStatus, 'ready')
  assert.equal(recovered.typhoonError, '')
  assert.equal(recovered.typhoons, fixture.feed)
  assert.equal(await api.ensureTyphoons(true), recovered)
  assert.equal(await api.getStartupEarthquakes(), failed.earthquakes)
  assert.equal(api.startOnlineData('/test'), startup)
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 2 })
  assert.deepEqual(fixture.writes, [{ path: typhoonCachePath(credentials.apiHost), value: fixture.feed }])
})

test('invalidation while startup reads the cache prevents fetching or restoring the removed provider', async () => {
  const cacheRead = deferred()
  const fixture = startupFixture({ readCache: () => cacheRead.promise })
  const { api } = fixture
  const notifications = []
  const startup = api.startOnlineData('/test', (snapshot) => notifications.push(snapshot))
  assert.equal(fixture.reads.length, 1)
  fixture.setCredentials(null)
  api.invalidateTyphoons(false)
  assert.equal(notifications.at(-1).typhoonStatus, 'unconfigured')
  cacheRead.resolve(typhoonFeed(1))
  const settled = await startup
  assert.equal(settled.typhoonStatus, 'unconfigured')
  assert.equal(settled.typhoonConfigured, false)
  assert.equal(settled.typhoons, null)
  assert.equal(settled.typhoonError, '')
  assert.ok(settled.earthquakes)
  assert.equal(await api.getOnlineData(), settled)
  assert.deepEqual(fixture.writes, [])
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 0 })
})

test('an edit during unfinished startup remains pending after the old request and earthquake prefetch settle', async () => {
  const quake = deferred()
  const fixture = startupFixture({ deferWeather: true, earthquakeResponse: quake.promise })
  const { api } = fixture
  const notifications = []
  const startup = api.startOnlineData('/test', (snapshot) => notifications.push(snapshot))
  const oldRequest = await fixture.waitForRequest()
  const nextCredentials = { apiHost: 'startup-edit.qweatherapi.com', apiKey: 'startup-edit-key-not-a-secret' }
  fixture.setCredentials(nextCredentials)
  api.invalidateTyphoons(true)
  const invalidated = notifications.at(-1)
  assert.equal(oldRequest.signal.aborted, true)
  assert.equal(invalidated.typhoonStatus, 'pending')
  oldRequest.resolve(typhoonFeed(1))
  const earthquakes = { fetchedAt: 200, events: [] }
  quake.resolve(earthquakes)
  const pending = await startup
  assert.equal(pending.typhoonStatus, 'pending')
  assert.equal(pending.typhoonConfigured, true)
  assert.equal(pending.typhoons, null)
  assert.equal(pending.typhoonError, '')
  assert.equal(pending.earthquakes, earthquakes)
  assert.ok(pending.revision > invalidated.revision)
  assert.equal(await api.getOnlineData(), pending)
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 1 })
  assert.deepEqual(fixture.writes, [])
  const fetching = api.ensureTyphoons()
  const request = await fixture.waitForRequest(1)
  assert.deepEqual(request.credentials, nextCredentials)
  request.resolve(fixture.feed)
  const live = await fetching
  assert.equal(live.typhoonStatus, 'ready')
  assert.equal(live.typhoons, fixture.feed)
  assert.equal(live.earthquakes, earthquakes)
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 2 })
  assert.deepEqual(fixture.writes, [{ path: typhoonCachePath(nextCredentials.apiHost), value: fixture.feed }])
})

test('snapshot listeners receive increasing revisions and all status changes without credentials or read notifications', async () => {
  const fixture = startupFixture({ configured: false, deferWeather: true })
  const { api } = fixture
  const notifications = []
  const listener = (snapshot) => notifications.push({ snapshot, serialized: JSON.stringify(snapshot) })
  const initial = await api.startOnlineData('/test', listener)
  assert.equal(notifications.at(-1).snapshot, initial)
  const previousNotifications = notifications.length
  fixture.setCredentials(credentials)
  api.invalidateTyphoons(true)
  assert.equal(notifications.length, previousNotifications + 1)
  assert.equal(notifications.at(-1).snapshot.typhoonStatus, 'pending')
  const fetching = api.ensureTyphoons()
  assert.equal(notifications.at(-1).snapshot.typhoonStatus, 'loading')
  const request = await fixture.waitForRequest()
  request.reject(new Error('offline'))
  const failed = await fetching
  assert.equal(notifications.at(-1).snapshot, failed)
  assert.equal(failed.typhoonStatus, 'error')
  assert.equal(failed.typhoons, null)
  assert.equal(failed.typhoonError, 'offline')
  const failedNotifications = notifications.length
  assert.equal(await api.ensureTyphoons(), failed)
  assert.equal(await api.getOnlineData(), failed)
  await api.getStartupEarthquakes()
  assert.equal(notifications.length, failedNotifications)
  const retry = api.ensureTyphoons(true)
  assert.equal(notifications.at(-1).snapshot.typhoonStatus, 'loading')
  const retryRequest = await fixture.waitForRequest(1)
  retryRequest.resolve(fixture.feed)
  const live = await retry
  assert.equal(notifications.at(-1).snapshot, live)
  assert.equal(live.typhoonStatus, 'ready')
  const editedCredentials = { apiHost: 'listener.qweatherapi.com', apiKey: 'listener-key-not-a-secret' }
  fixture.setCredentials(editedCredentials)
  api.invalidateTyphoons(true)
  const edited = notifications.at(-1).snapshot
  assert.equal(edited.typhoonStatus, 'pending')
  assert.equal(edited.typhoons, null)
  fixture.setCredentials(null)
  api.invalidateTyphoons(false)
  const removed = notifications.at(-1).snapshot
  assert.equal(removed.typhoonStatus, 'unconfigured')
  assert.equal(await api.getOnlineData(), removed)
  let revision = 0
  for (const { snapshot, serialized } of notifications) {
    assert.ok(Number.isInteger(snapshot.revision) && snapshot.revision > revision)
    revision = snapshot.revision
    assert.equal(JSON.stringify(snapshot), serialized)
    assert.deepEqual(Object.keys(snapshot).sort(), ['revision', 'earthquakes', 'earthquakeError', 'typhoons', 'typhoonError', 'typhoonConfigured', 'typhoonStatus'].sort())
    assert.equal(serialized.includes(credentials.apiKey), false)
    assert.equal(serialized.includes(editedCredentials.apiKey), false)
  }
  assert.deepEqual(new Set(notifications.map(({ snapshot }) => snapshot.typhoonStatus)), new Set(['unconfigured', 'pending', 'loading', 'ready', 'error']))
  assert.deepEqual(fixture.counts(), { earthquakes: 1, typhoons: 2 })
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
