import assert from 'node:assert/strict'
import { test } from 'node:test'
import { viirsCacheStyleId, viirsGranuleDate } from '../src/common/viirs.ts'

test('viirsGranuleDate lags two UTC days behind the request time', () => {
  assert.equal(viirsGranuleDate(Date.UTC(2026, 9, 11, 0, 30)), '2026-10-09')
  assert.equal(viirsGranuleDate(Date.UTC(2026, 9, 11, 23, 59)), '2026-10-09')
  assert.equal(viirsGranuleDate(Date.UTC(2026, 9, 10, 12, 0)), '2026-10-08')
})

test('viirsGranuleDate crosses month and year boundaries on the UTC calendar', () => {
  assert.equal(viirsGranuleDate(Date.UTC(2026, 0, 1, 0, 0)), '2025-12-30')
  assert.equal(viirsGranuleDate(Date.UTC(2025, 2, 1, 0, 0)), '2025-02-27')
})

test('viirsCacheStyleId scopes cache keys by the granule date so stale granules are never served', () => {
  assert.equal(viirsCacheStyleId('night', Date.UTC(2026, 9, 11)), 'night-20261009')
  assert.notEqual(viirsCacheStyleId('night', Date.UTC(2026, 9, 11)), viirsCacheStyleId('night', Date.UTC(2026, 9, 8)))
  assert.match(viirsCacheStyleId('night'), /^night-\d{8}$/)
})
