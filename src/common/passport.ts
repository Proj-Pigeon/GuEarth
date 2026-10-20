export type PassportPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other'

export const PASSPORT_PLATFORMS: readonly PassportPlatform[] = ['windows', 'macos', 'linux', 'android', 'ios', 'other']

export const PASSPORT_DEFAULT_ISSUER = 'https://passport.project-pigeon.com'
export const PASSPORT_DEFAULT_ACCOUNT_ORIGIN = 'https://account.project-pigeon.com'
export const PASSPORT_DEFAULT_CLIENT_ID = 'cli_TZ4_-PaJDbmX2wlKY-fpsQ'
export const PASSPORT_APP_LABEL = 'GuEarth'
export const PASSPORT_SCOPES: readonly string[] = ['openid', 'profile', 'email']
export const PASSPORT_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
export const PASSPORT_REFRESH_GRANT_TYPE = 'refresh_token'
export const PASSPORT_DISCOVERY_PATH = '/.well-known/openid-configuration'
export const PASSPORT_DEVICE_VERIFICATION_PATH = '/device'
export const PASSPORT_DEVICE_LIST_PATH = '/account/security'

export const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const MAX_CLIENT_ID_BYTES = 128
export const MAX_DEVICE_NAME_BYTES = 160
export const MAX_SECRET_BYTES = 4096
export const SLOW_DOWN_INCREMENT_SECONDS = 5
export const DEFAULT_POLL_INTERVAL_SECONDS = 5
export const MAX_POLL_INTERVAL_SECONDS = 120
export const MAX_RETRY_AFTER_SECONDS = 600

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function utf8ByteLength(value: string): number {
  let length = 0
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x80) length += 1
    else if (code < 0x800) length += 2
    else if (code < 0x10000) length += 3
    else length += 4
  }
  return length
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = ''
  let accumulator = 0
  let bits = 0
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte
    bits += 8
    while (bits >= 6) {
      bits -= 6
      output += BASE64URL_ALPHABET[(accumulator >>> bits) & 0x3f]
    }
  }
  if (bits > 0) output += BASE64URL_ALPHABET[(accumulator << (6 - bits)) & 0x3f]
  return output
}

export function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value
  let output = ''
  for (const character of value) {
    const candidate = output + character
    if (utf8ByteLength(candidate) > maxBytes) break
    output = candidate
  }
  return output
}

export function isValidInstallationId(value: unknown): value is string {
  return typeof value === 'string' && INSTALLATION_ID_PATTERN.test(value)
}

export function sanitizeDeviceNameText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isValidDeviceName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value !== value.trim()) return false
  if (value === '') return false
  if (/[\u0000\u000a\u000d]/.test(value)) return false
  return utf8ByteLength(value) <= MAX_DEVICE_NAME_BYTES
}

export function buildDeviceName(hostname: string): string {
  const cleaned = sanitizeDeviceNameText(typeof hostname === 'string' ? hostname : '')
  const candidate = cleaned ? `${PASSPORT_APP_LABEL} · ${cleaned}` : PASSPORT_APP_LABEL
  const truncated = truncateToUtf8Bytes(candidate, MAX_DEVICE_NAME_BYTES).replace(/[\s·]+$/u, '')
  return truncated === '' ? PASSPORT_APP_LABEL : truncated
}

export function passportPlatform(platform: string): PassportPlatform {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  if (platform === 'android') return 'android'
  if (PASSPORT_PLATFORMS.includes(platform as PassportPlatform)) return platform as PassportPlatform
  return 'other'
}

export function scopeParameter(scopes: readonly string[]): string {
  return [...new Set(scopes.filter((scope) => /^[A-Za-z0-9:._-]{1,80}$/.test(scope)))].join(' ')
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

export function parseAbsoluteUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHostname(url.hostname))) return null
  return url
}

export function isTrustedVerificationUri(value: unknown, accountOrigin: string): value is string {
  const url = parseAbsoluteUrl(value)
  const origin = parseAbsoluteUrl(accountOrigin)
  if (!url || !origin) return false
  if (url.origin !== origin.origin) return false
  return url.pathname === PASSPORT_DEVICE_VERIFICATION_PATH
}

export function isTrustedVerificationUriComplete(value: unknown, accountOrigin: string): value is string {
  if (!isTrustedVerificationUri(value, accountOrigin)) return false
  const url = new URL(value)
  for (const key of url.searchParams.keys()) {
    if (key !== 'user_code') return false
  }
  return true
}

export function buildVerificationUriComplete(verificationUri: string, userCode: string): string {
  const url = new URL(verificationUri)
  url.search = ''
  url.searchParams.set('user_code', userCode)
  return url.toString()
}

export function deviceListUrl(accountOrigin: string): string {
  const origin = parseAbsoluteUrl(accountOrigin)
  if (!origin) return ''
  origin.pathname = PASSPORT_DEVICE_LIST_PATH
  origin.search = ''
  return origin.toString()
}

export function retryAfterSeconds(headerValue: string | null): number {
  if (typeof headerValue !== 'string') return 0
  const seconds = Number.parseInt(headerValue.trim(), 10)
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(MAX_RETRY_AFTER_SECONDS, seconds)
}

export interface PassportEndpoints {
  issuer: string
  deviceAuthorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  revocationEndpoint: string
}

function endpointUnderIssuer(payload: Record<string, unknown>, key: string, issuerUrl: URL): string {
  const url = parseAbsoluteUrl(payload[key])
  if (!url) return ''
  if (url.origin !== issuerUrl.origin) return ''
  return url.toString()
}

export function normalizeIssuer(value: unknown): string {
  const url = parseAbsoluteUrl(value)
  if (!url) return ''
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function parseDiscovery(payload: unknown, expectedIssuer?: string): PassportEndpoints | null {
  if (!isRecord(payload)) return null
  const issuer = normalizeIssuer(payload.issuer)
  if (!issuer) return null
  if (expectedIssuer !== undefined && normalizeIssuer(expectedIssuer) !== issuer) return null
  const issuerUrl = parseAbsoluteUrl(issuer)
  if (!issuerUrl) return null
  const deviceAuthorizationEndpoint = endpointUnderIssuer(payload, 'device_authorization_endpoint', issuerUrl)
  const tokenEndpoint = endpointUnderIssuer(payload, 'token_endpoint', issuerUrl)
  const userinfoEndpoint = endpointUnderIssuer(payload, 'userinfo_endpoint', issuerUrl)
  const revocationEndpoint = endpointUnderIssuer(payload, 'revocation_endpoint', issuerUrl)
  if (!deviceAuthorizationEndpoint || !tokenEndpoint || !userinfoEndpoint || !revocationEndpoint) return null
  return { issuer, deviceAuthorizationEndpoint, tokenEndpoint, userinfoEndpoint, revocationEndpoint }
}

export interface DeviceAuthorizationChallenge {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

function boundedString(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '' || utf8ByteLength(trimmed) > maxBytes) return ''
  return trimmed
}

function positiveNumber(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(max, value)
}

export function parseDeviceAuthorization(payload: unknown, accountOrigin: string): DeviceAuthorizationChallenge | null {
  if (!isRecord(payload)) return null
  const deviceCode = boundedString(payload.device_code, 512)
  const userCode = boundedString(payload.user_code, 64)
  if (!deviceCode || !userCode) return null
  if (!isTrustedVerificationUri(payload.verification_uri, accountOrigin)) return null
  const verificationUri = new URL(payload.verification_uri as string)
  verificationUri.search = ''
  const advertisedComplete = payload.verification_uri_complete
  const hasAdvertisedComplete = advertisedComplete !== undefined && advertisedComplete !== null && advertisedComplete !== ''
  if (hasAdvertisedComplete && !isTrustedVerificationUriComplete(advertisedComplete, accountOrigin)) return null
  const complete = hasAdvertisedComplete
    ? (advertisedComplete as string)
    : buildVerificationUriComplete(verificationUri.toString(), userCode)
  if (!isTrustedVerificationUriComplete(complete, accountOrigin)) return null
  return {
    deviceCode,
    userCode,
    verificationUri: verificationUri.toString(),
    verificationUriComplete: complete,
    expiresIn: positiveNumber(payload.expires_in, 600, 3600),
    interval: positiveNumber(payload.interval, DEFAULT_POLL_INTERVAL_SECONDS, MAX_POLL_INTERVAL_SECONDS)
  }
}

export interface PassportTokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  scope: string
}

export function parseTokenResponse(payload: unknown): PassportTokenResponse | null {
  if (!isRecord(payload)) return null
  const accessToken = boundedString(payload.access_token, MAX_SECRET_BYTES)
  const refreshToken = boundedString(payload.refresh_token, MAX_SECRET_BYTES)
  if (!accessToken || !refreshToken) return null
  const tokenType = typeof payload.token_type === 'string' ? payload.token_type.trim().toLowerCase() : ''
  if (tokenType !== '' && tokenType !== 'bearer') return null
  return {
    accessToken,
    refreshToken,
    tokenType: tokenType === '' ? 'bearer' : tokenType,
    expiresIn: positiveNumber(payload.expires_in, 600, 86_400),
    scope: typeof payload.scope === 'string' ? payload.scope.trim().slice(0, 2048) : ''
  }
}

export interface PassportUserInfo {
  sub: string
  username: string
  name: string
  email: string
  emailVerified: boolean
}

export function parseUserInfo(payload: unknown): PassportUserInfo | null {
  if (!isRecord(payload)) return null
  const sub = boundedString(payload.sub, 256)
  if (!sub) return null
  return {
    sub,
    username: boundedString(payload.preferred_username, 256),
    name: boundedString(payload.name, 256),
    email: boundedString(payload.email, 320),
    emailVerified: payload.email_verified === true
  }
}

export interface AuthorizationFailure {
  message: string
  terminal: boolean
  slowDown: boolean
  retryable: boolean
  retryAfterSeconds: number
  invalidatesSession: boolean
}

export function parseOAuthError(payload: unknown): { error: string; description: string } | null {
  if (!isRecord(payload)) return null
  const error = typeof payload.error === 'string' ? payload.error.trim() : ''
  if (!error) return null
  return { error, description: typeof payload.error_description === 'string' ? payload.error_description : '' }
}

export function parseErrorEnvelope(payload: unknown): { code: string; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null
  const code = typeof payload.error.code === 'string' ? payload.error.code.trim() : ''
  if (!code) return null
  return { code, message: typeof payload.error.message === 'string' ? payload.error.message : '' }
}

const TOKEN_ERROR_MESSAGES: Record<string, string> = {
  authorization_pending: '等待在浏览器中确认登录',
  slow_down: '操作过于频繁，已自动延长等待时间',
  access_denied: '登录已被拒绝',
  expired_token: '登录确认已超时，请重新发起登录',
  invalid_grant: '登录授权已失效，请重新发起登录',
  unauthorized_client: '当前应用暂时无法登录，请更新后重试',
  invalid_request: '登录请求无效，请重新发起登录',
  invalid_client: '登录服务暂时不可用，请稍后再试',
  unsupported_grant_type: '登录服务暂时不可用，请更新应用后重试',
  invalid_scope: '登录权限异常，请重新发起登录',
  temporarily_unavailable: '鸽巢通行证服务暂时不可用，请稍后再试',
  server_error: '鸽巢通行证服务出现故障，请稍后再试'
}

const TERMINAL_TOKEN_ERRORS = new Set([
  'access_denied',
  'expired_token',
  'invalid_grant',
  'unauthorized_client',
  'invalid_request',
  'invalid_client',
  'unsupported_grant_type',
  'invalid_scope'
])

const SESSION_INVALIDATING_TOKEN_ERRORS = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client', 'unsupported_grant_type'])

const ENVELOPE_MESSAGES: Record<string, string> = {
  rate_limited: '操作过于频繁，请稍后再试',
  dependency_unavailable: '鸽巢通行证服务暂时不可用，请稍后再试',
  internal_error: '鸽巢通行证服务出现故障，请稍后再试',
  validation_failed: '登录请求无效，请重新发起登录'
}

function failure(
  message: string,
  options: Partial<AuthorizationFailure> = {}
): AuthorizationFailure {
  return {
    message,
    terminal: options.terminal ?? false,
    slowDown: options.slowDown ?? false,
    retryable: options.retryable ?? false,
    retryAfterSeconds: options.retryAfterSeconds ?? 0,
    invalidatesSession: options.invalidatesSession ?? false
  }
}

export function describeAuthorizationFailure(status: number, payload: unknown, retryAfter: number): AuthorizationFailure {
  const oauthError = parseOAuthError(payload)
  if (oauthError) {
    const message = TOKEN_ERROR_MESSAGES[oauthError.error] ?? `登录失败（${oauthError.error}）`
    return failure(message, {
      terminal: TERMINAL_TOKEN_ERRORS.has(oauthError.error),
      slowDown: oauthError.error === 'slow_down',
      retryable: oauthError.error === 'authorization_pending' || oauthError.error === 'temporarily_unavailable' || oauthError.error === 'server_error',
      retryAfterSeconds: retryAfter,
      invalidatesSession: SESSION_INVALIDATING_TOKEN_ERRORS.has(oauthError.error)
    })
  }
  const envelope = parseErrorEnvelope(payload)
  if (envelope) {
    const message = ENVELOPE_MESSAGES[envelope.code] ?? '登录服务暂时不可用，请稍后再试'
    return failure(message, {
      terminal: envelope.code === 'validation_failed',
      retryable: envelope.code !== 'validation_failed',
      retryAfterSeconds: retryAfter
    })
  }
  if (status === 429) return failure(ENVELOPE_MESSAGES.rate_limited, { retryable: true, retryAfterSeconds: retryAfter })
  if (status >= 500) return failure('鸽巢通行证服务暂时不可用，请稍后再试', { retryable: true, retryAfterSeconds: retryAfter })
  if (status === 401 || status === 403) return failure('登录服务拒绝了本次请求，请稍后再试', { terminal: true })
  return failure('登录服务暂时不可用，请稍后再试', { terminal: status < 500 })
}

export type AccountPhase =
  | 'signed-out'
  | 'creating'
  | 'awaiting-approval'
  | 'finalizing'
  | 'signed-in'
  | 'restoring'
  | 'signing-out'

export interface AccountDeviceChallenge {
  userCode: string
  verificationUri: string
  expiresAt: number
  interval: number
}

export interface AccountProfile {
  sub: string
  username: string
  name: string
  email: string
  emailVerified: boolean
  scopes: string[]
}

export interface AccountState {
  phase: AccountPhase
  profile: AccountProfile | null
  challenge: AccountDeviceChallenge | null
  signedInAt: number
  error: string
  pendingRemoteRevocation: boolean
  deviceListUrl: string
}

export function signedOutAccountState(deviceListUrlValue: string, error = '', pendingRemoteRevocation = false): AccountState {
  return {
    phase: 'signed-out',
    profile: null,
    challenge: null,
    signedInAt: 0,
    error,
    pendingRemoteRevocation,
    deviceListUrl: deviceListUrlValue
  }
}

export function accountPhaseLabel(phase: AccountPhase): string {
  switch (phase) {
    case 'creating':
      return '正在发起登录'
    case 'awaiting-approval':
      return '等待浏览器确认'
    case 'finalizing':
      return '正在完成登录'
    case 'restoring':
      return '正在恢复登录状态'
    case 'signing-out':
      return '正在退出登录'
    case 'signed-in':
      return '已登录'
    default:
      return '未登录'
  }
}
