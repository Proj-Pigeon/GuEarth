import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  conservativeFlightHeightM,
  destinationAt,
  flightArrivalAllowed,
  flightPointerIsSteering,
  flightReliefOffsets,
  flightSampleCeilingM,
  planFlightCameraHeight
} from '../src/renderer/src/lib/flightFraming.ts'

const nadir = { pitchRadians: -Math.PI / 2, fovYRadians: Math.PI / 3 }

function frame(overrides) {
  return planFlightCameraHeight({
    requestedHeightM: 5000,
    centerGroundM: 0,
    relief: [],
    verticalExaggeration: 1,
    relativeHeightM: 0,
    ...nadir,
    ...overrides
  })
}

const everestRelief = [
  { distanceM: 800, groundM: 8200 },
  { distanceM: 2400, groundM: 6400 },
  { distanceM: 7200, groundM: 4600 }
]

test('flat high ground keeps the collision floor without extra zoom', () => {
  assert.equal(frame({ centerGroundM: 8849, relief: everestRelief.map((sample) => ({ ...sample, groundM: 8849 })), requestedHeightM: 5000 }), 9849)
})

test('steep summit is framed by local relief instead of skimming the surface', () => {
  const height = frame({ centerGroundM: 8849, relief: everestRelief, requestedHeightM: 5000 })
  assert.equal(height, 20849)
  assert.ok(height > 8849 + 1000)
  assert.ok(height - 8849 <= 12000)
})

test('vertical exaggeration raises the framed mountain and still clears the visual surface', () => {
  const normal = frame({ centerGroundM: 8849, relief: everestRelief })
  const exaggerated = frame({ centerGroundM: 8849, relief: everestRelief, verticalExaggeration: 2, relativeHeightM: 0 })
  assert.equal(exaggerated, 29698)
  assert.ok(exaggerated > normal)
  assert.ok(exaggerated > 8849 * 2 + 1000)
})

test('exaggeration reference height still applies on flat terrain', () => {
  assert.equal(frame({ centerGroundM: 8849, verticalExaggeration: 2, relativeHeightM: 100, relief: [{ distanceM: 2400, groundM: 8849 }] }), 18598)
})

test('ordinary low terrain and point destinations keep the requested height', () => {
  const city = [
    { distanceM: 800, groundM: 35 },
    { distanceM: 2400, groundM: 28 },
    { distanceM: 7200, groundM: 42 }
  ]
  assert.equal(frame({ requestedHeightM: 40000, centerGroundM: 30, relief: city }), 40000)
  assert.equal(frame({ requestedHeightM: 2500, centerGroundM: 15, relief: city.map((sample) => ({ ...sample, groundM: 18 })) }), 2500)
  assert.equal(frame({ requestedHeightM: 800, centerGroundM: 20, relief: [] }), 1020)
})

test('gentle hills do not expand into a regional frame', () => {
  const height = frame({
    requestedHeightM: 6000,
    centerGroundM: 80,
    relief: [
      { distanceM: 800, groundM: 110 },
      { distanceM: 2400, groundM: 140 },
      { distanceM: 7200, groundM: 160 }
    ]
  })
  assert.equal(height, 6000)
})

test('broad destinations stay at the requested height over steep relief', () => {
  assert.equal(frame({ requestedHeightM: 1500000, centerGroundM: 8849, relief: everestRelief }), 1500000)
  assert.equal(frame({ requestedHeightM: 50000, centerGroundM: 8849, relief: everestRelief }), 50000)
})

test('moderate relief frames between the collision floor and the mountain cap', () => {
  const height = frame({
    requestedHeightM: 2000,
    centerGroundM: 1500,
    relief: [{ distanceM: 2400, groundM: 1100 }]
  })
  assert.ok(height > 1500 + 1000)
  assert.ok(height < 1500 + 12000)
  assert.ok(height < frame({ centerGroundM: 8849, relief: everestRelief }))
})

test('steep uphill stays above the higher ground with slope continuation clearance', () => {
  const height = frame({
    requestedHeightM: 1500,
    centerGroundM: 1000,
    relief: [{ distanceM: 800, groundM: 3200 }]
  })
  assert.equal(height, 7500)
  assert.ok(height > 3200 + 1000)
})

test('wider field of view can frame lower, and a shallower pitch frames higher', () => {
  const relief = [{ distanceM: 2400, groundM: 1100 }]
  const nadirHeight = frame({ requestedHeightM: 2000, centerGroundM: 1500, relief })
  const wideHeight = frame({ requestedHeightM: 2000, centerGroundM: 1500, relief, fovYRadians: Math.PI / 2 })
  const obliqueHeight = frame({ requestedHeightM: 2000, centerGroundM: 1500, relief, pitchRadians: -Math.PI / 4 })
  assert.ok(wideHeight > 1500 + 1000)
  assert.ok(wideHeight < nadirHeight)
  assert.ok(obliqueHeight > nadirHeight)
})

test('invalid relief samples do not invent a valley or a regional zoom', () => {
  assert.equal(frame({ requestedHeightM: 4000, centerGroundM: 8849, relief: [{ distanceM: 2400, groundM: Number.NaN }, { distanceM: 0, groundM: 0 }, { distanceM: 7200, groundM: Number.POSITIVE_INFINITY }] }), 9849)
  assert.equal(frame({ requestedHeightM: 5000, centerGroundM: 200, relief: [{ distanceM: 800, groundM: Number.NaN }] }), 5000)
})

test('missing fov falls back to the nadir default', () => {
  const relief = [{ distanceM: 2400, groundM: 1100 }]
  assert.equal(
    frame({ requestedHeightM: 2000, centerGroundM: 1500, relief, fovYRadians: Number.NaN }),
    frame({ requestedHeightM: 2000, centerGroundM: 1500, relief })
  )
})

test('unknown terrain fallback and sample ceiling stay above the collision ground', () => {
  assert.equal(conservativeFlightHeightM(5000, 1, 0), 10000)
  assert.equal(conservativeFlightHeightM(60000, 1, 0), 60000)
  assert.equal(conservativeFlightHeightM(5000, 2, 100), 18900)
  assert.equal(flightSampleCeilingM(1, 0), 21000)
  assert.equal(flightSampleCeilingM(2, 0), 30000)
  assert.equal(flightSampleCeilingM(2, 100), 29900)
})

test('relief offsets ring a destination without leaving the hemisphere', () => {
  const offsets = flightReliefOffsets()
  assert.equal(offsets.length, 24)
  const north = destinationAt(86.925, 27.988, 111319.49079327358, 0)
  assert.ok(Math.abs(north.latitude - 28.988) < 1e-4)
  assert.ok(Math.abs(north.longitude - 86.925) < 1e-4)
  const east = destinationAt(86.925, 27.988, 5000, Math.PI / 2)
  assert.ok(east.longitude > 86.925)
  assert.ok(Math.abs(east.latitude - 27.988) < 0.02)
  for (const offset of offsets) {
    const point = destinationAt(86.925, 27.988, offset.distanceM, offset.bearingRad)
    assert.ok(point.longitude >= -180 && point.longitude <= 180)
    assert.ok(point.latitude > 27 && point.latitude < 29)
  }
})

test('a stale flight is dropped when a newer request or direct steering wins', () => {
  assert.equal(flightArrivalAllowed({ requestSequence: 2, activeSequence: 4, viewerAlive: true, userSteered: false }), false)
  assert.equal(flightArrivalAllowed({ requestSequence: 4, activeSequence: 4, viewerAlive: false, userSteered: false }), false)
  assert.equal(flightArrivalAllowed({ requestSequence: 4, activeSequence: 4, viewerAlive: true, userSteered: true }), false)
  assert.equal(flightArrivalAllowed({ requestSequence: 4, activeSequence: 4, viewerAlive: true, userSteered: false }), true)
})

test('only a pressed pointer counts as steering during terrain sampling', () => {
  assert.equal(flightPointerIsSteering(0), false)
  assert.equal(flightPointerIsSteering(1), true)
  assert.equal(flightPointerIsSteering(2), true)
  assert.equal(flightPointerIsSteering(4), true)
  assert.equal(flightPointerIsSteering(Number.NaN), false)
})
