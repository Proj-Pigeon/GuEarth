import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGRI_CATEGORY_META, agriCategoryOf, agriculturalRegions, agriFacts } from '../src/renderer/src/thematic/agriculturalRegions.ts'
import { industrialBases, industrialTransferFacts, industrialTransferFlows } from '../src/renderer/src/thematic/industrialBases.ts'

const CHINA_BOUNDS = { west: 73, east: 136, south: 17.5, north: 54.5 }

function assertRingsInChina(rings, label) {
  assert.ok(Array.isArray(rings) && rings.length > 0, `${label} should have rings`)
  for (const ring of rings) {
    assert.ok(ring.length >= 4, `${label} ring should have at least 4 vertices`)
    for (const [lon, lat] of ring) {
      assert.ok(Number.isFinite(lon) && Number.isFinite(lat), `${label} vertex must be finite`)
      assert.ok(
        lon >= CHINA_BOUNDS.west && lon <= CHINA_BOUNDS.east && lat >= CHINA_BOUNDS.south && lat <= CHINA_BOUNDS.north,
        `${label} vertex (${lon}, ${lat}) outside China bounds`
      )
    }
  }
}

function assertLabelNearRings(labelAt, rings, label) {
  const lons = rings.flat().map(([lon]) => lon)
  const lats = rings.flat().map(([, lat]) => lat)
  const [lon, lat] = labelAt
  assert.ok(
    lon >= Math.min(...lons) - 1.5 && lon <= Math.max(...lons) + 1.5 && lat >= Math.min(...lats) - 1.5 && lat <= Math.max(...lats) + 1.5,
    `${label} labelAt should sit inside its region bbox (with margin)`
  )
}

test('agricultural regions: nine grain bases plus cash-crop belts with valid geometry', () => {
  assert.equal(agriculturalRegions.filter((region) => region.category === 'grain').length, 9)
  const names = agriculturalRegions.map((region) => region.name)
  assert.equal(new Set(names).size, names.length)
  for (const region of agriculturalRegions) {
    assert.ok(agriCategoryOf(region.category), `${region.name} category must be known`)
    assert.ok(region.crop.length > 0, `${region.name} crop must be set`)
    assert.ok(region.summary.length >= 20, `${region.name} summary should carry location factors`)
    assertRingsInChina(region.rings, region.name)
    assertLabelNearRings(region.labelAt, region.rings, region.name)
  }
})

test('agricultural category palette is complete with unique colors', () => {
  assert.deepEqual(AGRI_CATEGORY_META.map((meta) => meta.id), ['grain', 'cotton', 'sugarcane', 'beet'])
  const colors = new Set(AGRI_CATEGORY_META.map((meta) => meta.color))
  assert.equal(colors.size, AGRI_CATEGORY_META.length)
  for (const color of colors) assert.match(color, /^#[0-9a-fA-F]{6}$/)
  assert.equal(agriCategoryOf('grain'), AGRI_CATEGORY_META[0])
})

test('industrial bases: four canonical bases with valid geometry and pillars', () => {
  assert.deepEqual(
    [...industrialBases.map((base) => base.name)].sort(),
    ['京津唐综合性工业基地', '沪宁杭综合性工业基地', '珠三角轻工业基地', '辽中南重工业基地'].sort()
  )
  const colors = new Set(industrialBases.map((base) => base.color))
  assert.equal(colors.size, industrialBases.length)
  for (const base of industrialBases) {
    assertRingsInChina(base.rings, base.name)
    assertLabelNearRings(base.labelAt, base.rings, base.name)
    assert.ok(base.pillars.length >= 3, `${base.name} should list at least three pillars`)
    assert.ok(base.summary.length >= 20, `${base.name} summary should carry location factors`)
  }
})

test('industrial transfer flows: endpoints in bounds and paths usable', () => {
  assert.ok(industrialTransferFlows.length >= 5)
  for (const flow of industrialTransferFlows) {
    assert.notEqual(flow.fromName, flow.toName)
    assert.ok(['major', 'minor'].includes(flow.weight))
    assert.ok(flow.note === undefined || flow.note.length > 0)
    for (const [lon, lat] of [flow.from, flow.to, ...flow.path]) {
      assert.ok(
        Number.isFinite(lon) && Number.isFinite(lat) && lon >= CHINA_BOUNDS.west - 1 && lon <= CHINA_BOUNDS.east && lat >= CHINA_BOUNDS.south && lat <= CHINA_BOUNDS.north,
        `${flow.fromName}→${flow.toName} endpoint (${lon}, ${lat}) outside bounds`
      )
    }
    assert.ok(flow.path.length >= 2, `${flow.fromName}→${flow.toName} path needs at least two points`)
  }
})

test('fact arrays are non-empty and informative', () => {
  for (const facts of [agriFacts, industrialTransferFacts]) {
    assert.ok(facts.length >= 3)
    for (const fact of facts) assert.ok(fact.length >= 12)
  }
})
