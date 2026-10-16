import assert from 'node:assert/strict'
import { test } from 'node:test'

import { referencedShapeIds } from '../src/renderer/src/lib/annotationReferences.ts'

test('annotation references collect shapes across nested folders', () => {
  const ids = referencedShapeIds([
    { type: 'shape', id: 'a' },
    { type: 'folder', id: 'f1', name: '分组', children: [{ type: 'shape', id: 'b' }, { type: 'folder', id: 'f2', name: '子分组', children: [{ type: 'shape', id: 'c' }] }] }
  ])
  assert.deepEqual([...ids].sort(), ['a', 'b', 'c'])
})

test('annotation references ignore transient shapes that no entry points at', () => {
  const ids = referencedShapeIds([{ type: 'shape', id: 'saved' }])
  assert.equal(ids.has('saved'), true)
  assert.equal(ids.has('transient'), false)
})

test('annotation references tolerate an empty document', () => {
  assert.equal(referencedShapeIds([]).size, 0)
})
