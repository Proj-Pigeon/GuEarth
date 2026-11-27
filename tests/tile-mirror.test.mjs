import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'vite-plus/test'
import { pathToFileURL } from 'node:url'
import { attachOriginTerrainFallback } from '../src/common/terrainAvailability.ts'
import {
  MIRROR_POLICY_FALLBACK_TITLES,
  MIRROR_POLICY_IDS,
  parsePolicyMarkdown
} from '../src/common/mirrorPolicies.ts'
import {
  describeTileFetchError,
  fetchTilePayloadWithRetry,
  isRetryableTileStatus,
  sanitizeTileUrlForLog,
  tileRetryDelayMs
} from '../src/common/tileProtocol.ts'
import {
  CLOUDFLARE_MIRROR_BASE_URL,
  DEFAULT_MIRROR_ENDPOINT,
  EDGEONE_ARCGIS_TERRAIN_URL,
  EDGEONE_EARTHQUAKES_URL,
  EDGEONE_MIRROR_BASE_URL,
  EDGEONE_MODELS_DEV_URL,
  edgeOneTileMirrorUrl,
  hasLegacyTileMirrorSetting,
  isLikelyMainlandChinaEnv,
  isMirrorCoverageNotFound,
  isMirrorSatelliteProvider,
  MIRROR_FALLBACK_COOLDOWN_MS,
  MIRROR_FAILURES_BEFORE_FALLBACK,
  mirrorArcGisTerrainUrl,
  mirrorCacheStyleId,
  mirrorEarthquakesUrl,
  mirrorEligibleProviders,
  MirrorEndpointManager,
  mirrorModelsDevUrl,
  mirrorProbeUrl,
  mirrorTileUrl,
  normalizeMirrorEndpointPreference,
  normalizeTileMirrorMode,
  ORIGIN_FAILURES_BEFORE_MIRROR,
  originProbeReachable,
  resolveStoredTileMirrorSettings,
  selectBestMirrorEndpoint,
  TileMirrorRouter,
  tileMirrorModes,
  withinMirrorSatelliteDetail
} from '../src/common/tileMirror.ts'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) {
      return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { useGlobeStore, resetGlobeStore } = await import('../src/renderer/src/stores/globe.ts')
const { useFailureStore, resetFailureStore } = await import('../src/renderer/src/stores/failure.ts')

test('mirror eligible providers cover the four overseas basemaps, satellite kind only for esri imagery', () => {
  assert.deepEqual(Object.keys(mirrorEligibleProviders).sort(), ['esri-imagery', 'opentopomap', 'osm', 'viirs-night'])
  assert.equal(isMirrorSatelliteProvider('esri-imagery'), true)
  assert.equal(isMirrorSatelliteProvider('osm'), false)
  assert.equal(isMirrorSatelliteProvider('opentopomap'), false)
  assert.equal(isMirrorSatelliteProvider('viirs-night'), false)
  assert.equal(isMirrorSatelliteProvider('baidu'), false)
  assert.equal(isMirrorSatelliteProvider(''), false)
})

test('EdgeOne mirror endpoints point to proxy.project-pigeon.com and validate tile coordinates', () => {
  assert.equal(EDGEONE_MIRROR_BASE_URL, 'https://proxy.project-pigeon.com')
  assert.equal(EDGEONE_ARCGIS_TERRAIN_URL, 'https://proxy.project-pigeon.com/arcgis')
  assert.equal(EDGEONE_EARTHQUAKES_URL, 'https://proxy.project-pigeon.com/datasets/earthquakes')
  assert.equal(EDGEONE_MODELS_DEV_URL, 'https://proxy.project-pigeon.com/modelsdev')

  assert.equal(edgeOneTileMirrorUrl('osm', 5, 12, 8), 'https://proxy.project-pigeon.com/tiles/osm/5/12/8.png')
  assert.equal(edgeOneTileMirrorUrl('osm', 20, 0, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 6, 25, 13), 'https://proxy.project-pigeon.com/tiles/esri/6/13/25')
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 23, 100, 200), 'https://proxy.project-pigeon.com/tiles/esri/23/200/100')
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 24, 0, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('opentopomap', 17, 10, 20), 'https://proxy.project-pigeon.com/tiles/opentopo/17/10/20.png')
  assert.equal(edgeOneTileMirrorUrl('opentopomap', 18, 0, 0), undefined)
  assert.equal(
    edgeOneTileMirrorUrl('viirs-night', 8, 120, 80, '2026-11-15'),
    'https://proxy.project-pigeon.com/tiles/viirs/2026-11-15/8/80/120.jpeg'
  )
  assert.equal(edgeOneTileMirrorUrl('viirs-night', 9, 0, 0, '2026-11-15'), undefined)
  assert.equal(edgeOneTileMirrorUrl('viirs-night', 4, 1, 1, 'invalid-date'), undefined)
  assert.equal(edgeOneTileMirrorUrl('osm', 2, 4, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('osm', 2, -1, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('baidu', 5, 1, 1), undefined)
})

test('Mainland China environment detection identifies zh-CN locales and Mainland timezones', () => {
  assert.equal(isLikelyMainlandChinaEnv('zh-CN', 'UTC'), true)
  assert.equal(isLikelyMainlandChinaEnv('zh_CN', 'America/New_York'), true)
  assert.equal(isLikelyMainlandChinaEnv('zh-Hans-CN', 'Europe/London'), true)
  assert.equal(isLikelyMainlandChinaEnv('en-US', 'Asia/Shanghai'), true)
  assert.equal(isLikelyMainlandChinaEnv('en-US', 'Asia/Urumqi'), true)
  assert.equal(isLikelyMainlandChinaEnv('en-US', 'America/Los_Angeles'), false)
  assert.equal(isLikelyMainlandChinaEnv('zh-TW', 'Asia/Taipei'), false)
  assert.equal(isLikelyMainlandChinaEnv('zh-HK', 'Asia/Hong_Kong'), false)
})

test('stored mirror settings require explicit consent before enabling the mirror service', () => {
  assert.deepEqual(resolveStoredTileMirrorSettings(undefined, undefined, undefined), {
    tileMirrorMode: 'off',
    mirrorConsentPrompted: false
  })
  assert.deepEqual(resolveStoredTileMirrorSettings('auto', undefined, undefined), {
    tileMirrorMode: 'off',
    mirrorConsentPrompted: false
  })
  assert.deepEqual(resolveStoredTileMirrorSettings('on', true, false), {
    tileMirrorMode: 'off',
    mirrorConsentPrompted: false
  })
  assert.deepEqual(resolveStoredTileMirrorSettings('on', undefined, true), {
    tileMirrorMode: 'on',
    mirrorConsentPrompted: true
  })
  assert.deepEqual(resolveStoredTileMirrorSettings('off', undefined, true), {
    tileMirrorMode: 'off',
    mirrorConsentPrompted: true
  })
})

test('mirror policy markdown files parse dynamically without hardcoded policy text', () => {
  assert.deepEqual(MIRROR_POLICY_IDS, ['agreement', 'acceptable-use'])
  const agreementDoc = readFileSync(new URL('../docs/policies/MIRROR-SERVICE-AGREEMENT.md', import.meta.url), 'utf8')
  const aupDoc = readFileSync(new URL('../docs/policies/ACCEPTABLE-USE-POLICY.md', import.meta.url), 'utf8')

  const parsedAgreement = parsePolicyMarkdown(agreementDoc, MIRROR_POLICY_FALLBACK_TITLES.agreement)
  const parsedAup = parsePolicyMarkdown(aupDoc, MIRROR_POLICY_FALLBACK_TITLES['acceptable-use'])

  assert.equal(parsedAgreement.title, '咕咕地球镜像服务使用协议')
  assert.equal(parsedAup.title, '可接受使用政策（Acceptable Use Policy）')
  assert.doesNotMatch(parsedAgreement.body, /^#\s+/m)
  assert.doesNotMatch(parsedAup.body, /^#\s+/m)
  assert.match(parsedAgreement.body, /奈索星联/)
  assert.match(parsedAgreement.body, /中华人民共和国测绘法/)
  assert.match(parsedAgreement.body, /中华人民共和国个人信息保护法/)
  assert.match(parsedAup.body, /可接受使用政策/)
  assert.match(parsedAup.body, /问题地图/)
  assert.match(parsedAup.body, /速率限制/)

  const crlfParsed = parsePolicyMarkdown('﻿# 自定义标题\r\n\r\n正文第一段\r\n## 二级标题\r\n内容', '默认标题')
  assert.deepEqual(crlfParsed, {
    title: '自定义标题',
    body: '正文第一段\n## 二级标题\n内容'
  })

  const noHeadingParsed = parsePolicyMarkdown('## 仅有二级标题\n\n内容', '默认标题')
  assert.deepEqual(noHeadingParsed, {
    title: '默认标题',
    body: '## 仅有二级标题\n\n内容'
  })

  const modalSource = readFileSync(new URL('../src/renderer/src/components/MirrorPolicyModal.tsx', import.meta.url), 'utf8')
  assert.match(modalSource, /docs\/policies\/MIRROR-SERVICE-AGREEMENT\.md\?raw/)
  assert.match(modalSource, /docs\/policies\/ACCEPTABLE-USE-POLICY\.md\?raw/)
  assert.match(modalSource, /renderMarkdown/)
})

test('mirror satellite detail bounds include China teaching sites', () => {
  const teachingSites = [
    [116.4, 39.9],
    [121.47, 31.23],
    [113.27, 23.13],
    [87.6, 43.8],
    [91.1, 29.65],
    [126.53, 45.8],
    [122.5, 53.47]
  ]
  for (const [longitude, latitude] of teachingSites) {
    assert.ok(withinMirrorSatelliteDetail(longitude, latitude), `${longitude},${latitude} should keep full zoom`)
  }
})

test('mirror satellite detail bounds exclude overseas cities so zoom gets clamped there', () => {
  const overseasSites = [
    [-74, 40.7],
    [139.69, 35.69],
    [103.8, 1.35],
    [-0.1, 51.5],
    [151.2, -33.87],
    [36.8, -1.3]
  ]
  for (const [longitude, latitude] of overseasSites) {
    assert.equal(withinMirrorSatelliteDetail(longitude, latitude), false, `${longitude},${latitude} should be treated as overseas`)
  }
})

test('mirror mode accepts the three selections, defaults to auto, and migrates the legacy switch', () => {
  assert.deepEqual([...tileMirrorModes], ['auto', 'on', 'off'])
  for (const mode of tileMirrorModes) assert.equal(normalizeTileMirrorMode(mode), mode)
  assert.equal(normalizeTileMirrorMode(undefined), 'auto')
  assert.equal(normalizeTileMirrorMode(''), 'auto')
  assert.equal(normalizeTileMirrorMode(true), 'auto')
  assert.equal(normalizeTileMirrorMode(undefined, true), 'on')
  assert.equal(normalizeTileMirrorMode(undefined, false), 'auto')
  assert.equal(normalizeTileMirrorMode('off', true), 'off')
  assert.equal(hasLegacyTileMirrorSetting(undefined, true), true)
  assert.equal(hasLegacyTileMirrorSetting(undefined, false), true)
  assert.equal(hasLegacyTileMirrorSetting('auto', undefined), false)
  assert.equal(hasLegacyTileMirrorSetting(undefined, undefined), false)
})

test('mirror tiles are cached in their own namespace so a source switch never reuses the other source', () => {
  assert.equal(mirrorCacheStyleId('standard'), 'standard-mirror')
  assert.notEqual(mirrorCacheStyleId('standard'), 'standard')
  assert.match(mirrorCacheStyleId('topo'), /^[a-z0-9][a-z0-9_-]{0,63}$/)
})

test('origin probe treats an answered request as reachable and a policy block as unreachable', () => {
  for (const status of [200, 204, 301, 404, 429, 500, 503]) assert.equal(originProbeReachable(status), true, `${status} is an answered request`)
  assert.equal(originProbeReachable(403), false)
  assert.equal(originProbeReachable(451), false)
})

test('mirror 404 is treated as coverage miss only when returned by the proxy function', () => {
  assert.equal(isMirrorCoverageNotFound(404, new Headers({ 'content-type': 'application/json; charset=utf-8' })), true)
  assert.equal(isMirrorCoverageNotFound(404, new Headers({ 'x-proxy-upstream': 'https://services.arcgisonline.com/tile/1/0/0' })), true)
  assert.equal(isMirrorCoverageNotFound(404, new Headers({ 'content-type': 'text/html; charset=utf-8' })), false)
  assert.equal(isMirrorCoverageNotFound(404, new Headers()), false)
  assert.equal(isMirrorCoverageNotFound(502, new Headers({ 'content-type': 'application/json' })), false)
})

test('auto mode keeps the origin until consecutive failures prove the environment needs the mirror', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  assert.equal(router.reachabilityFor('osm'), 'unknown')
  assert.equal(router.sourceFor('osm'), 'origin')
  for (let attempt = 1; attempt < ORIGIN_FAILURES_BEFORE_MIRROR; attempt += 1) assert.equal(router.noteOriginFailure('osm'), false)
  assert.equal(router.sourceFor('osm'), 'origin')
  assert.equal(router.noteOriginFailure('osm'), true)
  assert.equal(router.sourceFor('osm'), 'mirror')
  assert.deepEqual(router.mirroredProviders(['osm', 'esri-imagery']), ['osm'])
})

test('auto mode only counts consecutive origin failures and a single success resets the streak', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  for (let attempt = 0; attempt < ORIGIN_FAILURES_BEFORE_MIRROR * 2; attempt += 1) {
    router.noteOriginFailure('osm')
    assert.equal(router.noteOriginSuccess('osm'), false)
  }
  assert.equal(router.sourceFor('osm'), 'origin')
})

test('auto mode follows the network probe in both directions', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  assert.equal(router.noteProbeResult('esri-imagery', false), true)
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  assert.equal(router.noteProbeResult('esri-imagery', false), false)
  assert.equal(router.noteProbeResult('esri-imagery', true), true)
  assert.equal(router.sourceFor('esri-imagery'), 'origin')
})

test('auto mode recovers to the origin only after consecutive mirror failures reach threshold', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  router.noteProbeResult('opentopomap', false)
  assert.equal(router.sourceFor('opentopomap'), 'mirror')
  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.noteMirrorFailure('opentopomap'), false)
    assert.equal(router.sourceFor('opentopomap'), 'mirror')
  }
  assert.equal(router.noteMirrorFailure('opentopomap'), true)
  assert.equal(router.sourceFor('opentopomap'), 'origin')
  assert.equal(router.noteMirrorFailure('opentopomap'), false)
})

test('auto mode restarts the origin failure streak after the mirror itself fails', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  for (let attempt = 0; attempt < ORIGIN_FAILURES_BEFORE_MIRROR; attempt += 1) router.noteOriginFailure('osm')
  assert.equal(router.sourceFor('osm'), 'mirror')
  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.noteMirrorFailure('osm'), false)
  }
  assert.equal(router.noteMirrorFailure('osm'), true)
  assert.equal(router.sourceFor('osm'), 'origin')
  for (let attempt = 1; attempt < ORIGIN_FAILURES_BEFORE_MIRROR; attempt += 1) assert.equal(router.noteOriginFailure('osm'), false)
  assert.equal(router.sourceFor('osm'), 'origin')
})

test('on mode tolerates transient mirror failures and resets streak on success', () => {
  const router = new TileMirrorRouter()
  router.setMode('on')
  for (let round = 0; round < 3; round += 1) {
    for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
      assert.equal(router.noteMirrorFailure('esri-imagery'), false)
    }
    router.noteMirrorSuccess('esri-imagery')
    assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  }
  assert.deepEqual(router.fallenBackProviders(['esri-imagery']), [])
})

test('on mode trips fallback after consecutive failures, recovers after cooldown, and supports manual reset', () => {
  let clock = 10_000
  const router = new TileMirrorRouter(() => clock)
  router.setMode('on')
  for (const providerId of Object.keys(mirrorEligibleProviders)) assert.equal(router.sourceFor(providerId), 'mirror')
  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.noteMirrorFailure('osm'), false)
  }
  assert.equal(router.noteMirrorFailure('osm'), true)
  assert.equal(router.sourceFor('osm'), 'origin')
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  assert.deepEqual(router.fallenBackProviders(['osm', 'esri-imagery']), ['osm'])
  assert.equal(router.noteMirrorFailure('osm'), false)

  clock += MIRROR_FALLBACK_COOLDOWN_MS - 1
  assert.equal(router.sourceFor('osm'), 'origin')
  clock += 1
  assert.equal(router.sourceFor('osm'), 'mirror')
  assert.deepEqual(router.fallenBackProviders(['osm', 'esri-imagery']), [])

  for (let attempt = 0; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) router.noteMirrorFailure('esri-imagery')
  assert.equal(router.sourceFor('esri-imagery'), 'origin')
  assert.equal(router.resetMirrorFallback('esri-imagery'), true)
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  assert.equal(router.resetMirrorFallback('esri-imagery'), false)
})

test('off mode never routes a tile through the mirror even when the origin is unreachable', () => {
  const router = new TileMirrorRouter()
  router.setMode('off')
  assert.equal(router.noteProbeResult('osm', false), false)
  assert.equal(router.noteOriginFailure('osm'), false)
  assert.equal(router.noteOriginFailure('osm'), false)
  assert.equal(router.sourceFor('osm'), 'origin')
  assert.deepEqual(router.mirroredProviders(['osm', 'esri-imagery', 'opentopomap', 'viirs-night']), [])
})

test('switching to on mode after a probe verdict ignores the auto verdict until the mode changes back', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  router.noteProbeResult('osm', true)
  assert.equal(router.sourceFor('osm'), 'origin')
  router.setMode('on')
  assert.equal(router.sourceFor('osm'), 'mirror')
  assert.equal(router.noteProbeResult('osm', true), false)
  assert.equal(router.sourceFor('osm'), 'mirror')
  router.setMode('auto')
  assert.equal(router.sourceFor('osm'), 'origin')
})

test('globeStore mirror consent workflow gates enabling on consent and persists settings', async (t) => {
  const originalWindow = globalThis.window
  const updates = []
  let stored = {
    selectedImageryProviderId: 'osm',
    selectedTerrainProviderId: 'arcgis-terrain',
    terrainExaggeration: 2,
    terrainLighting: false,
    tileCacheEnabled: true,
    tileMirrorMode: 'auto',
    mirrorConsentPrompted: false,
    networkProxy: '',
    providerStyles: { osm: 'standard' },
    providerCredentials: {},
    sceneMode: '3D',
    setupGuideDismissed: null
  }
  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => stored,
        update: async (patch) => {
          updates.push(patch)
          stored = { ...stored, ...patch }
          return stored
        }
      }
    }
  }
  t.onTestFinished(() => {
    globalThis.window = originalWindow
  })
  resetGlobeStore()
  const store = () => useGlobeStore.getState()
  assert.equal(store().settingsHydrated, false)
  await store().hydrateSettings()
  assert.equal(store().settingsHydrated, true)
  assert.equal(store().mirrorConsentPrompted, false)
  assert.equal(store().tileMirrorMode, 'off')

  store().openMirrorConsent('china')
  assert.equal(store().mirrorConsentOpen, true)
  assert.equal(store().mirrorConsentReason, 'china')

  store().openMirrorPolicy('acceptable-use')
  assert.equal(store().mirrorPolicyOpen, true)
  assert.equal(store().mirrorPolicyActiveId, 'acceptable-use')
  store().closeMirrorPolicy()
  assert.equal(store().mirrorPolicyOpen, false)

  store().declineMirrorConsent()
  assert.equal(store().mirrorConsentOpen, false)
  assert.equal(store().mirrorConsentPrompted, true)
  assert.equal(store().tileMirrorMode, 'off')
  assert.equal(updates.at(-1).mirrorConsentPrompted, true)
  assert.equal(updates.at(-1).tileMirrorMode, 'off')

  store().openMirrorConsent('settings')
  assert.equal(store().mirrorConsentOpen, true)
  assert.equal(store().mirrorConsentReason, 'settings')
  store().acceptMirrorConsent()
  assert.equal(store().mirrorConsentOpen, false)
  assert.equal(store().tileMirrorMode, 'on')
  assert.equal(updates.at(-1).tileMirrorMode, 'on')
})

test('globeStore does not persist mirrorConsentPrompted after settings.get failure', async (t) => {
  const originalWindow = globalThis.window
  const updates = []
  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => {
          throw new Error('disk read error')
        },
        update: async (patch) => {
          updates.push(patch)
          return patch
        }
      }
    }
  }
  t.onTestFinished(() => {
    globalThis.window = originalWindow
  })
  resetGlobeStore()
  const store = () => useGlobeStore.getState()
  await store().hydrateSettings()
  assert.equal(store().settingsHydrated, true)

  store().setTileCacheEnabled(false)
  assert.equal(updates.length, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(updates[0], 'mirrorConsentPrompted'), false)

  store().acceptMirrorConsent()
  assert.equal(updates.length, 2)
  assert.equal(updates[1].mirrorConsentPrompted, true)
  assert.equal(updates[1].tileMirrorMode, 'on')
})

test('attachOriginTerrainFallback falls back on runtime tile failure and switches to origin after threshold', async () => {
  let mirrorCalls = 0
  let originCreations = 0
  let originCalls = 0
  let failMirror = true
  const mirrorProvider = {
    requestTileGeometry: () => {
      mirrorCalls += 1
      if (failMirror) return Promise.reject(new Error('503 Service Unavailable'))
      return Promise.resolve('mirror-tile')
    },
    getTileDataAvailable: () => true
  }
  const originProvider = {
    requestTileGeometry: () => {
      originCalls += 1
      return Promise.resolve('origin-tile')
    },
    getTileDataAvailable: () => false
  }
  const wrapped = attachOriginTerrainFallback(
    mirrorProvider,
    async () => {
      originCreations += 1
      return originProvider
    },
    2
  )

  assert.equal(await wrapped.requestTileGeometry(0, 0, 0), 'origin-tile')
  assert.equal(mirrorCalls, 1)
  assert.equal(originCreations, 1)
  assert.equal(originCalls, 1)

  failMirror = false
  assert.equal(await wrapped.requestTileGeometry(1, 0, 0), 'mirror-tile')
  assert.equal(mirrorCalls, 2)

  failMirror = true
  assert.equal(await wrapped.requestTileGeometry(2, 0, 0), 'origin-tile')
  assert.equal(await wrapped.requestTileGeometry(3, 0, 0), 'origin-tile')
  assert.equal(mirrorCalls, 4)
  assert.equal(originCalls, 3)

  assert.equal(await wrapped.requestTileGeometry(4, 0, 0), 'origin-tile')
  assert.equal(mirrorCalls, 4)
  assert.equal(originCreations, 1)
  assert.equal(originCalls, 4)
  assert.equal(wrapped.getTileDataAvailable(4, 0, 0), false)
})

test('TileMirrorRouter ignores stale mirror failures after a mode switch', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  router.noteProbeResult('osm', false)
  const autoGen = router.currentModeGeneration()
  assert.equal(router.sourceFor('osm'), 'mirror')

  router.setMode('on')
  const onGen = router.currentModeGeneration()
  assert.notEqual(onGen, autoGen)
  assert.equal(router.sourceFor('osm'), 'mirror')

  assert.equal(router.noteMirrorFailure('osm', autoGen), false)
  assert.equal(router.sourceFor('osm'), 'mirror')

  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.noteMirrorFailure('osm', onGen), false)
  }
  assert.equal(router.noteMirrorFailure('osm', onGen), true)
  assert.equal(router.sourceFor('osm'), 'origin')
})

test('globeStore syncs mirror mode back to actual status when consent persistence fails', async (t) => {
  const originalWindow = globalThis.window
  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => ({
          selectedImageryProviderId: 'osm',
          selectedTerrainProviderId: 'arcgis-terrain',
          terrainExaggeration: 2,
          terrainLighting: false,
          tileCacheEnabled: true,
          tileMirrorMode: 'off',
          mirrorConsentPrompted: false,
          networkProxy: '',
          providerStyles: { osm: 'standard' },
          providerCredentials: {},
          sceneMode: '3D',
          setupGuideDismissed: null
        }),
        update: async () => {
          throw new Error('disk write failed')
        }
      },
      tiles: {
        getMirrorStatus: async () => ({
          mode: 'off',
          mirroredProviders: [],
          notice: ''
        })
      }
    }
  }
  t.onTestFinished(() => {
    globalThis.window = originalWindow
  })
  resetGlobeStore()
  resetFailureStore()
  const store = () => useGlobeStore.getState()
  const failureStore = () => useFailureStore.getState()
  await store().hydrateSettings()
  store().openMirrorConsent('china')
  store().acceptMirrorConsent()
  assert.equal(store().mirrorConsentOpen, false)
  assert.equal(store().mirrorConsentPrompted, true)

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(store().tileMirrorMode, 'off')
  assert.deepEqual(store().mirroredProviders, [])
  assert.equal(failureStore().degradations.length, 1)
})

test('fetchTilePayloadWithRetry retries 5xx, 429, network errors, and mid-body stream failures with backoff', async () => {
  assert.equal(isRetryableTileStatus(408), true)
  assert.equal(isRetryableTileStatus(429), true)
  assert.equal(isRetryableTileStatus(502), true)
  assert.equal(isRetryableTileStatus(503), true)
  assert.equal(isRetryableTileStatus(404), false)
  assert.equal(isRetryableTileStatus(403), false)
  assert.equal(tileRetryDelayMs(0, 250), 250)
  assert.equal(tileRetryDelayMs(1, 250), 500)

  const delays = []
  let calls = 0
  const okResult = await fetchTilePayloadWithRetry(
    async () => {
      calls += 1
      if (calls === 1) return new Response('bad gateway', { status: 502 })
      if (calls === 2) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: async () => {
            throw new Error('stream timeout')
          }
        }
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    },
    { attempts: 3, baseDelayMs: 100, sleep: async (ms) => { delays.push(ms) } }
  )
  assert.equal(okResult.ok, true)
  assert.equal(okResult.status, 200)
  assert.equal(okResult.data.byteLength, 3)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [100, 200])

  let nonRetryCalls = 0
  const notFound = await fetchTilePayloadWithRetry(
    async () => {
      nonRetryCalls += 1
      return new Response('not found', { status: 404 })
    },
    { attempts: 3, sleep: async () => undefined }
  )
  assert.equal(notFound.ok, false)
  assert.equal(notFound.status, 404)
  assert.equal(nonRetryCalls, 1)
})

test('tile log helpers strip query secrets and include error cause', () => {
  assert.equal(
    sanitizeTileUrlForLog('https://online0.map.bdimg.com/tile/?x=1&y=2&ak=SECRET&sn=SIGN'),
    'https://online0.map.bdimg.com/tile/'
  )
  assert.equal(
    sanitizeTileUrlForLog('https://proxy.project-pigeon.com/tiles/esri/1/0/0'),
    'https://proxy.project-pigeon.com/tiles/esri/1/0/0'
  )
  const err = new Error('fetch failed', { cause: new Error('net::ERR_CONNECTION_REFUSED') })
  assert.match(describeTileFetchError(err), /Error: fetch failed \(Error: net::ERR_CONNECTION_REFUSED\)/)
})

test('multi-mirror URL builders support both EdgeOne and Cloudflare endpoints', () => {
  assert.equal(CLOUDFLARE_MIRROR_BASE_URL, 'https://cf.proxy.project-pigeon.com')
  assert.equal(mirrorArcGisTerrainUrl('edgeone'), 'https://proxy.project-pigeon.com/arcgis')
  assert.equal(mirrorArcGisTerrainUrl('cloudflare'), 'https://cf.proxy.project-pigeon.com/arcgis')
  assert.equal(mirrorEarthquakesUrl('cloudflare'), 'https://cf.proxy.project-pigeon.com/datasets/earthquakes')
  assert.equal(mirrorModelsDevUrl('cloudflare'), 'https://cf.proxy.project-pigeon.com/modelsdev')
  assert.equal(mirrorProbeUrl('edgeone'), 'https://proxy.project-pigeon.com/tiles/esri/1/0/0')
  assert.equal(mirrorProbeUrl('cloudflare'), 'https://cf.proxy.project-pigeon.com/tiles/esri/1/0/0')
  assert.equal(mirrorTileUrl('osm', 5, 12, 8, undefined, 'cloudflare'), 'https://cf.proxy.project-pigeon.com/tiles/osm/5/12/8.png')
  assert.equal(mirrorTileUrl('esri-imagery', 6, 25, 13, undefined, 'cloudflare'), 'https://cf.proxy.project-pigeon.com/tiles/esri/6/13/25')
  assert.equal(mirrorTileUrl('opentopomap', 10, 5, 6, undefined, 'cloudflare'), 'https://cf.proxy.project-pigeon.com/tiles/opentopo/10/5/6.png')
  assert.equal(
    mirrorTileUrl('viirs-night', 8, 120, 80, '2026-11-19', 'cloudflare'),
    'https://cf.proxy.project-pigeon.com/tiles/viirs/2026-11-19/8/80/120.jpeg'
  )
  assert.equal(normalizeMirrorEndpointPreference('auto'), 'auto')
  assert.equal(normalizeMirrorEndpointPreference('edgeone'), 'edgeone')
  assert.equal(normalizeMirrorEndpointPreference('cloudflare'), 'cloudflare')
  assert.equal(normalizeMirrorEndpointPreference('unknown'), 'auto')
  assert.equal(normalizeMirrorEndpointPreference(undefined), 'auto')
})

test('selectBestMirrorEndpoint chooses the fastest reachable mirror and breaks ties consistently', () => {
  assert.equal(
    selectBestMirrorEndpoint([
      { endpoint: 'edgeone', ok: true, latencyMs: 240 },
      { endpoint: 'cloudflare', ok: true, latencyMs: 95 }
    ]),
    'cloudflare'
  )
  assert.equal(
    selectBestMirrorEndpoint([
      { endpoint: 'edgeone', ok: false, latencyMs: null, error: 'timeout' },
      { endpoint: 'cloudflare', ok: true, latencyMs: 310 }
    ]),
    'cloudflare'
  )
  assert.equal(
    selectBestMirrorEndpoint([
      { endpoint: 'edgeone', ok: true, latencyMs: 120 },
      { endpoint: 'cloudflare', ok: true, latencyMs: 120 }
    ]),
    'edgeone'
  )
  assert.equal(
    selectBestMirrorEndpoint([
      { endpoint: 'edgeone', ok: false, latencyMs: null, error: 'timeout' },
      { endpoint: 'cloudflare', ok: false, latencyMs: null, error: 'HTTP 502' }
    ], 'cloudflare'),
    'cloudflare'
  )
})

test('MirrorEndpointManager auto-selects from probes, respects manual override, and fails over in auto mode', () => {
  let clock = 50_000
  const manager = new MirrorEndpointManager(() => clock)
  assert.equal(manager.getPreference(), 'auto')
  assert.equal(manager.getActive(), DEFAULT_MIRROR_ENDPOINT)

  const firstProbe = manager.applyProbeResults([
    { endpoint: 'edgeone', ok: false, latencyMs: null, error: 'timeout' },
    { endpoint: 'cloudflare', ok: true, latencyMs: 140 }
  ])
  assert.deepEqual(firstProbe, { changed: true, active: 'cloudflare' })
  assert.equal(manager.getActive(), 'cloudflare')
  assert.equal(manager.getProbeResults().length, 2)

  assert.equal(manager.setPreference('edgeone'), true)
  assert.equal(manager.getActive(), 'edgeone')
  assert.equal(manager.tryFailover('edgeone'), null)
  assert.equal(manager.getActive(), 'edgeone')

  const manualProbe = manager.applyProbeResults([
    { endpoint: 'edgeone', ok: true, latencyMs: 420 },
    { endpoint: 'cloudflare', ok: true, latencyMs: 85 }
  ])
  assert.deepEqual(manualProbe, { changed: false, active: 'edgeone' })
  assert.equal(manager.getActive(), 'edgeone')

  assert.equal(manager.setPreference('auto'), true)
  assert.equal(manager.getActive(), 'cloudflare')

  assert.equal(manager.tryFailover('cloudflare'), 'edgeone')
  assert.equal(manager.getActive(), 'edgeone')
  assert.equal(manager.tryFailover('edgeone'), null)

  clock += MIRROR_FALLBACK_COOLDOWN_MS
  assert.equal(manager.tryFailover('edgeone'), 'cloudflare')
  assert.equal(manager.getActive(), 'cloudflare')
})

test('globeStore hydrates, persists, and rolls back tileMirrorSource and applies active mirror status', async (t) => {
  const originalWindow = globalThis.window
  const updates = []
  let failUpdates = false
  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => ({
          selectedImageryProviderId: 'osm',
          selectedTerrainProviderId: 'arcgis-terrain',
          terrainExaggeration: 2,
          terrainLighting: false,
          tileCacheEnabled: true,
          tileMirrorMode: 'on',
          tileMirrorSource: 'cloudflare',
          mirrorConsentPrompted: true,
          networkProxy: '',
          providerStyles: { osm: 'standard' },
          providerCredentials: {},
          sceneMode: '3D',
          setupGuideDismissed: null
        }),
        update: async (patch) => {
          if (failUpdates) throw new Error('disk full')
          updates.push(patch)
          return patch
        }
      },
      tiles: {
        getMirrorStatus: async () => ({
          mode: 'on',
          sourcePreference: 'auto',
          activeEndpoint: 'edgeone',
          probingEndpoints: false,
          endpointProbes: [{ endpoint: 'edgeone', ok: true, latencyMs: 90 }],
          mirroredProviders: ['osm'],
          fallenBackProviders: [],
          notice: ''
        })
      }
    }
  }
  t.onTestFinished(() => {
    globalThis.window = originalWindow
  })
  resetGlobeStore()
  const store = () => useGlobeStore.getState()
  await store().hydrateSettings()
  assert.equal(store().tileMirrorSource, 'cloudflare')
  assert.equal(store().activeMirrorEndpoint, 'cloudflare')

  store().setTileMirrorSource('auto')
  assert.equal(store().tileMirrorSource, 'auto')
  assert.equal(updates.at(-1)?.tileMirrorSource, 'auto')

  store().applyTileMirrorStatus({
    mode: 'on',
    sourcePreference: 'auto',
    activeEndpoint: 'edgeone',
    probingEndpoints: true,
    endpointProbes: [
      { endpoint: 'edgeone', ok: true, latencyMs: 88 },
      { endpoint: 'cloudflare', ok: true, latencyMs: 160 }
    ],
    mirroredProviders: ['osm', 'esri-imagery'],
    fallenBackProviders: [],
    notice: ''
  })
  assert.equal(store().activeMirrorEndpoint, 'edgeone')
  assert.equal(store().mirrorProbingEndpoints, true)
  assert.equal(store().mirrorEndpointProbes.length, 2)

  failUpdates = true
  store().setTileMirrorSource('cloudflare')
  assert.equal(store().tileMirrorSource, 'cloudflare')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(store().tileMirrorSource, 'auto')
  assert.equal(store().activeMirrorEndpoint, 'edgeone')
})

test('fetchTilePayloadWithRetry recovers after a rejected fetcher call with a single backoff', async () => {
  const delays = []
  let calls = 0
  const result = await fetchTilePayloadWithRetry(
    async () => {
      calls += 1
      if (calls === 1) throw new Error('ECONNRESET')
      return new Response(new Uint8Array([9, 8, 7, 6]), { status: 200, headers: { 'content-type': 'image/png' } })
    },
    { attempts: 3, baseDelayMs: 120, sleep: async (ms) => { delays.push(ms) } }
  )
  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.data.byteLength, 4)
  assert.equal(calls, 2)
  assert.deepEqual(delays, [120])
})

test('fetchTilePayloadWithRetry normalizes non-integer and non-finite attempts and returns final 503 response', async () => {
  for (const [attempts, expectedCalls] of [[2.5, 2], [0, 1], [-2, 1], [Number.NaN, 3], [Number.POSITIVE_INFINITY, 3]]) {
    let calls = 0
    const result = await fetchTilePayloadWithRetry(
      async () => {
        calls += 1
        return new Response('unavailable', { status: 503 })
      },
      { attempts, baseDelayMs: 10, sleep: async () => undefined }
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 503)
    assert.equal(calls, expectedCalls)
  }
})

test('TileMirrorRouter separates failure threshold detection from fallback commit and reports fallback expiry', () => {
  let clock = 10_000
  const router = new TileMirrorRouter(() => clock)
  router.setMode('auto')
  router.noteProbeResult('osm', false)
  const autoGen = router.currentModeGeneration()
  assert.equal(router.sourceFor('osm'), 'mirror')

  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.recordMirrorFailure('osm', autoGen), false)
  }
  assert.equal(router.recordMirrorFailure('osm', autoGen), true)
  assert.equal(router.sourceFor('osm'), 'mirror')
  assert.equal(router.reachabilityFor('osm'), 'blocked')

  router.resetMirrorFallback()
  assert.equal(router.sourceFor('osm'), 'mirror')

  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.recordMirrorFailure('osm', autoGen), false)
  }
  assert.equal(router.recordMirrorFailure('osm', autoGen), true)
  assert.equal(router.commitMirrorFallback('osm', autoGen), true)
  assert.equal(router.sourceFor('osm'), 'origin')
  assert.equal(router.reachabilityFor('osm'), 'reachable')

  router.setMode('on')
  const onGen = router.currentModeGeneration()
  assert.equal(router.nextMirrorFallbackExpiryAt(), null)
  for (let attempt = 1; attempt < MIRROR_FAILURES_BEFORE_FALLBACK; attempt += 1) {
    assert.equal(router.recordMirrorFailure('esri-imagery', onGen), false)
  }
  assert.equal(router.recordMirrorFailure('esri-imagery', onGen), true)
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  assert.equal(router.commitMirrorFallback('esri-imagery', onGen), true)
  assert.equal(router.sourceFor('esri-imagery'), 'origin')
  assert.equal(router.nextMirrorFallbackExpiryAt(), clock + MIRROR_FALLBACK_COOLDOWN_MS)

  clock += MIRROR_FALLBACK_COOLDOWN_MS
  assert.equal(router.nextMirrorFallbackExpiryAt(), null)
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
})

test('MirrorEndpointManager does not let an earlier probe undo a subsequent failover', () => {
  let clock = 10_000
  const manager = new MirrorEndpointManager(() => clock)
  const roundStartedAt = clock

  const edgeOneProbe = { endpoint: 'edgeone', ok: true, latencyMs: 40, checkedAt: roundStartedAt }
  const roundProbes = [edgeOneProbe]
  assert.deepEqual(manager.applyProbeResult(edgeOneProbe, roundProbes), { changed: false, active: 'edgeone' })

  clock += 500
  assert.equal(manager.tryFailover('edgeone'), 'cloudflare')
  assert.equal(manager.getActive(), 'cloudflare')

  clock += 1_500
  const cloudflareFailedProbe = { endpoint: 'cloudflare', ok: false, latencyMs: null, error: 'timeout', checkedAt: roundStartedAt }
  roundProbes.push(cloudflareFailedProbe)
  assert.deepEqual(manager.applyProbeResult(cloudflareFailedProbe, roundProbes), { changed: false, active: 'cloudflare' })
  assert.equal(manager.getActive(), 'cloudflare')
  assert.deepEqual(manager.applyProbeResults(roundProbes), { changed: false, active: 'cloudflare' })
  assert.equal(manager.getActive(), 'cloudflare')

  const cloudflareSlowProbe = { endpoint: 'cloudflare', ok: true, latencyMs: 280, checkedAt: roundStartedAt }
  assert.deepEqual(manager.applyProbeResults([edgeOneProbe, cloudflareSlowProbe]), { changed: false, active: 'cloudflare' })
  assert.equal(manager.getActive(), 'cloudflare')

  const freshManager = new MirrorEndpointManager(() => clock)
  const freshRound = [
    { endpoint: 'edgeone', ok: true, latencyMs: 220, checkedAt: clock },
    { endpoint: 'cloudflare', ok: true, latencyMs: 75, checkedAt: clock }
  ]
  assert.deepEqual(freshManager.applyProbeResult(freshRound[0], [freshRound[0]]), { changed: false, active: 'edgeone' })
  assert.deepEqual(freshManager.applyProbeResult(freshRound[1], freshRound), { changed: true, active: 'cloudflare' })
})

test('globeStore preserves pending tileMirrorSource across stale broadcasts and unrelated saves', async (t) => {
  const originalWindow = globalThis.window
  const updates = []
  let resolveSourceSave
  globalThis.window = {
    guEarth: {
      settings: {
        get: async () => ({
          selectedImageryProviderId: 'osm',
          selectedTerrainProviderId: 'arcgis-terrain',
          terrainExaggeration: 2,
          terrainLighting: false,
          tileCacheEnabled: true,
          tileMirrorMode: 'on',
          tileMirrorSource: 'auto',
          mirrorConsentPrompted: true,
          networkProxy: '',
          providerStyles: { osm: 'standard' },
          providerCredentials: {},
          sceneMode: '3D',
          setupGuideDismissed: null
        }),
        update: (patch) => {
          updates.push(patch)
          if (patch.tileMirrorSource !== undefined) {
            return new Promise((resolve) => {
              resolveSourceSave = () => resolve(patch)
            })
          }
          return Promise.resolve(patch)
        }
      },
      tiles: {
        getMirrorStatus: async () => ({
          mode: 'on',
          sourcePreference: 'auto',
          activeEndpoint: 'edgeone',
          probingEndpoints: false,
          endpointProbes: [],
          mirroredProviders: ['osm'],
          fallenBackProviders: [],
          notice: ''
        })
      }
    }
  }
  t.onTestFinished(() => {
    globalThis.window = originalWindow
  })
  resetGlobeStore()
  const store = () => useGlobeStore.getState()
  await store().hydrateSettings()

  store().setTileMirrorSource('cloudflare')
  assert.equal(store().tileMirrorSource, 'cloudflare')
  assert.equal(store().activeMirrorEndpoint, 'cloudflare')
  assert.deepEqual(updates[0], { tileMirrorSource: 'cloudflare' })

  store().applyTileMirrorStatus({
    mode: 'on',
    sourcePreference: 'auto',
    activeEndpoint: 'edgeone',
    probingEndpoints: true,
    endpointProbes: [{ endpoint: 'edgeone', ok: true, latencyMs: 65 }],
    mirroredProviders: ['osm'],
    fallenBackProviders: ['esri-imagery'],
    notice: ''
  })
  assert.equal(store().tileMirrorSource, 'cloudflare')
  assert.equal(store().activeMirrorEndpoint, 'cloudflare')
  assert.equal(store().mirrorProbingEndpoints, true)
  assert.deepEqual(store().mirrorFallenBackProviders, ['esri-imagery'])

  store().setTerrainProvider('cesium-world-terrain')
  assert.equal(Object.prototype.hasOwnProperty.call(updates[1], 'tileMirrorSource'), false)
  assert.equal(updates[1].selectedTerrainProviderId, 'cesium-world-terrain')

  resolveSourceSave()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(store().tileMirrorSource, 'cloudflare')

  store().applyTileMirrorStatus({
    mode: 'on',
    sourcePreference: 'cloudflare',
    activeEndpoint: 'cloudflare',
    probingEndpoints: false,
    endpointProbes: [{ endpoint: 'cloudflare', ok: true, latencyMs: 110 }],
    mirroredProviders: ['osm'],
    fallenBackProviders: [],
    notice: ''
  })
  assert.equal(store().tileMirrorSource, 'cloudflare')
  assert.equal(store().mirrorProbingEndpoints, false)
  assert.deepEqual(store().mirrorFallenBackProviders, [])
})

