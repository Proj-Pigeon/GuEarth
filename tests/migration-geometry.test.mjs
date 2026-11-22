import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  fanMigrationEndpoints,
  migrationFlows,
  smoothMigrationPath
} from '../src/renderer/src/thematic/populationCensus.ts'

test('smoothed path passes through every waypoint', () => {
  for (const flow of migrationFlows) {
    const smoothed = smoothMigrationPath(flow.path)
    assert.deepEqual(smoothed[0], flow.path[0])
    assert.deepEqual(smoothed[smoothed.length - 1], flow.path[flow.path.length - 1])
    assert.ok(smoothed.length > flow.path.length)
    for (const [lon, lat] of smoothed) {
      assert.ok(lon > 70 && lon < 140 && lat > 14 && lat < 56, `out of bounds: ${lon},${lat}`)
    }
  }
})

test('fanned endpoints separate flows sharing a destination', () => {
  const endpoints = fanMigrationEndpoints(migrationFlows)
  const byDest = new Map()
  for (const flow of migrationFlows) {
    const list = byDest.get(flow.toName) ?? []
    list.push(endpoints.get(flow))
    byDest.set(flow.toName, list)
  }
  for (const [dest, list] of byDest) {
    if (list.length === 1) continue
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const dist = Math.hypot(list[i][0] - list[j][0], list[i][1] - list[j][1])
        assert.ok(dist > 0.3, `${dest}: endpoints ${i} and ${j} only ${dist.toFixed(2)}° apart`)
      }
    }
  }
})

test('fanned endpoints stay near the destination and inside China', () => {
  const endpoints = fanMigrationEndpoints(migrationFlows)
  for (const flow of migrationFlows) {
    const [lon, lat] = endpoints.get(flow)
    assert.ok(
      Math.hypot(lon - flow.to[0], lat - flow.to[1]) < 3,
      `${flow.fromName}→${flow.toName} drifted too far`
    )
    assert.ok(lon > 73 && lon < 136 && lat > 17 && lat < 54)
  }
})
