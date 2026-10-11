import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMirrorSatelliteProvider, mirrorEligibleProviders, withinMirrorSatelliteDetail } from '../src/common/tileMirror.ts'

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
