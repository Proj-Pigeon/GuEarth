import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { randomBytes } from 'crypto'
import { hostname } from 'os'
import { join } from 'path'
import { logger } from '../common/logger'
import {
  accountPhaseLabel,
  buildDeviceName,
  describeAuthorizationFailure,
  deviceListUrl,
  encodeBase64Url,
  isValidDeviceName,
  isValidInstallationId,
  isTrustedVerificationUriComplete,
  normalizeIssuer,
  parseDeviceAuthorization,
  parseDiscovery,
  parseTokenResponse,
  parseUserInfo,
  passportPlatform,
  retryAfterSeconds,
  scopeParameter,
  signedOutAccountState,
  truncateToUtf8Bytes,
  PASSPORT_DEFAULT_ACCOUNT_ORIGIN,
  PASSPORT_DEFAULT_CLIENT_ID,
  PASSPORT_DEFAULT_ISSUER,
  PASSPORT_DEVICE_GRANT_TYPE,
  PASSPORT_DISCOVERY_PATH,
  PASSPORT_REFRESH_GRANT_TYPE,
  PASSPORT_SCOPES,
  SLOW_DOWN_INCREMENT_SECONDS,
  type AccountPhase,
  type AccountProfile,
  type AccountState,
  type PassportEndpoints,
  type PassportTokenResponse
} from '../common/passport'
import { clearProviderKey, readProviderKey, writeProviderKey } from './keyVault'
import { readJson, serialQueue, writeJson } from './jsonStore'

const REQUEST_TIMEOUT_MS = 15_000
const DISCOVERY_TTL_MS = 5 * 60_000
const ACCESS_TOKEN_MARGIN_MS = 60_000
const INSTALLATION_SECRET_ID = 'passport-installation'
const REFRESH_TOKEN_SECRET_ID = 'passport-refresh-token'
const MAX_POLL_INTERVAL_SECONDS = 120

interface PersistedAccount {
  profile: AccountProfile | null
  signedInAt: number
  pendingRemoteRevocation: boolean
}

class LoginCancelledError extends Error {
  constructor() {
    super('登录已取消')
    this.name = 'LoginCancelledError'
  }
}

let accountPath = ''
let endpoints: PassportEndpoints | null = null
let endpointsFetchedAt = 0
let accessToken = ''
let accessTokenExpiresAt = 0
let profile: AccountProfile | null = null
let signedInAt = 0
let pendingRemoteRevocation = false
let phase: AccountPhase = 'signed-out'
let statusError = ''
let challenge: AccountState['challenge'] = null
let verificationUriComplete = ''
let loginController: AbortController | null = null
let loginTask: Promise<AccountState> | null = null
let refreshInFlight: Promise<string> | null = null
let restoring = false

const enqueueAccount = serialQueue()

function passportIssuer(): string {
  return normalizeIssuer(process.env['GUEARTH_PASSPORT_ISSUER'] ?? PASSPORT_DEFAULT_ISSUER) || PASSPORT_DEFAULT_ISSUER
}

function passportAccountOrigin(): string {
  const raw = process.env['GUEARTH_PASSPORT_ACCOUNT_ORIGIN'] ?? PASSPORT_DEFAULT_ACCOUNT_ORIGIN
  try {
    return new URL(raw).origin
  } catch {
    return PASSPORT_DEFAULT_ACCOUNT_ORIGIN
  }
}

function passportClientId(): string {
  const raw = process.env['GUEARTH_PASSPORT_CLIENT_ID'] ?? PASSPORT_DEFAULT_CLIENT_ID
  return truncateToUtf8Bytes(raw.trim(), 128)
}

function accountDeviceListUrl(): string {
  return deviceListUrl(passportAccountOrigin())
}

function snapshot(): AccountState {
  return {
    ...signedOutAccountState(accountDeviceListUrl(), statusError, pendingRemoteRevocation),
    phase,
    profile: profile ? { ...profile, scopes: [...profile.scopes] } : null,
    challenge: challenge ? { ...challenge } : null,
    signedInAt
  }
}

function emitState(): void {
  const state = snapshot()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('account:event', state)
  }
}

function setPhase(next: AccountPhase, error = ''): void {
  phase = next
  statusError = error
  logger.info('account', `账户状态：${accountPhaseLabel(next)}`)
  emitState()
}

function fallbackEndpoints(issuer: string): PassportEndpoints {
  return {
    issuer,
    deviceAuthorizationEndpoint: `${issuer}/oauth2/device_authorization`,
    tokenEndpoint: `${issuer}/oauth2/token`,
    userinfoEndpoint: `${issuer}/oauth2/userinfo`,
    revocationEndpoint: `${issuer}/oauth2/revoke`
  }
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function postForm(url: string, body: URLSearchParams, signal: AbortSignal): Promise<Response> {
  return net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: requestSignal(signal),
    redirect: 'error'
  })
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function resolveEndpoints(signal?: AbortSignal): Promise<PassportEndpoints> {
  const issuer = passportIssuer()
  const cached = endpoints
  if (cached && cached.issuer === issuer && Date.now() - endpointsFetchedAt < DISCOVERY_TTL_MS) return cached
  const timeoutSignal = requestSignal(signal)
  try {
    const response = await net.fetch(`${issuer}${PASSPORT_DISCOVERY_PATH}`, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal,
      redirect: 'error'
    })
    if (response.ok) {
      const discovered = parseDiscovery(await readPayload(response), issuer)
      if (discovered) {
        endpoints = discovered
        endpointsFetchedAt = Date.now()
        return discovered
      }
      logger.warn('account', 'Passport discovery 文档缺少设备流端点，已回退到 issuer 标准路径')
    } else {
      logger.warn('account', `Passport discovery 请求返回 HTTP ${response.status}，已回退到 issuer 标准路径`)
    }
  } catch (error) {
    logger.warn('account', 'Passport discovery 请求失败，已回退到 issuer 标准路径', error)
  }
  const fallback = fallbackEndpoints(issuer)
  endpoints = fallback
  endpointsFetchedAt = Date.now()
  return fallback
}

function installationId(): string {
  const existing = readProviderKey(INSTALLATION_SECRET_ID)
  if (isValidInstallationId(existing)) return existing
  const generated = encodeBase64Url(randomBytes(32))
  if (!isValidInstallationId(generated)) throw new Error('无法生成本机安装标识')
  writeProviderKey(INSTALLATION_SECRET_ID, generated)
  return generated
}

function readRefreshToken(): string {
  const value = readProviderKey(REFRESH_TOKEN_SECRET_ID)
  return typeof value === 'string' && value !== '' ? value : ''
}

function writeRefreshToken(value: string): void {
  writeProviderKey(REFRESH_TOKEN_SECRET_ID, value)
}

function forgetTokens(): void {
  accessToken = ''
  accessTokenExpiresAt = 0
  clearProviderKey(REFRESH_TOKEN_SECRET_ID)
}

function readProfileCache(value: unknown): AccountProfile | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.profile !== 'object' || record.profile === null || Array.isArray(record.profile)) return null
  const cached = record.profile as Record<string, unknown>
  if (typeof cached.sub !== 'string' || cached.sub === '') return null
  const scopes = Array.isArray(cached.scopes) ? cached.scopes.filter((scope): scope is string => typeof scope === 'string') : []
  return {
    sub: cached.sub,
    username: typeof cached.username === 'string' ? cached.username : '',
    name: typeof cached.name === 'string' ? cached.name : '',
    email: typeof cached.email === 'string' ? cached.email : '',
    emailVerified: cached.emailVerified === true,
    scopes
  }
}

function readPersistedAccount(value: unknown): PersistedAccount {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const signedIn = typeof record.signedInAt === 'number' && Number.isFinite(record.signedInAt) ? record.signedInAt : 0
  return {
    profile: readProfileCache(value),
    signedInAt: signedIn,
    pendingRemoteRevocation: record.pendingRemoteRevocation === true
  }
}

function persistAccount(): Promise<void> {
  const payload: PersistedAccount = {
    profile: profile ? { ...profile } : null,
    signedInAt,
    pendingRemoteRevocation
  }
  return enqueueAccount(() => writeJson(accountPath, payload))
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new LoginCancelledError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new LoginCancelledError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function clampInterval(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 5
  return Math.min(MAX_POLL_INTERVAL_SECONDS, Math.max(1, Math.round(seconds)))
}

async function fetchUserInfo(token: string, signal?: AbortSignal): Promise<AccountProfile> {
  const active = await resolveEndpoints(signal)
  const response = await net.fetch(active.userinfoEndpoint, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'error'
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    const failure = describeAuthorizationFailure(response.status, payload, retryAfterSeconds(response.headers.get('retry-after')))
    throw Object.assign(new Error(failure.message), { invalidatesSession: failure.invalidatesSession || response.status === 401 })
  }
  const info = parseUserInfo(payload)
  if (!info) throw new Error('鸽巢通行证返回的账户信息无效')
  return {
    sub: info.sub,
    username: info.username,
    name: info.name,
    email: info.email,
    emailVerified: info.emailVerified,
    scopes: scopeParameter(PASSPORT_SCOPES).split(' ').filter(Boolean)
  }
}

async function requestToken(body: URLSearchParams, signal: AbortSignal): Promise<PassportTokenResponse> {
  const active = await resolveEndpoints(signal)
  const response = await postForm(active.tokenEndpoint, body, signal)
  const payload = await readPayload(response)
  if (!response.ok) {
    const failure = describeAuthorizationFailure(response.status, payload, retryAfterSeconds(response.headers.get('retry-after')))
    throw Object.assign(new Error(failure.message), {
      terminal: failure.terminal,
      slowDown: failure.slowDown,
      retryable: failure.retryable,
      retryAfterSeconds: failure.retryAfterSeconds,
      invalidatesSession: failure.invalidatesSession
    })
  }
  const tokens = parseTokenResponse(payload)
  if (!tokens) throw new Error('登录服务返回的数据无效，请重新发起登录')
  return tokens
}

async function exchangeDeviceCode(deviceCode: string, initialInterval: number, expiresAt: number, signal: AbortSignal): Promise<PassportTokenResponse> {
  let interval = clampInterval(initialInterval)
  for (;;) {
    await delay(interval * 1000, signal)
    if (Date.now() >= expiresAt) throw new Error('登录确认已超时，请重新发起登录')
    let tokens: PassportTokenResponse
    try {
      tokens = await requestToken(
        new URLSearchParams({
          grant_type: PASSPORT_DEVICE_GRANT_TYPE,
          client_id: passportClientId(),
          device_code: deviceCode
        }),
        signal
      )
    } catch (error) {
      if (signal.aborted) throw new LoginCancelledError()
      const failure = error as Error & { terminal?: boolean; slowDown?: boolean; retryable?: boolean; retryAfterSeconds?: number }
      if (failure.slowDown) {
        interval = clampInterval(interval + SLOW_DOWN_INCREMENT_SECONDS)
        continue
      }
      if (!failure.terminal && Date.now() < expiresAt) {
        const wait = failure.retryAfterSeconds && failure.retryAfterSeconds > 0 ? failure.retryAfterSeconds : interval
        interval = clampInterval(Math.max(wait, interval))
        continue
      }
      throw error
    }
    return tokens
  }
}

async function adoptTokens(tokens: PassportTokenResponse): Promise<AccountProfile> {
  writeRefreshToken(tokens.refreshToken)
  accessToken = tokens.accessToken
  accessTokenExpiresAt = Date.now() + tokens.expiresIn * 1000
  const scopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [...PASSPORT_SCOPES]
  let nextProfile: AccountProfile
  try {
    nextProfile = await fetchUserInfo(accessToken)
    nextProfile = { ...nextProfile, scopes }
  } catch (error) {
    logger.warn('account', '令牌已签发但获取账户信息失败', error)
    nextProfile = { sub: '', username: '', name: '', email: '', emailVerified: false, scopes }
  }
  profile = nextProfile
  signedInAt = Date.now()
  pendingRemoteRevocation = false
  await persistAccount()
  return nextProfile
}

async function startLogin(): Promise<AccountState> {
  if (loginController) throw new Error('已有登录流程正在进行')
  if (phase === 'signed-in') throw new Error('当前已登录，请先退出登录')
  if (readRefreshToken()) {
    await restoreSession()
    if (snapshot().phase === 'signed-in') return snapshot()
  }
  const controller = new AbortController()
  loginController = controller
  challenge = null
  verificationUriComplete = ''
  let adopted = false
  try {
    setPhase('creating')
    const installation = installationId()
    const deviceName = buildDeviceName(hostname())
    if (!isValidInstallationId(installation)) throw new Error('本机安装标识无效，无法发起登录')
    if (!isValidDeviceName(deviceName)) throw new Error('设备名称无效，无法发起登录')
    const created = await resolveEndpoints(controller.signal)
    const response = await postForm(
      created.deviceAuthorizationEndpoint,
      new URLSearchParams({
        client_id: passportClientId(),
        scope: scopeParameter(PASSPORT_SCOPES),
        installation_id: installation,
        device_name: deviceName,
        platform: passportPlatform(process.platform)
      }),
      controller.signal
    )
    const payload = await readPayload(response)
    if (!response.ok) {
      const failure = describeAuthorizationFailure(response.status, payload, retryAfterSeconds(response.headers.get('retry-after')))
      throw new Error(failure.message)
    }
    const accountOrigin = passportAccountOrigin()
    const authorization = parseDeviceAuthorization(payload, accountOrigin)
    if (!authorization) throw new Error('登录确认信息无效，请重新发起登录')
    if (!isTrustedVerificationUriComplete(authorization.verificationUriComplete, accountOrigin)) {
      throw new Error('登录确认页地址不受信任，已终止本次登录')
    }
    const expiresAt = Date.now() + authorization.expiresIn * 1000
    challenge = {
      userCode: authorization.userCode,
      verificationUri: authorization.verificationUri,
      expiresAt,
      interval: authorization.interval
    }
    verificationUriComplete = authorization.verificationUriComplete
    setPhase('awaiting-approval')
    void shell.openExternal(authorization.verificationUriComplete).catch(() => undefined)
    const tokens = await exchangeDeviceCode(authorization.deviceCode, authorization.interval, expiresAt, controller.signal)
    if (controller.signal.aborted) throw new LoginCancelledError()
    setPhase('finalizing')
    await adoptTokens(tokens)
    adopted = true
    if (controller.signal.aborted) throw new LoginCancelledError()
    challenge = null
    verificationUriComplete = ''
    setPhase('signed-in')
    return snapshot()
  } catch (error) {
    challenge = null
    verificationUriComplete = ''
    if (error instanceof LoginCancelledError || controller.signal.aborted) {
      if (adopted) await discardAdoptedSession()
      else setPhase('signed-out')
      return snapshot()
    }
    const message = error instanceof Error ? error.message : '登录失败，请稍后再试'
    logger.error('account', '设备登录失败', message)
    setPhase('signed-out', message)
    return snapshot()
  } finally {
    loginController = null
  }
}

function cancelLogin(): void {
  loginController?.abort()
}

function beginLogin(): Promise<AccountState> {
  if (loginTask) return Promise.reject(new Error('已有登录流程正在进行'))
  const task = startLogin()
  loginTask = task
  void task.then(
    () => {
      if (loginTask === task) loginTask = null
    },
    () => {
      if (loginTask === task) loginTask = null
    }
  )
  return task
}

async function refreshAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiresAt - ACCESS_TOKEN_MARGIN_MS) return accessToken
  if (refreshInFlight) return refreshInFlight
  const refreshToken = readRefreshToken()
  if (!refreshToken) throw new Error('登录状态已失效，请重新登录')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const task = (async () => {
    try {
      const body = new URLSearchParams()
      body.set('grant_type', PASSPORT_REFRESH_GRANT_TYPE)
      body.set('client_id', passportClientId())
      body.set('refresh_token', refreshToken)
      const tokens = await requestToken(body, controller.signal)
      accessToken = tokens.accessToken
      accessTokenExpiresAt = Date.now() + tokens.expiresIn * 1000
      writeRefreshToken(tokens.refreshToken)
      return accessToken
    } finally {
      clearTimeout(timer)
    }
  })()
  refreshInFlight = task
  try {
    return await task
  } catch (error) {
    const failure = error as Error & { invalidatesSession?: boolean }
    if (failure.invalidatesSession) await endSessionLocally('登录状态已失效，请重新登录')
    throw error
  } finally {
    refreshInFlight = null
  }
}

async function endSessionLocally(error: string, pendingRevocation = false): Promise<void> {
  cancelLogin()
  forgetTokens()
  profile = null
  signedInAt = 0
  challenge = null
  verificationUriComplete = ''
  pendingRemoteRevocation = pendingRevocation
  await persistAccount()
  setPhase('signed-out', error)
}

async function discardAdoptedSession(): Promise<void> {
  const refreshToken = readRefreshToken()
  let revokedRemotely = true
  if (refreshToken) {
    revokedRemotely = await revokeRemote(refreshToken, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  }
  await endSessionLocally('', refreshToken !== '' && !revokedRemotely)
}

async function revokeRemote(refreshToken: string, signal: AbortSignal): Promise<boolean> {
  try {
    const active = await resolveEndpoints(signal)
    const body = new URLSearchParams()
    body.set('client_id', passportClientId())
    body.set('token', refreshToken)
    body.set('token_type_hint', 'refresh_token')
    const response = await postForm(active.revocationEndpoint, body, signal)
    if (response.ok) return true
    logger.warn('account', `Passport 撤销请求返回 HTTP ${response.status}`)
    return false
  } catch (error) {
    logger.warn('account', 'Passport 撤销请求失败', error)
    return false
  }
}

async function signOut(): Promise<AccountState> {
  if (phase === 'signing-out') return snapshot()
  cancelLogin()
  await loginTask?.catch(() => undefined)
  const refreshToken = readRefreshToken()
  setPhase('signing-out')
  let revokedRemotely = true
  if (refreshToken) {
    revokedRemotely = await revokeRemote(refreshToken, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  }
  forgetTokens()
  profile = null
  signedInAt = 0
  challenge = null
  verificationUriComplete = ''
  pendingRemoteRevocation = refreshToken !== '' && !revokedRemotely
  await persistAccount()
  if (pendingRemoteRevocation) {
    setPhase('signed-out', '本机已退出登录，但鸽巢通行证端的设备授权未能撤销，请到账号页的设备列表手动撤销此设备')
  } else {
    setPhase('signed-out')
  }
  return snapshot()
}

async function restoreSession(): Promise<void> {
  if (restoring) return
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    if (profile || signedInAt) {
      profile = null
      signedInAt = 0
      await persistAccount()
      emitState()
    }
    return
  }
  restoring = true
  setPhase('restoring')
  try {
    await refreshAccessToken()
    try {
      const info = await fetchUserInfo(accessToken)
      profile = { ...info, scopes: profile?.scopes?.length ? profile.scopes : info.scopes }
    } catch (error) {
      if ((error as Error & { invalidatesSession?: boolean }).invalidatesSession) throw error
      if (!profile) throw error
      logger.warn('account', '恢复登录状态时获取账户信息失败，已沿用本机缓存的账户信息', error)
    }
    signedInAt = signedInAt || Date.now()
    pendingRemoteRevocation = false
    await persistAccount()
    setPhase('signed-in')
  } catch (error) {
    const message = error instanceof Error ? error.message : '恢复登录状态失败'
    if (phase === 'signed-out') {
      logger.warn('account', '恢复登录状态失败，令牌已失效并清理', message)
    } else {
      logger.warn('account', '恢复登录状态失败，已保留本机令牌以便重试', message)
      setPhase('signed-out', '暂时无法验证登录状态，请检查网络后重试')
    }
  } finally {
    restoring = false
  }
}

async function dismissRevocationWarning(): Promise<AccountState> {
  if (!pendingRemoteRevocation) return snapshot()
  pendingRemoteRevocation = false
  await persistAccount()
  setPhase('signed-out')
  return snapshot()
}

async function openAccountDevices(): Promise<void> {
  const url = accountDeviceListUrl()
  if (!url) throw new Error('账号页地址不可用')
  await shell.openExternal(url)
}

async function openVerificationPage(): Promise<void> {
  const url = verificationUriComplete
  if (!url || !isTrustedVerificationUriComplete(url, passportAccountOrigin())) throw new Error('当前没有可打开的登录确认页')
  await shell.openExternal(url)
}

export function initAccount(): void {
  accountPath = join(app.getPath('userData'), 'account.json')
  ipcMain.handle('account:get-state', (): AccountState => snapshot())
  ipcMain.handle('account:login', (): Promise<AccountState> => beginLogin())
  ipcMain.handle('account:cancel-login', async (): Promise<AccountState> => {
    cancelLogin()
    await loginTask?.catch(() => undefined)
    return snapshot()
  })
  ipcMain.handle('account:sign-out', (): Promise<AccountState> => signOut())
  ipcMain.handle('account:dismiss-revocation-warning', (): Promise<AccountState> => dismissRevocationWarning())
  ipcMain.handle('account:open-device-list', (): Promise<void> => openAccountDevices())
  ipcMain.handle('account:open-verification', (): Promise<void> => openVerificationPage())

  void (async () => {
    try {
      const persisted = readPersistedAccount(await readJson(accountPath))
      profile = persisted.profile
      signedInAt = persisted.signedInAt
      pendingRemoteRevocation = persisted.pendingRemoteRevocation
      if (profile) emitState()
    } catch {
      profile = null
    }
    await restoreSession()
  })()
}
