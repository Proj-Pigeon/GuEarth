import assert from 'node:assert/strict'
import { test } from 'node:test'

import { offscreenFrameRate, offscreenScriptDurationMs } from '../src/main/offscreenTiming.ts'

test('script duration excludes the first scene flight and clamps negative timings', () => {
  const duration = offscreenScriptDurationMs([
    { dwellMs: 6000, flyDurationMs: 3500 },
    { dwellMs: 4000, flyDurationMs: 2000 },
    { dwellMs: -1000, flyDurationMs: -500 }
  ])
  assert.equal(duration, 12000)
})

test('script duration keeps a one second floor', () => {
  assert.equal(offscreenScriptDurationMs([]), 1000)
  assert.equal(offscreenScriptDurationMs([{ dwellMs: 0, flyDurationMs: 0 }]), 1000)
})

test('encoded frame rate preserves wall clock duration when capture drops frames', () => {
  const fullRate = offscreenFrameRate(300, 10000)
  const throttledRate = offscreenFrameRate(150, 10000)
  assert.equal(Math.round(fullRate), 30)
  assert.equal(Math.round(throttledRate), 15)
  assert.ok(Math.abs(300 / fullRate * 1000 - 10000) < 1)
  assert.ok(Math.abs(150 / throttledRate * 1000 - 10000) < 1)
})

test('encoded frame rate never returns zero or a non-finite value', () => {
  assert.equal(offscreenFrameRate(0, 10000), 1)
  assert.equal(offscreenFrameRate(100, 0), 1)
  assert.equal(offscreenFrameRate(Number.NaN, 10000), 1)
  assert.equal(offscreenFrameRate(100, Number.POSITIVE_INFINITY), 1)
})
