import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isTouchInteractionMode,
  normalizeTouchInteractionMode,
  resolveTouchInteractionActive,
  touchInteractionModes
} from '../src/common/touchInteraction.ts'

test('touch interaction modes are the auto/on/off union and the guard accepts exactly them', () => {
  assert.deepEqual([...touchInteractionModes], ['auto', 'on', 'off'])
  for (const mode of touchInteractionModes) {
    assert.equal(isTouchInteractionMode(mode), true)
  }
  assert.equal(isTouchInteractionMode('enabled'), false)
  assert.equal(isTouchInteractionMode(true), false)
  assert.equal(isTouchInteractionMode(undefined), false)
  assert.equal(isTouchInteractionMode(null), false)
})

test('normalize falls back to auto for unknown and legacy values', () => {
  assert.equal(normalizeTouchInteractionMode('on'), 'on')
  assert.equal(normalizeTouchInteractionMode('off'), 'off')
  assert.equal(normalizeTouchInteractionMode('auto'), 'auto')
  assert.equal(normalizeTouchInteractionMode('touch'), 'auto')
  assert.equal(normalizeTouchInteractionMode(1), 'auto')
  assert.equal(normalizeTouchInteractionMode(undefined), 'auto')
})

test('auto resolves through pointer coarseness or touch points, on/off override', () => {
  const desktop = { coarsePointer: false, maxTouchPoints: 0 }
  const touchScreen = { coarsePointer: false, maxTouchPoints: 10 }
  const tablet = { coarsePointer: true, maxTouchPoints: 0 }
  assert.equal(resolveTouchInteractionActive('auto', desktop), false)
  assert.equal(resolveTouchInteractionActive('auto', touchScreen), true)
  assert.equal(resolveTouchInteractionActive('auto', tablet), true)
  assert.equal(resolveTouchInteractionActive('on', desktop), true)
  assert.equal(resolveTouchInteractionActive('off', touchScreen), false)
  assert.equal(resolveTouchInteractionActive('off', tablet), false)
})
