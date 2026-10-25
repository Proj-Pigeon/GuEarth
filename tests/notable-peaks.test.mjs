import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPeaksNear, nearestPeaks, notablePeaks } from '../src/renderer/src/thematic/notablePeaks.ts'

test('notable peaks: ids and names unique, coordinates and elevations plausible', () => {
  const ids = notablePeaks.map((peak) => peak.id)
  const names = notablePeaks.map((peak) => peak.name)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(names).size, names.length)
  assert.ok(notablePeaks.length >= 70)
  for (const peak of notablePeaks) {
    assert.ok(peak.longitude >= -180 && peak.longitude <= 180 && peak.latitude >= -90 && peak.latitude <= 90, `${peak.id} coords out of range`)
    assert.ok(peak.elevationM >= 1000 && peak.elevationM <= 9000, `${peak.id} elevation implausible`)
    assert.ok(peak.region.length >= 2 && peak.note.length >= 4, `${peak.id} region/note too short`)
  }
})

test('findPeaksNear returns windward-region giants sorted by elevation', () => {
  const aroundEverest = findPeaksNear(86.9, 28.0, 150)
  assert.ok(aroundEverest.length >= 4)
  assert.equal(aroundEverest[0].name, '珠穆朗玛峰')
  for (let index = 1; index < aroundEverest.length; index += 1) {
    assert.ok(aroundEverest[index].elevationM <= aroundEverest[index - 1].elevationM)
  }
  for (const peak of aroundEverest) {
    assert.ok(peak.distanceKm <= 150, `${peak.name} outside the requested radius`)
    assert.ok(peak.bearingDeg >= 0 && peak.bearingDeg < 360)
  }
  const lhotse = aroundEverest.find((peak) => peak.name === '洛子峰')
  assert.ok(lhotse && lhotse.distanceKm < 20, 'Lhotse sits next to Everest')
})

test('findPeaksNear returns nothing in the open ocean while nearestPeaks always answers', () => {
  const midPacific = findPeaksNear(-150, -10, 500)
  assert.deepEqual(midPacific, [])
  const nearest = nearestPeaks(-150, -10, 3)
  assert.equal(nearest.length, 3)
  for (let index = 1; index < nearest.length; index += 1) {
    assert.ok(nearest[index].distanceKm >= nearest[index - 1].distanceKm)
  }
  assert.ok(nearest.every((peak) => Number.isFinite(peak.bearingDeg) && peak.bearingDeg >= 0 && peak.bearingDeg < 360))
})

test('bearing from a point south of Everest points north toward the peak', () => {
  const [everest] = findPeaksNear(86.925, 26, 300)
  assert.ok(everest)
  assert.ok(everest.bearingDeg >= 0 && everest.bearingDeg < 45, `expected northerly bearing, got ${everest.bearingDeg}`)
})

test('catalogue covers representative summits across inhabited continents', () => {
  const probes = [
    ['Asia', 86.5, 28],
    ['Europe', 10, 46.5],
    ['Africa', 35, 0],
    ['North America', -121.5, 46.5],
    ['South America', -69.5, -27.5],
    ['Oceania', 148, -36.5]
  ]
  for (const [continent, longitude, latitude] of probes) {
    const found = findPeaksNear(longitude, latitude, 500)
    assert.ok(found.length >= 1, `${continent} probe should match at least one catalogue peak`)
  }
})
