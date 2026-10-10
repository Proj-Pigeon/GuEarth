import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HSR_END_YEAR, HSR_START_YEAR, hsrFacts, hsrGrowthSeries, hsrLines, hsrLinesUpTo, hsrMileageAt } from '../src/renderer/src/thematic/hsrLines.ts'

test('hsr lines: opening years within growth window and paths in China bounds', () => {
  assert.ok(hsrLines.length >= 15)
  const names = hsrLines.map((line) => line.name)
  assert.equal(new Set(names).size, names.length)
  for (const line of hsrLines) {
    assert.ok(line.openedYear >= HSR_START_YEAR && line.openedYear <= HSR_END_YEAR, `${line.name} openedYear out of range`)
    assert.ok(line.lengthKm > 0 && line.designSpeed >= 200, `${line.name} length/speed must be plausible`)
    assert.ok(line.path.length >= 4, `${line.name} path needs at least four vertices`)
    for (const [lon, lat] of line.path) {
      assert.ok(Number.isFinite(lon) && Number.isFinite(lat), `${line.name} vertex must be finite`)
      assert.ok(lon >= 73 && lon <= 136 && lat >= 18 && lat <= 54, `${line.name} vertex (${lon}, ${lat}) outside China bounds`)
    }
  }
})

test('hsr growth series is monotonic and bracketed by the line catalogue', () => {
  assert.equal(hsrGrowthSeries[0][0], HSR_START_YEAR)
  for (let index = 1; index < hsrGrowthSeries.length; index += 1) {
    assert.ok(hsrGrowthSeries[index][0] > hsrGrowthSeries[index - 1][0])
    assert.ok(hsrGrowthSeries[index][1] > hsrGrowthSeries[index - 1][1])
  }
  assert.ok(hsrMileageAt(2007) === 0)
  assert.ok(hsrMileageAt(2008) >= hsrLines.find((line) => line.name === '京津城际').lengthKm)
  assert.ok(hsrMileageAt(HSR_END_YEAR) > 40000)
})

test('hsrLinesUpTo grows monotonically with the year', () => {
  let previous = -1
  for (let year = HSR_START_YEAR; year <= HSR_END_YEAR; year += 1) {
    const count = hsrLinesUpTo(year).length
    assert.ok(count >= previous)
    previous = count
  }
  assert.equal(hsrLinesUpTo(HSR_END_YEAR).length, hsrLines.length)
})

test('hsr facts are informative', () => {
  assert.ok(hsrFacts.length >= 3)
  for (const fact of hsrFacts) assert.ok(fact.length >= 12)
})
