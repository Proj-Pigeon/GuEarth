import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withoutTileAvailability } from '../src/common/terrainAvailability.ts'

function availabilityProbe() {
  const state = { availabilityRequests: 0 }
  const terrain = {
    tilingScheme: { id: 'probe' },
    getTileDataAvailable(x, y, level) {
      state.availabilityRequests += 1
      void x
      void y
      void level
      return undefined
    }
  }
  return { state, terrain }
}

test('Cesium treats undefined tile availability as unknown, so a terrain provider never needs the tilemap requests', () => {
  const { state, terrain } = availabilityProbe()
  const wrapped = withoutTileAvailability(terrain)
  for (let level = 0; level < 8; level += 1) {
    for (let x = 0; x < 4; x += 1) assert.equal(wrapped.getTileDataAvailable(x, x, level), undefined)
  }
  assert.equal(state.availabilityRequests, 0)
})

test('wrapping keeps the very same provider instance so terrain identity and tiling scheme stay intact', () => {
  const { terrain } = availabilityProbe()
  const wrapped = withoutTileAvailability(terrain)
  assert.equal(wrapped, terrain)
  assert.equal(wrapped.tilingScheme.id, 'probe')
})

test('the wrapped provider reports unknown availability for any coordinate or level', () => {
  const { terrain } = availabilityProbe()
  const wrapped = withoutTileAvailability(terrain)
  const probes = [
    [0, 0, 0],
    [1, 0, 1],
    [12, 7, 5],
    [999999, 999999, 22]
  ]
  for (const [x, y, level] of probes) assert.equal(wrapped.getTileDataAvailable(x, y, level), undefined)
})
