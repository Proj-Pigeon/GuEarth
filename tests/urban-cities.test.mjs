import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITY_TIER_META, cityTierOf, urbanCities } from '../src/renderer/src/thematic/urbanCities.ts'

test('city tier metadata contains exactly five tiers with strictly shrinking service radii', () => {
  assert.equal(CITY_TIER_META.length, 5)
  assert.deepEqual(Object.keys(cityTierOf('national-center')), Object.keys(CITY_TIER_META[0]))
  const radii = CITY_TIER_META.map((meta) => meta.serviceRadiusKm)
  for (let index = 1; index < radii.length; index += 1) {
    assert.ok(radii[index] < radii[index - 1], `tier ${CITY_TIER_META[index].id} radius must shrink`)
  }
})

test('every tier carries presentation metadata', () => {
  const ids = new Set()
  for (const meta of CITY_TIER_META) {
    assert.ok(!ids.has(meta.id), `duplicate tier id ${meta.id}`)
    ids.add(meta.id)
    assert.match(meta.id, /^[a-z-]+$/)
    assert.ok(meta.name.length > 0)
    assert.ok(meta.description.length > 0)
    assert.ok(meta.serviceRadiusKm > 0)
    assert.match(meta.color, /^#[0-9a-fA-F]{6}$/)
  }
  assert.equal(cityTierOf('unknown'), CITY_TIER_META[CITY_TIER_META.length - 1])
})

test('every urban city carries valid coordinates inside mainland China', () => {
  for (const city of urbanCities) {
    assert.ok(city.longitude > 73 && city.longitude < 136, `${city.name} longitude ${city.longitude}`)
    assert.ok(city.latitude > 18 && city.latitude < 54, `${city.name} latitude ${city.latitude}`)
    assert.ok(city.populationWan > 0, `${city.name} population`)
    assert.ok(city.urbanizationPct === null || (city.urbanizationPct > 0 && city.urbanizationPct < 100), `${city.name} urbanization`)
    assert.ok(city.role.length > 0, `${city.name} role`)
    assert.ok(CITY_TIER_META.some((meta) => meta.id === city.tier), `${city.name} tier ${city.tier}`)
  }
})

test('city names are unique and every tier is represented', () => {
  const names = new Set(urbanCities.map((city) => city.name))
  assert.equal(names.size, urbanCities.length)
  for (const meta of CITY_TIER_META) {
    assert.ok(urbanCities.some((city) => city.tier === meta.id), `no city for tier ${meta.id}`)
  }
})
