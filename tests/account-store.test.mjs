import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
import { accountPhaseLabel, signedOutAccountState } from '../src/common/passport.ts'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const DEVICE_LIST_URL = 'https://account.project-pigeon.com/account/security'
const VERIFICATION_URI = 'https://account.project-pigeon.com/device'

const handlers = {}
const listeners = []
const calls = []

function bridgeResult(handler) {
  return handler?.() ?? Promise.resolve(signedOutAccountState(DEVICE_LIST_URL))
}

globalThis.window = {
  guEarth: {
    account: {
      getState: (...args) => { calls.push('getState'); return bridgeResult(handlers.getState, ...args) },
      login: () => { calls.push('login'); return bridgeResult(handlers.login) },
      cancelLogin: () => { calls.push('cancelLogin'); return bridgeResult(handlers.cancelLogin) },
      signOut: () => { calls.push('signOut'); return bridgeResult(handlers.signOut) },
      dismissRevocationWarning: () => { calls.push('dismissRevocationWarning'); return bridgeResult(handlers.dismissRevocationWarning) },
      openDeviceList: () => { calls.push('openDeviceList'); return bridgeResult(handlers.openDeviceList) },
      openVerification: () => { calls.push('openVerification'); return bridgeResult(handlers.openVerification) },
      onState: (listener) => {
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
      }
    }
  }
}

function emit(state) {
  for (const listener of listeners) listener(state)
}

function profileOf(overrides = {}) {
  return { sub: 'usr_123', username: 'alice', name: 'Alice', email: 'alice@example.com', emailVerified: true, scopes: ['openid', 'profile', 'email'], ...overrides }
}

function signedInState(overrides = {}) {
  return { ...signedOutAccountState(DEVICE_LIST_URL), phase: 'signed-in', profile: profileOf(), signedInAt: 1_760_000_000_000, ...overrides }
}

function awaitingState(overrides = {}) {
  return {
    ...signedOutAccountState(DEVICE_LIST_URL),
    phase: 'awaiting-approval',
    challenge: { userCode: 'BCDF-GHJK', verificationUri: VERIFICATION_URI, expiresAt: Date.now() + 600_000, interval: 5 },
    ...overrides
  }
}

const { useAccountStore } = await import('../src/renderer/src/stores/account.ts')

setActivePinia(createPinia())
handlers.getState = () => Promise.resolve(signedInState())
const store = useAccountStore()
await store.hydrate()

test('hydrate subscribes once and mirrors the main-process account snapshot', async () => {
  const before = calls.filter((name) => name === 'getState').length
  await store.hydrate()
  assert.equal(calls.filter((name) => name === 'getState').length, before)
  assert.equal(listeners.length, 1)
  assert.equal(store.hydrated, true)
  assert.equal(store.phase, 'signed-in')
  assert.equal(store.signedIn, true)
  assert.equal(store.displayName, 'Alice')
  assert.deepEqual(store.profile.scopes, ['openid', 'profile', 'email'])
  assert.equal(store.deviceListUrl, DEVICE_LIST_URL)
  assert.equal(store.phaseLabel, accountPhaseLabel('signed-in'))
})

test('pushed account events update the store without another getState round trip', () => {
  const before = calls.filter((name) => name === 'getState').length
  emit(awaitingState())
  assert.equal(calls.filter((name) => name === 'getState').length, before)
  assert.equal(store.phase, 'awaiting-approval')
  assert.equal(store.userCode, 'BCDF-GHJK')
  assert.equal(store.verificationUri, VERIFICATION_URI)
  assert.equal(store.loginInProgress, true)
  assert.ok(store.remainingSeconds > 590 && store.remainingSeconds <= 600)
  emit(signedOutAccountState(DEVICE_LIST_URL))
  assert.equal(store.phase, 'signed-out')
  assert.equal(store.userCode, '')
  assert.equal(store.challengeExpiresAt, 0)
  assert.equal(store.remainingSeconds, 0)
})

test('an expired challenge counts down to zero instead of going negative', () => {
  emit(awaitingState({ challenge: { userCode: 'BCDF-GHJK', verificationUri: VERIFICATION_URI, expiresAt: Date.now() - 1000, interval: 5 } }))
  assert.equal(store.remainingSeconds, 0)
  emit(signedOutAccountState(DEVICE_LIST_URL))
})

test('login resolves through the bridge and clears the busy flag', async () => {
  handlers.login = () => Promise.resolve(awaitingState())
  const pending = store.login()
  assert.equal(store.busy, true)
  await pending
  assert.equal(store.busy, false)
  assert.equal(store.phase, 'awaiting-approval')
  assert.ok(calls.includes('login'))
  emit(signedOutAccountState(DEVICE_LIST_URL))
})

test('a rejected login surfaces the IPC error message without the Electron wrapper prefix', async () => {
  handlers.login = () => Promise.reject(new Error("Error invoking remote method 'account:login': Error: 登录确认已超时，请重新发起登录"))
  await store.login()
  assert.equal(store.error, '登录确认已超时，请重新发起登录')
  assert.equal(store.busy, false)
  store.clearError()
  assert.equal(store.error, '')
})

test('a second action while one is in flight is ignored so the device flow stays serialized', async () => {
  let release
  handlers.login = () => new Promise((resolve) => { release = resolve })
  const loginCallsBefore = calls.filter((name) => name === 'login').length
  const signOutCallsBefore = calls.filter((name) => name === 'signOut').length
  const first = store.login()
  await store.login()
  await store.signOut()
  assert.equal(calls.filter((name) => name === 'login').length - loginCallsBefore, 1)
  assert.equal(calls.filter((name) => name === 'signOut').length - signOutCallsBefore, 0)
  release(awaitingState())
  await first
  assert.equal(store.busy, false)
  emit(signedOutAccountState(DEVICE_LIST_URL))
})

test('cancelLogin stops the device poll and returns to the signed-out snapshot', async () => {
  handlers.cancelLogin = () => Promise.resolve(signedOutAccountState(DEVICE_LIST_URL))
  emit(awaitingState())
  await store.cancelLogin()
  assert.ok(calls.includes('cancelLogin'))
  assert.equal(store.phase, 'signed-out')
  assert.equal(store.userCode, '')
})

test('cancelLogin reaches the main process while the device flow is still waiting for approval', async () => {
  let release
  handlers.login = () => new Promise((resolve) => { release = resolve })
  handlers.cancelLogin = () => Promise.resolve(signedOutAccountState(DEVICE_LIST_URL))
  const cancelCallsBefore = calls.filter((name) => name === 'cancelLogin').length
  const pending = store.login()
  assert.equal(store.busy, true)
  await store.cancelLogin()
  assert.equal(calls.filter((name) => name === 'cancelLogin').length - cancelCallsBefore, 1)
  assert.equal(store.phase, 'signed-out')
  assert.equal(store.canceling, false)
  release(signedOutAccountState(DEVICE_LIST_URL))
  await pending
  assert.equal(store.busy, false)
})

test('signOut applies the revoked snapshot and keeps a pending remote revocation visible', async () => {
  handlers.signOut = () => Promise.resolve(signedOutAccountState(DEVICE_LIST_URL, '', true))
  handlers.dismissRevocationWarning = () => Promise.resolve(signedOutAccountState(DEVICE_LIST_URL))
  emit(signedInState())
  assert.equal(store.signedIn, true)
  await store.signOut()
  assert.ok(calls.includes('signOut'))
  assert.equal(store.signedIn, false)
  assert.equal(store.profile, null)
  assert.equal(store.pendingRemoteRevocation, true)
  await store.dismissRevocationWarning()
  assert.equal(store.pendingRemoteRevocation, false)
})

test('the display name falls back from name to username to the stable subject', () => {
  emit(signedInState({ profile: profileOf({ name: '', username: '' }) }))
  assert.equal(store.displayName, 'usr_123')
  emit(signedInState({ profile: profileOf({ name: '' }) }))
  assert.equal(store.displayName, 'alice')
  emit(signedInState({ profile: profileOf() }))
  assert.equal(store.displayName, 'Alice')
  emit(signedOutAccountState(DEVICE_LIST_URL))
  assert.equal(store.displayName, '')
})

test('opening the device list and the verification page report failures as account errors', async () => {
  handlers.openDeviceList = () => Promise.reject(new Error("Error invoking remote method 'account:open-device-list': Error: 账号页地址不可用"))
  handlers.openVerification = () => Promise.reject(new Error("Error invoking remote method 'account:open-verification': Error: 当前没有可打开的登录确认页"))
  await store.openDeviceList()
  assert.equal(store.error, '无法打开账号页设备列表')
  store.clearError()
  await store.openVerification()
  assert.equal(store.error, '无法打开登录确认页，请重新发起登录')
  store.clearError()
})

test('a session invalidated by Passport drops back to signed-out with a re-login hint', () => {
  emit(signedInState())
  assert.equal(store.signedIn, true)
  emit(signedOutAccountState(DEVICE_LIST_URL, '登录状态已失效，请重新登录'))
  assert.equal(store.phase, 'signed-out')
  assert.equal(store.signedIn, false)
  assert.equal(store.error, '登录状态已失效，请重新登录')
})
