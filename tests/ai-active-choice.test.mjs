import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseActiveChoice } from '../src/renderer/src/lib/aiActiveChoice.ts'

test('active choice splits provider and model on the first colon', () => {
  assert.deepEqual(parseActiveChoice('p1:deepseek-chat'), { providerId: 'p1', modelId: 'deepseek-chat' })
  assert.deepEqual(parseActiveChoice('p1:vendor:model'), { providerId: 'p1', modelId: 'vendor:model' })
})

test('cleared default model selection resolves to an empty pair without throwing', () => {
  const empty = { providerId: '', modelId: '' }
  assert.deepEqual(parseActiveChoice(undefined), empty)
  assert.deepEqual(parseActiveChoice(null), empty)
  assert.deepEqual(parseActiveChoice(''), empty)
  assert.deepEqual(parseActiveChoice('no-separator'), empty)
})
