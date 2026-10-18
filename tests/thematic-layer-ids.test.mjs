import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { THEMATIC_LAYER_ID_SET, THEMATIC_LAYER_IDS } from '../src/common/thematicLayers.ts'

const climateSource = await readFile(new URL('../src/renderer/src/stores/climate.ts', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')

test('the shared layer id list is the single source for the renderer store', () => {
  assert.ok(THEMATIC_LAYER_IDS.length > 14)
  assert.equal(new Set(THEMATIC_LAYER_IDS).size, THEMATIC_LAYER_IDS.length)
  assert.match(climateSource, /import type \{ ThematicLayerId \} from '\.\.\/\.\.\/\.\.\/common\/thematicLayers'/)
  assert.match(climateSource, /export type \{ ThematicLayerId \}/)
  assert.doesNotMatch(climateSource, /export type ThematicLayerId = '/)
})

test('every shared layer id has a catalog entry and an overlay default', () => {
  for (const id of THEMATIC_LAYER_IDS) {
    assert.ok(THEMATIC_LAYER_ID_SET.has(id))
    assert.match(climateSource, new RegExp(`id: '${id}'`), `catalog entry missing for ${id}`)
    assert.match(climateSource, new RegExp(`'${id}':`), `overlay default missing for ${id}`)
  }
})

test('scene snapshots validate overlays against the catalog instead of a fixed cap', () => {
  assert.doesNotMatch(mainSource, /overlays\.length >/)
  assert.match(mainSource, /THEMATIC_LAYER_ID_SET\.has\(item\)/)
})
