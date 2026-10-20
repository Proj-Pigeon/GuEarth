import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import {
  accountPhaseLabel,
  buildDeviceName,
  buildVerificationUriComplete,
  describeAuthorizationFailure,
  deviceListUrl,
  encodeBase64Url,
  isValidDeviceName,
  isValidInstallationId,
  isTrustedVerificationUri,
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
  utf8ByteLength,
  INSTALLATION_ID_PATTERN,
  PASSPORT_DEFAULT_ACCOUNT_ORIGIN,
  PASSPORT_DEFAULT_CLIENT_ID,
  PASSPORT_DEFAULT_ISSUER,
  PASSPORT_SCOPES
} from '../src/common/passport.ts'

const ACCOUNT_ORIGIN = 'https://account.project-pigeon.com'
const ISSUER = 'https://passport.project-pigeon.com'

test('encodeBase64Url produces the 43-character unpadded installation identifier shape required by Passport', () => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const encoded = encodeBase64Url(randomBytes(32))
    assert.equal(encoded.length, 43)
    assert.match(encoded, INSTALLATION_ID_PATTERN)
    assert.ok(isValidInstallationId(encoded))
  }
})

test('encodeBase64Url uses the URL-safe alphabet and never emits padding', () => {
  const encoded = encodeBase64Url(new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x10]))
  assert.ok(!encoded.includes('='))
  assert.ok(!encoded.includes('+'))
  assert.ok(!encoded.includes('/'))
  assert.equal(encoded, encodeBase64Url(new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x10])))
})

test('isValidInstallationId rejects every shape Passport would answer with invalid_request', () => {
  const rejected = [
    '',
    'xQ9r2mB7LdA1nF0vH3tY6kP8sJ4uWzC5aRbNqEoTgD',
    'xQ9r2mB7LdA1nF0vH3tY6kP8sJ4uWzC5aRbNqEoTgDff',
    'xQ9r2mB7LdA1nF0vH3tY6kP8sJ4uWzC5aRbNqEoTgD=',
    'xQ9r2mB7LdA1nF0vH3tY6kP8sJ4uWzC5aRbNqEoTg+f',
    ' xQ9r2mB7LdA1nF0vH3tY6kP8sJ4uWzC5aRbNqEoTgDf',
    null,
    undefined,
    42
  ]
  for (const value of rejected) assert.equal(isValidInstallationId(value), false, String(value))
})

test('passportPlatform maps Electron process.platform values onto the Passport enum', () => {
  assert.equal(passportPlatform('win32'), 'windows')
  assert.equal(passportPlatform('darwin'), 'macos')
  assert.equal(passportPlatform('linux'), 'linux')
  assert.equal(passportPlatform('android'), 'android')
  assert.equal(passportPlatform('freebsd'), 'other')
  assert.equal(passportPlatform(''), 'other')
})

test('buildDeviceName stays within the 160-byte limit and drops control characters', () => {
  assert.equal(buildDeviceName('Work laptop'), 'GuEarth · Work laptop')
  assert.equal(buildDeviceName(''), 'GuEarth')
  assert.equal(buildDeviceName('  Desk\ttop\r\n  '), 'GuEarth · Desk top')
  const long = buildDeviceName('机'.repeat(200))
  assert.ok(isValidDeviceName(long))
  assert.ok(utf8ByteLength(long) <= 160)
  assert.ok(long.startsWith('GuEarth'))
})

test('isValidDeviceName enforces the Passport device_name contract', () => {
  assert.equal(isValidDeviceName('GuEarth · Work laptop'), true)
  assert.equal(isValidDeviceName('GuEarth'), true)
  assert.equal(isValidDeviceName(''), false)
  assert.equal(isValidDeviceName('   '), false)
  assert.equal(isValidDeviceName(' padded '), false)
  assert.equal(isValidDeviceName('line\nbreak'), false)
  assert.equal(isValidDeviceName('carriage\rreturn'), false)
  assert.equal(isValidDeviceName('nul\0byte'), false)
  assert.equal(isValidDeviceName('机'.repeat(60)), false)
  assert.equal(isValidDeviceName(42), false)
})

test('utf8ByteLength and truncateToUtf8Bytes count code points, not UTF-16 units', () => {
  assert.equal(utf8ByteLength('abc'), 3)
  assert.equal(utf8ByteLength('机器'), 6)
  assert.equal(utf8ByteLength('𝄞'), 4)
  assert.equal(truncateToUtf8Bytes('机器', 5), '机')
  assert.equal(truncateToUtf8Bytes('𝄞ab', 5), '𝄞a')
  assert.equal(truncateToUtf8Bytes('abc', 10), 'abc')
})

test('scopeParameter deduplicates, drops malformed scopes and joins with single spaces', () => {
  assert.equal(scopeParameter(PASSPORT_SCOPES), 'openid profile email')
  assert.equal(scopeParameter(['openid', 'openid', 'profile']), 'openid profile')
  assert.equal(scopeParameter(['openid', 'bad scope', '']), 'openid')
  assert.equal(scopeParameter([]), '')
})

test('normalizeIssuer strips trailing slashes, query and fragment but keeps the path', () => {
  assert.equal(normalizeIssuer(`${ISSUER}/`), ISSUER)
  assert.equal(normalizeIssuer(`${ISSUER}//`), ISSUER)
  assert.equal(normalizeIssuer(`${ISSUER}/?x=1#y`), ISSUER)
  assert.equal(normalizeIssuer(`${ISSUER}/tenant`), `${ISSUER}/tenant`)
  assert.equal(normalizeIssuer('http://localhost:8080'), 'http://localhost:8080')
  assert.equal(normalizeIssuer('passport.example.com'), '')
  assert.equal(normalizeIssuer('ftp://passport.example.com'), '')
  assert.equal(normalizeIssuer('http://passport.example.com'), '')
  assert.equal(normalizeIssuer(42), '')
})

test('parseDiscovery only accepts device-flow endpoints that share the issuer origin', () => {
  const discovered = parseDiscovery(
    {
      issuer: `${ISSUER}/`,
      device_authorization_endpoint: `${ISSUER}/oauth2/device_authorization`,
      token_endpoint: `${ISSUER}/oauth2/token`,
      userinfo_endpoint: `${ISSUER}/oauth2/userinfo`,
      revocation_endpoint: `${ISSUER}/oauth2/revoke`
    },
    ISSUER
  )
  assert.deepEqual(discovered, {
    issuer: ISSUER,
    deviceAuthorizationEndpoint: `${ISSUER}/oauth2/device_authorization`,
    tokenEndpoint: `${ISSUER}/oauth2/token`,
    userinfoEndpoint: `${ISSUER}/oauth2/userinfo`,
    revocationEndpoint: `${ISSUER}/oauth2/revoke`
  })
})

test('parseDiscovery rejects mismatched issuers, foreign origins and missing endpoints', () => {
  const base = {
    issuer: ISSUER,
    device_authorization_endpoint: `${ISSUER}/oauth2/device_authorization`,
    token_endpoint: `${ISSUER}/oauth2/token`,
    userinfo_endpoint: `${ISSUER}/oauth2/userinfo`,
    revocation_endpoint: `${ISSUER}/oauth2/revoke`
  }
  assert.equal(parseDiscovery(base, 'https://evil.example'), null)
  assert.equal(parseDiscovery({ ...base, token_endpoint: 'https://evil.example/oauth2/token' }, ISSUER), null)
  assert.equal(parseDiscovery({ ...base, revocation_endpoint: undefined }, ISSUER), null)
  assert.equal(parseDiscovery({ ...base, issuer: undefined }, ISSUER), null)
  assert.equal(parseDiscovery(null, ISSUER), null)
  assert.equal(parseDiscovery([], ISSUER), null)
})

test('verification URIs are only trusted on the account origin at the fixed /device path', () => {
  assert.equal(isTrustedVerificationUri(`${ACCOUNT_ORIGIN}/device`, ACCOUNT_ORIGIN), true)
  assert.equal(isTrustedVerificationUri(`${ACCOUNT_ORIGIN}/device/`, ACCOUNT_ORIGIN), false)
  assert.equal(isTrustedVerificationUri(`${ACCOUNT_ORIGIN}/account/security`, ACCOUNT_ORIGIN), false)
  assert.equal(isTrustedVerificationUri(`${ISSUER}/device`, ACCOUNT_ORIGIN), false)
  assert.equal(isTrustedVerificationUri('https://evil.example/device', ACCOUNT_ORIGIN), false)
  assert.equal(isTrustedVerificationUri(`${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`, ACCOUNT_ORIGIN), true)
  assert.equal(isTrustedVerificationUri('not a url', ACCOUNT_ORIGIN), false)
})

test('verification_uri_complete only allows the user_code query parameter', () => {
  assert.equal(isTrustedVerificationUriComplete(`${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`, ACCOUNT_ORIGIN), true)
  assert.equal(isTrustedVerificationUriComplete(`${ACCOUNT_ORIGIN}/device`, ACCOUNT_ORIGIN), true)
  assert.equal(isTrustedVerificationUriComplete(`${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK&device_code=secret`, ACCOUNT_ORIGIN), false)
  assert.equal(isTrustedVerificationUriComplete(`${ACCOUNT_ORIGIN}/device?state=x`, ACCOUNT_ORIGIN), false)
})

test('buildVerificationUriComplete rebuilds from the trusted base and encodes the user code', () => {
  assert.equal(
    buildVerificationUriComplete(`${ACCOUNT_ORIGIN}/device`, 'BCDF-GHJK'),
    `${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`
  )
  assert.equal(
    buildVerificationUriComplete(`${ACCOUNT_ORIGIN}/device?device_code=leaked`, 'BCDF GHJK'),
    `${ACCOUNT_ORIGIN}/device?user_code=BCDF+GHJK`
  )
})

test('parseDeviceAuthorization keeps the challenge only when the verification origin is trusted', () => {
  const parsed = parseDeviceAuthorization(
    {
      device_code: 'opaque-device-code',
      user_code: 'BCDF-GHJK',
      verification_uri: `${ACCOUNT_ORIGIN}/device`,
      verification_uri_complete: `${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`,
      expires_in: 600,
      interval: 5
    },
    ACCOUNT_ORIGIN
  )
  assert.deepEqual(parsed, {
    deviceCode: 'opaque-device-code',
    userCode: 'BCDF-GHJK',
    verificationUri: `${ACCOUNT_ORIGIN}/device`,
    verificationUriComplete: `${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`,
    expiresIn: 600,
    interval: 5
  })
})

test('parseDeviceAuthorization rebuilds a missing complete URI and falls back to documented defaults', () => {
  const parsed = parseDeviceAuthorization(
    {
      device_code: 'opaque-device-code',
      user_code: 'BCDF-GHJK',
      verification_uri: `${ACCOUNT_ORIGIN}/device`
    },
    ACCOUNT_ORIGIN
  )
  assert.equal(parsed?.verificationUriComplete, `${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`)
  assert.equal(parsed?.expiresIn, 600)
  assert.equal(parsed?.interval, 5)
})

test('parseDeviceAuthorization rejects cross-origin verification pages, empty codes and malformed payloads', () => {
  const valid = {
    device_code: 'opaque-device-code',
    user_code: 'BCDF-GHJK',
    verification_uri: `${ACCOUNT_ORIGIN}/device`,
    verification_uri_complete: `${ACCOUNT_ORIGIN}/device?user_code=BCDF-GHJK`,
    expires_in: 600,
    interval: 5
  }
  assert.equal(parseDeviceAuthorization({ ...valid, verification_uri: 'https://evil.example/device' }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, verification_uri_complete: 'https://evil.example/device?user_code=X' }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, verification_uri_complete: `${ACCOUNT_ORIGIN}/device?user_code=X&device_code=secret` }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, verification_uri_complete: `${ACCOUNT_ORIGIN}/account/security` }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, device_code: '' }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, user_code: '  ' }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization({ ...valid, device_code: 'x'.repeat(600) }, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization(null, ACCOUNT_ORIGIN), null)
  assert.equal(parseDeviceAuthorization('device_code', ACCOUNT_ORIGIN), null)
})

test('parseDeviceAuthorization clamps absurd expiry and interval values into safe bounds', () => {
  const parsed = parseDeviceAuthorization(
    {
      device_code: 'opaque-device-code',
      user_code: 'BCDF-GHJK',
      verification_uri: `${ACCOUNT_ORIGIN}/device`,
      expires_in: -5,
      interval: 100000
    },
    ACCOUNT_ORIGIN
  )
  assert.equal(parsed?.expiresIn, 600)
  assert.equal(parsed?.interval, 120)
})

test('parseTokenResponse requires both tokens and a bearer token type', () => {
  const parsed = parseTokenResponse({
    access_token: 'at_opaque',
    refresh_token: 'rt_opaque',
    token_type: 'Bearer',
    expires_in: 600,
    scope: 'openid profile email'
  })
  assert.deepEqual(parsed, {
    accessToken: 'at_opaque',
    refreshToken: 'rt_opaque',
    tokenType: 'bearer',
    expiresIn: 600,
    scope: 'openid profile email'
  })
  assert.equal(parseTokenResponse({ access_token: 'at', refresh_token: 'rt' })?.tokenType, 'bearer')
  assert.equal(parseTokenResponse({ access_token: 'at', refresh_token: 'rt', token_type: 'mac' }), null)
  assert.equal(parseTokenResponse({ access_token: 'at' }), null)
  assert.equal(parseTokenResponse({ refresh_token: 'rt' }), null)
  assert.equal(parseTokenResponse({ access_token: '', refresh_token: 'rt' }), null)
  assert.equal(parseTokenResponse({ access_token: 'x'.repeat(5000), refresh_token: 'rt' }), null)
  assert.equal(parseTokenResponse(null), null)
})

test('parseTokenResponse defaults a missing expiry to the documented 600 second access token lifetime', () => {
  assert.equal(parseTokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 0 })?.expiresIn, 600)
  assert.equal(parseTokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 10 ** 9 })?.expiresIn, 86_400)
})

test('parseUserInfo keeps sub as the only required claim and never invents an email', () => {
  assert.deepEqual(parseUserInfo({ sub: 'usr_123', preferred_username: 'alice', name: 'Alice', email: 'alice@example.com', email_verified: true }), {
    sub: 'usr_123',
    username: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: true
  })
  assert.deepEqual(parseUserInfo({ sub: 'pw_pairwise' }), {
    sub: 'pw_pairwise',
    username: '',
    name: '',
    email: '',
    emailVerified: false
  })
  assert.equal(parseUserInfo({ sub: '' }), null)
  assert.equal(parseUserInfo({ preferred_username: 'alice' }), null)
  assert.equal(parseUserInfo(null), null)
  assert.equal(parseUserInfo({ sub: 'usr_1', email_verified: 'true' })?.emailVerified, false)
})

test('deviceListUrl points at the account security page where devices can be revoked manually', () => {
  assert.equal(deviceListUrl(ACCOUNT_ORIGIN), `${ACCOUNT_ORIGIN}/account/security`)
  assert.equal(deviceListUrl(`${ACCOUNT_ORIGIN}/device?user_code=X`), `${ACCOUNT_ORIGIN}/account/security`)
  assert.equal(deviceListUrl('not a url'), '')
})

test('retryAfterSeconds honours the Passport Retry-After header and caps runaway values', () => {
  assert.equal(retryAfterSeconds('60'), 60)
  assert.equal(retryAfterSeconds(' 60 '), 60)
  assert.equal(retryAfterSeconds('0'), 0)
  assert.equal(retryAfterSeconds('-5'), 0)
  assert.equal(retryAfterSeconds('abc'), 0)
  assert.equal(retryAfterSeconds('999999'), 600)
  assert.equal(retryAfterSeconds(null), 0)
})

test('authorization_pending and slow_down keep the device poll alive', () => {
  const pending = describeAuthorizationFailure(400, { error: 'authorization_pending' }, 0)
  assert.equal(pending.terminal, false)
  assert.equal(pending.retryable, true)
  assert.equal(pending.slowDown, false)

  const slowDown = describeAuthorizationFailure(400, { error: 'slow_down' }, 0)
  assert.equal(slowDown.slowDown, true)
  assert.equal(slowDown.terminal, false)
})

test('terminal device-flow errors stop polling and are reported in Chinese', () => {
  for (const error of ['access_denied', 'expired_token', 'invalid_grant', 'unauthorized_client', 'invalid_request']) {
    const failure = describeAuthorizationFailure(400, { error }, 0)
    assert.equal(failure.terminal, true, error)
    assert.equal(failure.retryable, false, error)
    assert.ok(failure.message.length > 0)
  }
  assert.equal(describeAuthorizationFailure(400, { error: 'invalid_grant' }, 0).invalidatesSession, true)
  assert.equal(describeAuthorizationFailure(400, { error: 'access_denied' }, 0).invalidatesSession, false)
})

test('rate limiting and dependency failures are retryable and surface Retry-After', () => {
  const limited = describeAuthorizationFailure(429, { error: { code: 'rate_limited', message: 'Too many requests.' } }, 60)
  assert.equal(limited.retryable, true)
  assert.equal(limited.terminal, false)
  assert.equal(limited.retryAfterSeconds, 60)

  const unavailable = describeAuthorizationFailure(503, { error: { code: 'dependency_unavailable' } }, 0)
  assert.equal(unavailable.retryable, true)
  assert.equal(unavailable.terminal, false)

  const invalid = describeAuthorizationFailure(422, { error: { code: 'validation_failed' } }, 0)
  assert.equal(invalid.terminal, true)
  assert.equal(invalid.retryable, false)
})

test('unparseable bodies fall back to HTTP-status driven guidance', () => {
  assert.equal(describeAuthorizationFailure(429, null, 30).retryAfterSeconds, 30)
  assert.equal(describeAuthorizationFailure(429, null, 30).retryable, true)
  assert.equal(describeAuthorizationFailure(502, '<html></html>', 0).retryable, true)
  assert.equal(describeAuthorizationFailure(401, null, 0).terminal, true)
  assert.equal(describeAuthorizationFailure(404, null, 0).terminal, true)
})

test('the signed-out account snapshot never carries a profile or a pending challenge', () => {
  const state = signedOutAccountState(`${ACCOUNT_ORIGIN}/account/security`)
  assert.equal(state.phase, 'signed-out')
  assert.equal(state.profile, null)
  assert.equal(state.challenge, null)
  assert.equal(state.signedInAt, 0)
  assert.equal(state.error, '')
  assert.equal(state.pendingRemoteRevocation, false)
  assert.equal(state.deviceListUrl, `${ACCOUNT_ORIGIN}/account/security`)
  assert.equal(signedOutAccountState('', '登录失败', true).pendingRemoteRevocation, true)
})

test('every account phase has a user-facing label', () => {
  const phases = ['signed-out', 'creating', 'awaiting-approval', 'finalizing', 'signed-in', 'restoring', 'signing-out']
  for (const phase of phases) assert.ok(accountPhaseLabel(phase).length > 0, phase)
  assert.equal(accountPhaseLabel('signed-out'), '未登录')
  assert.equal(accountPhaseLabel('signed-in'), '已登录')
})

test('the shipped Passport defaults match the registered GuEarth device client', () => {
  assert.equal(PASSPORT_DEFAULT_ISSUER, ISSUER)
  assert.equal(PASSPORT_DEFAULT_ACCOUNT_ORIGIN, ACCOUNT_ORIGIN)
  assert.equal(PASSPORT_DEFAULT_CLIENT_ID, 'cli_TZ4_-PaJDbmX2wlKY-fpsQ')
  assert.deepEqual([...PASSPORT_SCOPES], ['openid', 'profile', 'email'])
})
