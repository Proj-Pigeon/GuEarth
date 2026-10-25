import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beltAtAltitude, mountainById, snowlineM, zonationMountains, zonationPrinciples } from '../src/renderer/src/thematic/mountainZonation.ts'
import { bearingDeg, greatCircleKm, groundProfileImplausible, interpolateWaypoints, planTransectAltitudes, transectHops, transectLegsKm, transectTotalKm } from '../src/renderer/src/lib/transect.ts'

test('zonation mountains: ids unique, coordinates valid, transects bracket the summit', () => {
  const ids = zonationMountains.map((mountain) => mountain.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(zonationMountains.length >= 5)
  for (const mountain of zonationMountains) {
    assert.ok(Number.isFinite(mountain.longitude) && Number.isFinite(mountain.latitude), `${mountain.id} coords must be finite`)
    assert.ok(mountain.longitude >= -180 && mountain.longitude <= 180 && mountain.latitude >= -90 && mountain.latitude <= 90, `${mountain.id} coords out of range`)
    assert.ok(mountain.summitM >= 2000 && mountain.summitM <= 9000, `${mountain.id} summit implausible`)
    assert.ok(mountain.viewHeight >= 50000 && mountain.viewHeight <= 500000, `${mountain.id} view height implausible`)
    assert.ok(mountain.transect.length >= 3 && mountain.transect.length <= 6, `${mountain.id} transect needs 3-6 waypoints`)
    for (const [longitude, latitude] of mountain.transect) {
      assert.ok(Math.abs(longitude - mountain.longitude) <= 3, `${mountain.id} transect longitude too far`)
      assert.ok(Math.abs(latitude - mountain.latitude) <= 3, `${mountain.id} transect latitude too far`)
    }
    assert.ok(mountain.facts.length >= 2)
  }
})

test('zonation belts: contiguous, ascending, cover base to summit, colors are hex', () => {
  for (const mountain of zonationMountains) {
    assert.ok(mountain.slopes.length === 1 || mountain.slopes.length === 2, `${mountain.id} slope count`)
    for (const slope of mountain.slopes) {
      assert.ok(slope.belts.length >= 3, `${mountain.id}/${slope.side} needs at least three belts`)
      assert.equal(slope.belts[0].fromM, slope.baseM, `${mountain.id}/${slope.side} first belt must start at base`)
      assert.equal(slope.belts[slope.belts.length - 1].toM, mountain.summitM, `${mountain.id}/${slope.side} last belt must reach summit`)
      for (let index = 0; index < slope.belts.length; index += 1) {
        const belt = slope.belts[index]
        assert.ok(belt.toM > belt.fromM, `${mountain.id}/${slope.side}/${belt.id} range must ascend`)
        assert.match(belt.color, /^#[0-9a-f]{6}$/i, `${mountain.id}/${slope.side}/${belt.id} color must be hex`)
        assert.ok(belt.note.length >= 6, `${mountain.id}/${slope.side}/${belt.id} note too short`)
        if (index > 0) {
          assert.equal(belt.fromM, slope.belts[index - 1].toM, `${mountain.id}/${slope.side} belts must be contiguous`)
        }
      }
    }
  }
})

test('everest slopes demonstrate snowline and forest contrast between aspects', () => {
  const everest = mountainById('everest')
  assert.ok(everest)
  const [south, north] = everest.slopes
  assert.equal(south.side, 'south')
  assert.equal(north.side, 'north')
  const southSnow = snowlineM(south)
  const northSnow = snowlineM(north)
  assert.ok(southSnow !== undefined && northSnow !== undefined)
  assert.ok(southSnow < northSnow, 'windward south slope must have a lower snowline')
  assert.ok(south.belts.some((belt) => belt.name.includes('林')), 'south slope must carry forest belts')
  assert.ok(!north.belts.some((belt) => belt.name.includes('林')), 'north plateau side must lack forest belts')
  assert.ok(north.baseM > south.baseM, 'north base starts on the plateau')
})

test('mountainById and beltAtAltitude resolve the expected belts', () => {
  const everest = mountainById('everest')
  const south = everest.slopes[0]
  assert.equal(beltAtAltitude(south, south.baseM)?.id, south.belts[0].id)
  assert.equal(beltAtAltitude(south, mountainById('everest').summitM - 1)?.name, '积雪冰川带')
  assert.equal(beltAtAltitude(south, south.baseM - 10), undefined)
  assert.equal(mountainById('nonexistent'), undefined)
  for (const mountain of zonationMountains) {
    if (mountain.id === 'changbai') {
      assert.equal(snowlineM(mountain.slopes[0]), undefined, 'changbai is too low for permanent snow')
    } else {
      assert.ok(snowlineM(mountain.slopes[0]) !== undefined, `${mountain.id} should expose a snowline`)
    }
  }
})

test('zonation principles are informative', () => {
  assert.ok(zonationPrinciples.length >= 4)
  for (const principle of zonationPrinciples) assert.ok(principle.length >= 12)
})

test('greatCircleKm and bearingDeg match known geometry', () => {
  const equatorQuarter = greatCircleKm(0, 0, 90, 0)
  assert.ok(Math.abs(equatorQuarter - Math.PI * 6371 / 2) < 1, 'quarter equator arc should be ~10007 km')
  assert.ok(Math.abs(greatCircleKm(116, 40, 116, 40)) < 1e-9)
  assert.ok(Math.abs(bearingDeg(116, 40, 116, 50)) < 0.01, 'due north bearing is 0')
  assert.ok(Math.abs(bearingDeg(0, 0, 90, 0) - 90) < 0.01, 'due east along the equator is 90')
  const alongParallel = bearingDeg(116, 40, 126, 40)
  assert.ok(alongParallel > 80 && alongParallel < 90, `great-circle bearing along a parallel leans north of east, got ${alongParallel}`)
  assert.ok(Math.abs(bearingDeg(116, 40, 116, 30) - 180) < 0.01, 'due south bearing is 180')
})

test('interpolateWaypoints preserves endpoints and count', () => {
  const waypoints = [[0, 0], [10, 0], [20, 10]]
  const points = interpolateWaypoints(waypoints, 4)
  assert.equal(points.length, 1 + (waypoints.length - 1) * 4)
  assert.deepEqual(points[0], waypoints[0])
  assert.deepEqual(points[points.length - 1], waypoints[waypoints.length - 1])
  assert.deepEqual(interpolateWaypoints(waypoints, 0).length, waypoints.length)
  const legs = transectLegsKm(points)
  assert.equal(legs.length, points.length - 1)
  assert.ok(transectTotalKm(points) > 0)
  assert.ok(Math.abs(transectTotalKm(points) - legs.reduce((sum, leg) => sum + leg, 0)) < 1e-9)
})

test('transectHops walks from the end to the start within the hop budget', () => {
  assert.deepEqual(transectHops(5, 24), [4, 3, 2, 1, 0])
  const hops = transectHops(65, 24)
  assert.equal(hops[0], 64)
  assert.equal(hops[hops.length - 1], 0)
  assert.ok(hops.length <= 25)
  for (let index = 1; index < hops.length; index += 1) {
    assert.ok(hops[index] < hops[index - 1], 'hops must descend')
  }
  assert.deepEqual(transectHops(0, 24), [])
})

test('planTransectAltitudes keeps every point safe, floored, bounded and convex-proof', () => {
  const clearance = 2000
  const minimum = 9000
  const surfaces = [1000, 20000, 15000, 3000, 500]
  const altitudes = planTransectAltitudes(surfaces, clearance, minimum)
  assert.equal(altitudes.length, surfaces.length)
  for (let index = 0; index < surfaces.length; index += 1) {
    assert.ok(altitudes[index] >= surfaces[index] + clearance, `point ${index} below local safety`)
    assert.ok(altitudes[index] >= minimum, `point ${index} below minimum altitude`)
  }
  assert.ok(Math.max(...altitudes) <= Math.max(...surfaces) + clearance, 'altitude overshoots the highest local surface')
  const convex = planTransectAltitudes([0, 19000, 0], clearance, minimum)
  for (const altitude of convex) {
    assert.ok(altitude >= 19000 + clearance, 'convex mid-bump must lift neighbouring samples too')
  }
  const requested = planTransectAltitudes([100, 200], clearance, minimum, 25000)
  for (const altitude of requested) assert.ok(altitude >= 25000)
  assert.deepEqual(planTransectAltitudes([], clearance, minimum), [])
})

test('planTransectAltitudes keeps ridge shoulders above the ridge after smoothing', () => {
  const clearance = 2000
  const minimum = 2500
  const ridge = planTransectAltitudes([0, 0, 19000, 0, 0], clearance, minimum)
  for (const index of [1, 2, 3]) {
    assert.ok(ridge[index] >= 19000 + clearance - 1e-6, `shoulder ${index} dipped to ${ridge[index]} below the ridge surface`)
  }
})

test('planTransectAltitudes lifts samples two steps away from a ridge', () => {
  const clearance = 2000
  const minimum = 2500
  const altitudes = planTransectAltitudes([0, 0, 0, 19000, 0, 0, 0], clearance, minimum)
  for (const index of [1, 2, 3, 4, 5]) {
    assert.ok(altitudes[index] >= 19000 + clearance - 1e-6, `two-step shoulder ${index} dipped to ${altitudes[index]} below the ridge surface`)
  }
})

test('groundProfileImplausible flags damped level-zero style profiles against the catalogue summit', () => {
  assert.ok(groundProfileImplausible([3000, 3800, 3200], 8848), 'level-zero damped Everest profile must be flagged')
  assert.ok(!groundProfileImplausible([8300, 8700, 6200], 8848), 'a profile crossing the massif is plausible')
  assert.ok(!groundProfileImplausible([3000, 3800, 3200]), 'no expected summit means no plausibility verdict')
  assert.ok(!groundProfileImplausible([], 8848), 'empty profile has no verdict')
  assert.ok(!groundProfileImplausible([3000, 3800, 3200], Number.NaN), 'non-finite expected summit has no verdict')
})
