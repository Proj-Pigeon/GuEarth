import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SEA_LEVEL_SCENARIOS, buildLandMask, cacheKeyOf, cellAreaKm2, coastalZones, gridPointsOf, heightCache,
  inundationByZone, isLandCell, isInundated, recordSamples, seaLevelFacts, scenarioSummary,
  setLandMask, totalGridCellCount, totalInundatedAreaKm2
} from '../src/renderer/src/thematic/seaLevelRise.ts'

test('coastal zones: bounding boxes in China bounds with sane grid sizes', () => {
  assert.ok(coastalZones.length >= 5)
  const totalPoints = coastalZones.reduce((sum, zone) => sum + gridPointsOf(zone).length, 0)
  assert.ok(totalPoints <= 2000, `grid sampling should stay bounded, got ${totalPoints}`)
  assert.equal(totalPoints, totalGridCellCount)
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

  setLandMask(null)
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

test('land mask distinguishes mainland, island, lake and open sea', () => {
  const mainland = { polygons: [[[[110, 30], [112, 30], [112, 32], [110, 32], [110, 30]]]] }
  const mask = buildLandMask([mainland])
  assert.equal(mask(111, 31), true)
  assert.equal(mask(113, 31), false)
  assert.equal(mask(109.9, 31), false)

  const withIsland = { polygons: [
    [[[110, 30], [112, 30], [112, 32], [110, 32], [110, 30]]],
    [[[113, 30], [113.5, 30], [113.5, 30.4], [113, 30.4], [113, 30]]]
  ] }
  const islandMask = buildLandMask([withIsland])
  assert.equal(islandMask(113.2, 30.2), true)
  assert.equal(islandMask(112.5, 31), false)

  const withLake = { polygons: [[
    [[110, 30], [112, 30], [112, 32], [110, 32], [110, 30]],
    [[110.8, 30.8], [111.2, 30.8], [111.2, 31.2], [110.8, 31.2], [110.8, 30.8]]
  ]] }
  const lakeMask = buildLandMask([withLake])
  assert.equal(lakeMask(111, 31), false)
  assert.equal(lakeMask(110.5, 31), true)
})

test('inundation statistics never count open-sea cells', () => {
  const zone = coastalZones[0]
  const points = gridPointsOf(zone)
  heightCache.clear()
  setLandMask(null)
  recordSamples(points, points.map(() => 0))
  const seaReport = inundationByZone(1).find((item) => item.zone.id === zone.id)
  assert.ok(seaReport)
  assert.equal(seaReport.floodedCells, 0)
  assert.equal(seaReport.areaKm2, 0)

  setLandMask(buildLandMask([{ polygons: [[[
    [zone.west, zone.south], [zone.east, zone.south], [zone.east, zone.north], [zone.west, zone.north], [zone.west, zone.south]
  ]]] }]))
  const landReport = inundationByZone(1).find((item) => item.zone.id === zone.id)
  assert.ok(landReport)
  assert.equal(landReport.floodedCells, points.length)
  assert.ok(landReport.areaKm2 > 0)
  setLandMask(null)
  heightCache.clear()
})

test('isLandCell combines the province mask with a height threshold', () => {
  setLandMask(null)
  assert.equal(isLandCell(120, 32, 0), false)
  assert.equal(isLandCell(120, 32, 0.4), true)
  assert.equal(isLandCell(120, 32, -3), false)
  setLandMask(() => true)
  assert.equal(isLandCell(120, 32, -3), true)
  setLandMask(() => false)
  assert.equal(isLandCell(120, 32, 3), true)
  assert.equal(isLandCell(120, 32, 0), false)
  setLandMask(null)
})
