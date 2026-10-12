import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasLegacyTileMirrorSetting,
  isMirrorSatelliteProvider,
  mirrorCacheStyleId,
  mirrorEligibleProviders,
  normalizeTileMirrorMode,
  ORIGIN_FAILURES_BEFORE_MIRROR,
  originProbeReachable,
  TileMirrorRouter,
  tileMirrorModes,
  withinMirrorSatelliteDetail
} from '../src/common/tileMirror.ts'

test('mirror eligible providers cover the three non-domestic basemaps, satellite kind only for esri imagery', () => {
  assert.deepEqual(Object.keys(mirrorEligibleProviders).sort(), ['esri-imagery', 'opentopomap', 'osm'])
  assert.equal(isMirrorSatelliteProvider('esri-imagery'), true)
  assert.equal(isMirrorSatelliteProvider('osm'), false)
  assert.equal(isMirrorSatelliteProvider('opentopomap'), false)
  assert.equal(isMirrorSatelliteProvider('baidu'), false)
  assert.equal(isMirrorSatelliteProvider('viirs-night'), false)
  assert.equal(isMirrorSatelliteProvider(''), false)
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
  assert.deepEqual(router.mirroredProviders(['osm', 'esri-imagery', 'opentopomap']), [])
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
