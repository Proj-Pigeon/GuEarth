import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SEA_LEVEL_SCENARIOS, cacheKeyOf, cellAreaKm2, coastalZones, gridPointsOf, heightCache,
  inundationByZone, isInundated, recordSamples, seaLevelFacts, scenarioSummary, totalInundatedAreaKm2
} from '../src/renderer/src/thematic/seaLevelRise.ts'

test('coastal zones: bounding boxes in China bounds with sane grid sizes', () => {
  assert.ok(coastalZones.length >= 5)
  const totalPoints = coastalZones.reduce((sum, zone) => sum + gridPointsOf(zone).length, 0)
  assert.ok(totalPoints <= 2000, `grid sampling should stay bounded, got ${totalPoints}`)
  for (const zone of coastalZones) {
    assert.ok(zone.west < zone.east && zone.south < zone.north, `${zone.id} bbox inverted`)
    assert.ok(zone.west >= 108 && zone.east <= 124 && zone.south >= 20 && zone.north <= 41, `${zone.id} must sit on China's east coast`)
    assert.ok(zone.step > 0.03 && zone.step <= 0.15, `${zone.id} step out of teaching range`)
    for (const [lon, lat] of gridPointsOf(zone)) {
      assert.ok(lon > zone.west && lon < zone.east && lat > zone.south && lat < zone.north)
    }
  }
})

test('inundation classification treats sea cells as never flooded land', () => {
  assert.equal(isInundated(-12, 5), false)
  assert.equal(isInundated(0.4, 0.5), true)
  assert.equal(isInundated(0.6, 0.5), false)
  assert.equal(isInundated(0.9, 1), true)
  assert.equal(isInundated(4.9, 5), true)
  assert.equal(isInundated(5.2, 5), false)
})

test('area estimation scales with cos(latitude) and scenario totals react to the cache', () => {
  const zone = coastalZones[0]
  const lowLat = cellAreaKm2(zone, 38.9)
  const highLat = cellAreaKm2(zone, 41)
  assert.ok(lowLat > highLat)
  assert.ok(lowLat > 50 && lowLat < 200)

  heightCache.clear()
  assert.equal(totalInundatedAreaKm2(1), 0)
  const points = gridPointsOf(zone)
  recordSamples(points, points.map((_, index) => (index % 2 === 0 ? -30 : 0.5)))
  const report = inundationByZone(1).find((item) => item.zone.id === zone.id)
  assert.ok(report)
  assert.equal(report.floodedCells, Math.ceil(points.length / 2))
  assert.ok(report.areaKm2 > 0)
  assert.ok(totalInundatedAreaKm2(0.5) <= totalInundatedAreaKm2(1))
  assert.ok(totalInundatedAreaKm2(1) <= totalInundatedAreaKm2(5))
  heightCache.clear()
})

test('cache keys are stable and scenarios list matches teaching values', () => {
  assert.equal(cacheKeyOf(120.123456, 31.98765), '120.1235,31.9876')
  assert.deepEqual([...SEA_LEVEL_SCENARIOS], [0.5, 1, 2, 5])
  assert.ok(seaLevelFacts.length >= 4)
  for (const rise of SEA_LEVEL_SCENARIOS) assert.ok(scenarioSummary(rise).includes(String(rise)))
})
