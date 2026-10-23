import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITY_TIER_META, cityTierOf, FUNCTIONAL_ZONES, functionalZoneCities, functionalZoneCityById, urbanCities } from '../src/renderer/src/thematic/urbanCities.ts'

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

test('functional-zone cities: seven cities with unique ids and complete zone kinds', () => {
  assert.equal(functionalZoneCities.length, 7)
  const ids = functionalZoneCities.map((city) => city.id)
  assert.equal(new Set(ids).size, ids.length)
  const kinds = new Set(FUNCTIONAL_ZONES.map((zone) => zone.kind))
  for (const city of functionalZoneCities) {
    assert.ok(city.districts.length >= 5, `${city.name} needs at least five districts`)
    assert.ok(city.longitude > 73 && city.longitude < 136 && city.latitude > 18 && city.latitude < 54, `${city.name} center outside China bounds`)
    assert.ok(city.viewHeight >= 80000 && city.viewHeight <= 300000, `${city.name} view height implausible`)
    assert.ok(city.overview.length >= 20, `${city.name} overview too short`)
    const present = new Set(city.districts.map((district) => district.kind))
    for (const kind of kinds) {
      assert.ok(present.has(kind), `${city.name} lacks ${kind} districts`)
    }
    for (const district of city.districts) {
      assert.ok(kinds.has(district.kind), `${city.name}/${district.name} unknown kind`)
      assert.ok(district.radiusKm >= 0.5 && district.radiusKm <= 6, `${city.name}/${district.name} radius implausible`)
      assert.ok(Math.abs(district.longitude - city.longitude) <= 0.6 && Math.abs(district.latitude - city.latitude) <= 0.6, `${city.name}/${district.name} too far from city center`)
      assert.ok(district.note.length >= 8, `${city.name}/${district.name} note too short`)
    }
  }
})

test('functionalZoneCityById resolves catalogue entries', () => {
  assert.equal(functionalZoneCityById('wuhan')?.name, '武汉')
  assert.equal(functionalZoneCityById('shenyang')?.districts.some((district) => district.name.includes('铁西')), true)
  assert.equal(functionalZoneCityById('nonexistent'), undefined)
})
