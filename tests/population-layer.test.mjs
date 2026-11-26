import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vite-plus/test'
import {
  censusAgeStructure, densityBins, densityColor, densityOf, densityRank, huComparison, huLineEndpoints,
  migrationFlows, nationalPopulation, populationRank, provincePopulation, provinceSummary, pyramid2020, pyramidAgeGroups,
  urbanizationSeries
} from '../src/renderer/src/thematic/populationCensus.ts'

test('vendored province GeoJSON names match the census table exactly', () => {
  const geo = JSON.parse(readFileSync(new URL('../resources/geo/china-provinces.geojson', import.meta.url), 'utf8'))
  assert.equal(geo.type, 'FeatureCollection')
  const geoNames = geo.features.map((feature) => feature.properties.name).sort()
  const censusNames = provincePopulation.map((province) => province.name).sort()
  assert.deepEqual(geoNames, censusNames)
  for (const feature of geo.features) {
    assert.ok(Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0)
  }
})

test('density bins cover the full density range in ascending order', () => {
  const colors = new Set(densityBins.map((bin) => bin.color))
  assert.equal(colors.size, densityBins.length)
  const openBins = densityBins.filter((bin) => bin.max !== null).map((bin) => bin.max)
  assert.deepEqual([...openBins].sort((a, b) => a - b), openBins)
  assert.equal(densityBins[densityBins.length - 1].max, null)
})

test('densityColor maps values to the correct bins', () => {
  assert.equal(densityColor(9.9), densityBins[0].color)
  assert.equal(densityColor(10), densityBins[1].color)
  assert.equal(densityColor(50), densityBins[2].color)
  assert.equal(densityColor(100), densityBins[3].color)
  assert.equal(densityColor(200), densityBins[4].color)
  assert.equal(densityColor(400), densityBins[5].color)
  assert.equal(densityColor(800), densityBins[6].color)
  assert.equal(densityColor(20_000), densityBins[6].color)
})

test('province census table is complete and internally consistent', () => {
  assert.equal(provincePopulation.length, 34)
  const names = new Set(provincePopulation.map((province) => province.name))
  assert.equal(names.size, 34)
  for (const province of provincePopulation) {
    assert.ok(province.populationWan > 0)
    assert.ok(province.areaWanKm2 > 0)
    assert.ok(province.urbanizationPct === null || (province.urbanizationPct > 0 && province.urbanizationPct <= 100))
    assert.ok(['east', 'west', 'cross'].includes(province.huSide))
  }
  const westNames = new Set(['内蒙古自治区', '宁夏回族自治区', '甘肃省', '青海省', '新疆维吾尔自治区', '西藏自治区'])
  const crossNames = ['四川省', '云南省', '陕西省']
  for (const province of provincePopulation) {
    assert.equal(westNames.has(province.name), province.huSide === 'west')
    assert.equal(crossNames.includes(province.name), province.huSide === 'cross')
  }
})

test('density matches population divided by area and ranks follow the order', () => {
  const guangdong = provincePopulation.find((province) => province.name === '广东省')
  assert.ok(Math.abs(densityOf(guangdong) - 12_601.25 / 17.97) < 0.01)
  assert.equal(populationRank('广东省'), 1)
  assert.equal(populationRank('澳门特别行政区'), 34)
  assert.equal(densityRank('澳门特别行政区'), 1)
  assert.equal(densityRank('西藏自治区'), 34)
})

test('provinceSummary embeds key numbers', () => {
  const summary = provinceSummary('广东省')
  assert.ok(summary.includes('1.26'))
  assert.ok(summary.includes('701'))
  assert.ok(summary.includes('胡焕庸线以东'))
  assert.equal(provinceSummary('火星省'), null)
})

test('2020 pyramid matches census yearbook column totals', () => {
  assert.equal(pyramidAgeGroups.length, 17)
  assert.equal(pyramid2020.male.length, 17)
  assert.equal(pyramid2020.female.length, 17)
  const maleTotal = pyramid2020.male.reduce((sum, value) => sum + value, 0)
  const femaleTotal = pyramid2020.female.reduce((sum, value) => sum + value, 0)
  assert.ok(Math.abs(maleTotal - 72_141.64) < 1)
  assert.ok(Math.abs(femaleTotal - 68_836.23) < 1)
  assert.ok(Math.abs(maleTotal + femaleTotal - 140_977.87) < 2)
})

test('census age structure rows sum to 100 percent', () => {
  assert.equal(censusAgeStructure.length, 7)
  for (const row of censusAgeStructure) {
    const total = row.youngPct + row.workingPct + row.elderlyPct
    assert.ok(Math.abs(total - 100) < 0.02, `year ${row.year} sums to ${total}`)
  }
  assert.deepEqual(censusAgeStructure.map((row) => row.year), [1953, 1964, 1982, 1990, 2000, 2010, 2020])
})

test('national population and urbanization series are sane', () => {
  assert.deepEqual(nationalPopulation.map((row) => row.year), [1953, 1964, 1982, 1990, 2000, 2010, 2020])
  for (const row of nationalPopulation) {assert.ok(row.populationWan > 50000 && row.populationWan < 150000)}
  assert.equal(urbanizationSeries[0][0], 1949)
  for (const [year, pct] of urbanizationSeries) {
    assert.ok(year >= 1949 && year <= 2023)
    assert.ok(pct > 0 && pct < 100)
  }
})

test('hu line comparison and endpoints are coherent', () => {
  assert.ok(Math.abs(huComparison.eastAreaPct + huComparison.westAreaPct - 100) < 0.01)
  assert.ok(Math.abs(huComparison.eastPopPct + huComparison.westPopPct - 100) < 0.01)
  assert.ok(huComparison.eastPopPct > 90)
  const [heihe, tengchong] = huLineEndpoints
  assert.ok(heihe.longitude > 120 && heihe.latitude > 48)
  assert.ok(tengchong.longitude < 100 && tengchong.latitude > 23 && tengchong.latitude < 27)
})

test('migration flows stay within China bounds and expose complete paths', () => {
  assert.ok(migrationFlows.length >= 10)
  for (const flow of migrationFlows) {
    assert.ok(Array.isArray(flow.path) && flow.path.length >= 2)
    assert.deepEqual(flow.path[0], flow.from)
    assert.deepEqual(flow.path.at(-1), flow.to)
    for (const [longitude, latitude] of flow.path) {
      assert.ok(longitude > 73 && longitude < 136 && latitude > 17 && latitude < 54)
    }
    assert.ok(['major', 'minor'].includes(flow.weight))
  }
})
