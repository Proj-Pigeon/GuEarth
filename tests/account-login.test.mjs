import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { test } from 'node:test'
import { compileFunction } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as passport from '../src/common/passport.ts'
import { serialQueue } from '../src/main/jsonStore.ts'

const source = readFileSync(new URL('../src/main/account.ts', import.meta.url), 'utf8')
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
})
const nodeRequire = createRequire(import.meta.url)
const tokenPayload = { access_token: 'local-access', refresh_token: 'local-refresh', expires_in: 600 }
const json = (payload, status = 200, headers) => Response.json(payload, { status, headers })

function fixture(t, respond, refreshToken = '') {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  const secrets = new Map(refreshToken ? [['passport-refresh-token', refreshToken]] : [])
  const requests = []
  const timeoutDurations = []
  const dependencies = new Map([
    ['electron', {
      net: { fetch: async (url, options) => { requests.push({ url, ...options }); return respond(url, options) } },
      BrowserWindow: { getAllWindows: () => [] },
      shell: { openExternal: async () => {} }
    }],
    ['../common/logger', { logger: { info() {}, warn() {}, error() {} } }],
    ['../common/passport', passport],
    ['./keyVault', {
      readProviderKey: (id) => secrets.get(id),
      writeProviderKey: (id, value) => secrets.set(id, value),
      clearProviderKey: (id) => secrets.delete(id)
    }],
    ['./jsonStore', { serialQueue, writeJson: async () => {} }],
    ['crypto', nodeRequire('crypto')],
    ['os', nodeRequire('os')],
    ['path', nodeRequire('path')]
  ])
  const signals = {
    any: AbortSignal.any.bind(AbortSignal),
    timeout: (ms) => {
      timeoutDurations.push(ms)
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), ms)
      return controller.signal
    }
  }
  const loadAccountModule = compileFunction(`${outputText}
    return { postForm, resolveEndpoints, exchangeDeviceCode, startLogin, refreshAccessToken, snapshot }
  `, ['require', 'exports', 'AbortSignal'])
  const api = loadAccountModule((id) => {
    const dependency = dependencies.get(id)
    if (!dependency) throw new Error(`Unexpected module dependency: ${id}`)
    return dependency
  }, {}, signals)
  const tick = async (ms) => { t.mock.timers.tick(ms); await nextTurn() }
  return { ...api, requests, secrets, timeoutDurations, tick }
}

function stalledResponse(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

for (const endpoint of ['device_authorization', 'token']) {
  test(`${endpoint} POST times out with a caller signal and still supports cancellation`, async (t) => {
    const account = fixture(t, stalledResponse)
    const controller = new AbortController()
    const url = `https://passport.project-pigeon.com/oauth2/${endpoint}`
    const timedOut = assert.rejects(account.postForm(url, new URLSearchParams(), controller.signal), { name: 'TimeoutError' })
    await account.tick(14_999)
    assert.equal(account.requests[0].signal.aborted, false)
    await account.tick(1)
    await timedOut
    assert.equal(controller.signal.aborted, false)
    const cancelled = assert.rejects(account.postForm(url, new URLSearchParams(), controller.signal), { name: 'AbortError' })
    controller.abort()
    await cancelled
    assert.deepEqual(account.timeoutDurations, [15_000, 15_000])
  })
}

test('discovery times out with a caller signal and falls back to standard endpoints', async (t) => {
  const account = fixture(t, stalledResponse)
  const controller = new AbortController()
  const resolving = account.resolveEndpoints(controller.signal)
  await account.tick(15_000)
  const endpoints = await resolving
  assert.equal(account.requests[0].signal.aborted, true)
  assert.equal(controller.signal.aborted, false)
  assert.equal(endpoints.tokenEndpoint, `${passport.PASSPORT_DEFAULT_ISSUER}/oauth2/token`)
})

test('discovery still respects caller cancellation', async (t) => {
  const account = fixture(t, stalledResponse)
  const controller = new AbortController()
  const resolving = account.resolveEndpoints(controller.signal)
  controller.abort()
  await resolving
  assert.equal(account.requests[0].signal.reason, controller.signal.reason)
})

test('polling retries network failures and timed out token requests at the current interval', async (t) => {
  let polls = 0
  const account = fixture(t, (url, options) => {
    if (url.endsWith(passport.PASSPORT_DISCOVERY_PATH)) return json({}, 404)
    polls += 1
    if (polls === 1) throw new TypeError('Network unavailable')
    if (polls === 2) return stalledResponse(url, options)
    return json(tokenPayload)
  })
  const controller = new AbortController()
  const polling = account.exchangeDeviceCode('local-device-code', 2, Date.now() + 60_000, controller.signal)
  await account.tick(2000)
  assert.equal(polls, 1)
  await account.tick(1999)
  assert.equal(polls, 1)
  await account.tick(1)
  assert.equal(polls, 2)
  await account.tick(15_000)
  assert.equal(polls, 2)
  assert.equal(controller.signal.aborted, false)
  await account.tick(1999)
  assert.equal(polls, 2)
  await account.tick(1)
  assert.equal((await polling).refreshToken, tokenPayload.refresh_token)
  assert.equal(polls, 3)
  assert.ok(account.timeoutDurations.every((ms) => ms === 15_000))
})

test('polling keeps slow_down and Retry-After intervals for retryable responses', async (t) => {
  let polls = 0
  const account = fixture(t, (url) => {
    if (url.endsWith(passport.PASSPORT_DISCOVERY_PATH)) return json({}, 404)
    polls += 1
    if (polls === 1) return json({ error: 'slow_down' }, 400)
    if (polls === 2) return json({ error: 'authorization_pending' }, 400)
    if (polls === 3) return json({}, 429, { 'Retry-After': '20' })
    return json(tokenPayload)
  })
  const polling = account.exchangeDeviceCode('local-device-code', 2, Date.now() + 60_000, new AbortController().signal)
  for (const [count, wait] of [[1, 2000], [2, 7000], [3, 7000], [4, 20_000]]) {
    await account.tick(wait - 1)
    assert.equal(polls, count - 1)
    await account.tick(1)
    assert.equal(polls, count)
  }
  assert.equal((await polling).accessToken, tokenPayload.access_token)
})

test('polling stops immediately on caller cancellation during a token request', async (t) => {
  const account = fixture(t, (url, options) => url.endsWith(passport.PASSPORT_DISCOVERY_PATH) ? json({}, 404) : stalledResponse(url, options))
  const controller = new AbortController()
  const cancelled = assert.rejects(account.exchangeDeviceCode('local-device-code', 1, Date.now() + 60_000, controller.signal), { name: 'LoginCancelledError' })
  await account.tick(1000)
  controller.abort()
  await cancelled
  assert.equal(account.requests.length, 2)
})

test('polling stops for terminal authorization errors', async (t) => {
  const account = fixture(t, (url) => url.endsWith(passport.PASSPORT_DISCOVERY_PATH) ? json({}, 404) : json({ error: 'access_denied' }, 400))
  const rejected = assert.rejects(account.exchangeDeviceCode('local-device-code', 1, Date.now() + 60_000, new AbortController().signal), { terminal: true })
  await account.tick(1000)
  await rejected
  assert.equal(account.requests.length, 2)
})

test('polling does not retry a network failure after the challenge expires', async (t) => {
  const failure = new TypeError('Network unavailable')
  const account = fixture(t, async (url) => {
    if (url.endsWith(passport.PASSPORT_DISCOVERY_PATH)) return json({}, 404)
    await account.tick(1000)
    throw failure
  })
  const rejected = assert.rejects(account.exchangeDeviceCode('local-device-code', 1, Date.now() + 2000, new AbortController().signal), (error) => error === failure)
  await account.tick(1000)
  await rejected
  assert.equal(account.requests.length, 2)
})

test('login restores an existing refresh token before creating device authorization', async (t) => {
  const account = fixture(t, (url) => {
    if (url.endsWith(passport.PASSPORT_DISCOVERY_PATH)) return json({}, 404)
    if (url.endsWith('/oauth2/token')) return json(tokenPayload)
    if (url.endsWith('/oauth2/userinfo')) return json({ sub: 'local-user' })
    assert.fail(`Unexpected request: ${url}`)
  }, 'existing-local-refresh')
  const state = await account.startLogin()
  assert.equal(state.phase, 'signed-in')
  assert.equal(state.profile.sub, 'local-user')
  const tokenRequest = account.requests.find(({ url }) => url.endsWith('/oauth2/token'))
  assert.equal(new URLSearchParams(tokenRequest.body).get('grant_type'), passport.PASSPORT_REFRESH_GRANT_TYPE)
  assert.equal(new URLSearchParams(tokenRequest.body).get('refresh_token'), 'existing-local-refresh')
  assert.equal(account.secrets.get('passport-refresh-token'), tokenPayload.refresh_token)
})

test('login continues device authorization after a temporary restore failure while retaining the refresh token', async (t) => {
  const account = fixture(t, (url) => {
    if (url.endsWith(passport.PASSPORT_DISCOVERY_PATH)) return json({}, 404)
    if (url.endsWith('/oauth2/token')) throw new TypeError('Network unavailable')
    if (url.endsWith('/oauth2/device_authorization')) return json({ error: 'access_denied' }, 400)
    assert.fail(`Unexpected request: ${url}`)
  }, 'existing-local-refresh')
  assert.equal((await account.startLogin()).phase, 'signed-out')
  assert.ok(account.requests.at(-1).url.endsWith('/oauth2/device_authorization'))
  assert.equal(account.secrets.get('passport-refresh-token'), 'existing-local-refresh')
})

test('login without a refresh token starts device authorization directly', async (t) => {
  const account = fixture(t, (url) => url.endsWith(passport.PASSPORT_DISCOVERY_PATH) ? json({}, 404) : json({ error: 'access_denied' }, 400))
  await account.startLogin()
  assert.equal(account.requests.length, 2)
  assert.ok(account.requests[1].url.endsWith('/oauth2/device_authorization'))
})

test('refresh retains its overall timeout and preserves a token after a network timeout', async (t) => {
  const account = fixture(t, stalledResponse, 'existing-local-refresh')
  const rejected = assert.rejects(account.refreshAccessToken(), { name: 'AbortError' })
  await account.tick(15_000)
  await rejected
  assert.equal(account.requests.length, 2)
  assert.equal(account.requests[1].signal.aborted, true)
  assert.equal(account.secrets.get('passport-refresh-token'), 'existing-local-refresh')
})
