import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
import { attachOriginTerrainFallback } from '../src/common/terrainAvailability.ts'
import {
  MIRROR_POLICY_FALLBACK_TITLES,
  MIRROR_POLICY_IDS,
  parsePolicyMarkdown
} from '../src/common/mirrorPolicies.ts'
import {
  EDGEONE_ARCGIS_TERRAIN_URL,
  EDGEONE_EARTHQUAKES_URL,
  EDGEONE_MIRROR_BASE_URL,
  EDGEONE_MODELS_DEV_URL,
  edgeOneTileMirrorUrl,
  hasLegacyTileMirrorSetting,
  isLikelyMainlandChinaEnv,
  isMirrorSatelliteProvider,
  mirrorCacheStyleId,
  mirrorEligibleProviders,
  normalizeTileMirrorMode,
  ORIGIN_FAILURES_BEFORE_MIRROR,
  originProbeReachable,
  resolveStoredTileMirrorSettings,
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

const { useGlobeStore } = await import('../src/renderer/src/stores/globe.ts')

test('mirror eligible providers cover the four overseas basemaps, satellite kind only for esri imagery', () => {
  assert.deepEqual(Object.keys(mirrorEligibleProviders).sort(), ['esri-imagery', 'opentopomap', 'osm', 'viirs-night'])
  assert.equal(isMirrorSatelliteProvider('esri-imagery'), true)
  assert.equal(isMirrorSatelliteProvider('osm'), false)
  assert.equal(isMirrorSatelliteProvider('opentopomap'), false)
  assert.equal(isMirrorSatelliteProvider('viirs-night'), false)
  assert.equal(isMirrorSatelliteProvider('baidu'), false)
  assert.equal(isMirrorSatelliteProvider(''), false)
})

test('EdgeOne mirror endpoints point to earth.proxy.nexaorion.cn and validate tile coordinates', () => {
  assert.equal(EDGEONE_MIRROR_BASE_URL, 'https://earth.proxy.nexaorion.cn')
  assert.equal(EDGEONE_ARCGIS_TERRAIN_URL, 'https://earth.proxy.nexaorion.cn/arcgis')
  assert.equal(EDGEONE_EARTHQUAKES_URL, 'https://earth.proxy.nexaorion.cn/datasets/earthquakes')
  assert.equal(EDGEONE_MODELS_DEV_URL, 'https://earth.proxy.nexaorion.cn/modelsdev')

  assert.equal(edgeOneTileMirrorUrl('osm', 5, 12, 8), 'https://earth.proxy.nexaorion.cn/tiles/osm/5/12/8.png')
  assert.equal(edgeOneTileMirrorUrl('osm', 20, 0, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 6, 25, 13), 'https://earth.proxy.nexaorion.cn/tiles/esri/6/13/25')
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 23, 100, 200), 'https://earth.proxy.nexaorion.cn/tiles/esri/23/200/100')
  assert.equal(edgeOneTileMirrorUrl('esri-imagery', 24, 0, 0), undefined)
  assert.equal(edgeOneTileMirrorUrl('opentopomap', 17, 10, 20), 'https://earth.proxy.nexaorion.cn/tiles/opentopo/17/10/20.png')
  assert.equal(edgeOneTileMirrorUrl('opentopomap', 18, 0, 0), undefined)
  assert.equal(
    edgeOneTileMirrorUrl('viirs-night', 8, 120, 80, '2026-11-15'),
    'https://earth.proxy.nexaorion.cn/tiles/viirs/2026-11-15/8/80/120.jpeg'
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

  const modalSource = readFileSync(new URL('../src/renderer/src/components/MirrorPolicyModal.vue', import.meta.url), 'utf8')
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

test('auto mode recovers to the origin when the mirror itself fails', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  router.noteProbeResult('opentopomap', false)
  assert.equal(router.sourceFor('opentopomap'), 'mirror')
  assert.equal(router.noteMirrorFailure('opentopomap'), true)
  assert.equal(router.sourceFor('opentopomap'), 'origin')
  assert.equal(router.noteMirrorFailure('opentopomap'), false)
})

test('auto mode restarts the origin failure streak after the mirror itself fails', () => {
  const router = new TileMirrorRouter()
  router.setMode('auto')
  for (let attempt = 0; attempt < ORIGIN_FAILURES_BEFORE_MIRROR; attempt += 1) router.noteOriginFailure('osm')
  assert.equal(router.sourceFor('osm'), 'mirror')
  assert.equal(router.noteMirrorFailure('osm'), true)
  assert.equal(router.sourceFor('osm'), 'origin')
  for (let attempt = 1; attempt < ORIGIN_FAILURES_BEFORE_MIRROR; attempt += 1) assert.equal(router.noteOriginFailure('osm'), false)
  assert.equal(router.sourceFor('osm'), 'origin')
})

test('on mode mirrors every source until a mirror failure falls back to the origin for the session', () => {
  const router = new TileMirrorRouter()
  router.setMode('on')
  for (const providerId of Object.keys(mirrorEligibleProviders)) assert.equal(router.sourceFor(providerId), 'mirror')
  assert.equal(router.noteMirrorFailure('osm'), true)
  assert.equal(router.sourceFor('osm'), 'origin')
  assert.equal(router.sourceFor('esri-imagery'), 'mirror')
  assert.equal(router.noteMirrorFailure('osm'), false)
  assert.equal(router.noteMirrorFailure('osm'), false)
  router.setMode('on')
  assert.equal(router.sourceFor('osm'), 'mirror')
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
  t.after(() => {
    globalThis.window = originalWindow
  })
  setActivePinia(createPinia())
  const store = useGlobeStore()
  assert.equal(store.settingsHydrated, false)
  await store.hydrateSettings()
  assert.equal(store.settingsHydrated, true)
  assert.equal(store.mirrorConsentPrompted, false)
  assert.equal(store.tileMirrorMode, 'off')

  store.openMirrorConsent('china')
  assert.equal(store.mirrorConsentOpen, true)
  assert.equal(store.mirrorConsentReason, 'china')

  store.openMirrorPolicy('acceptable-use')
  assert.equal(store.mirrorPolicyOpen, true)
  assert.equal(store.mirrorPolicyActiveId, 'acceptable-use')
  store.closeMirrorPolicy()
  assert.equal(store.mirrorPolicyOpen, false)

  store.declineMirrorConsent()
  assert.equal(store.mirrorConsentOpen, false)
  assert.equal(store.mirrorConsentPrompted, true)
  assert.equal(store.tileMirrorMode, 'off')
  assert.equal(updates.at(-1).mirrorConsentPrompted, true)
  assert.equal(updates.at(-1).tileMirrorMode, 'off')

  store.openMirrorConsent('settings')
  assert.equal(store.mirrorConsentOpen, true)
  assert.equal(store.mirrorConsentReason, 'settings')
  store.acceptMirrorConsent()
  assert.equal(store.mirrorConsentOpen, false)
  assert.equal(store.tileMirrorMode, 'on')
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
  t.after(() => {
    globalThis.window = originalWindow
  })
  setActivePinia(createPinia())
  const store = useGlobeStore()
  await store.hydrateSettings()
  assert.equal(store.settingsHydrated, true)

  store.setTileCacheEnabled(false)
  assert.equal(updates.length, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(updates[0], 'mirrorConsentPrompted'), false)

  store.acceptMirrorConsent()
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

