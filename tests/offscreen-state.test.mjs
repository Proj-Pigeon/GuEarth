import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { wrapText } from '../src/renderer/src/offscreenText.ts'

const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const viewerSource = await readFile(new URL('../src/renderer/src/composables/useCesiumViewer.ts', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')

function sliceBetween(source, start, end) {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `missing ${start}`)
  const to = source.indexOf(end, from)
  assert.notEqual(to, -1, `missing ${end}`)
  return source.slice(from, to)
}

const subtitleContext = { measureText: (text) => ({ width: text.length * 10 }) }

test('subtitle wrapping breaks lines on real newline characters', () => {
  assert.deepEqual(wrapText(subtitleContext, 'abc\ndef', 1000), ['abc', 'def'])
  assert.deepEqual(wrapText(subtitleContext, 'a\n\nb', 1000), ['a', '', 'b'])
  assert.deepEqual(wrapText(subtitleContext, '第一行\n第二行', 1000), ['第一行', '第二行'])
})

test('a literal backslash-n in a narration stays on a single line', () => {
  assert.deepEqual(wrapText(subtitleContext, '第一行\\n第二行', 1000), ['第一行\\n第二行'])
  assert.deepEqual(wrapText(subtitleContext, 'a\\nb', 1000), ['a\\nb'])
})

test('long narration wraps at maxWidth and caps at three lines', () => {
  assert.deepEqual(wrapText(subtitleContext, 'abcdef', 25), ['ab', 'cd', 'ef'])
  assert.equal(wrapText(subtitleContext, 'abcdefgh', 25).length, 3)
  assert.deepEqual(wrapText(subtitleContext, 'abcdefghij', 9999), ['abcdefghij'])
})

test('offscreen imports the subtitle text helper instead of defining it', () => {
  assert.match(offscreenSource, /import \{ wrapText \} from '\.\/offscreenText'/)
  assert.doesNotMatch(offscreenSource, /function wrapText/)
})

test('a failed basemap does not abort the rest of the scene snapshot and is not retried', () => {
  assert.match(offscreenSource, /const failedImageryKeys = new Set<string>\(\)/)

  const applySnapshotBody = sliceBetween(offscreenSource, 'async function applySnapshot(', 'function applySceneState(')
  const catchBody = sliceBetween(applySnapshotBody, '} catch {', 'imageryLayers.forEach')
  assert.match(catchBody, /failedImageryKeys\.add\(imageryKey\)/)
  assert.match(catchBody, /reportNotice\(`录制画面的底图[^\r\n]*\)/)
  assert.doesNotMatch(catchBody, /return/)

  assert.match(applySnapshotBody, /if \(!imageryLayers\.has\(imageryKey\) && !failedImageryKeys\.has\(imageryKey\)\)/)

  const noticeAt = applySnapshotBody.indexOf('reportNotice(`录制画面的底图')
  const remainingState = ['climateStore.setEnsoPhase', 'climateStore.setSeaLevelRise', 'transportStore.setYear', 'climateStore.setOverlay', 'climateStore.setMonth', 'solarStore.setActive(true)', 'solarStore.setMotionPanel']
  for (const call of remainingState) {
    const at = applySnapshotBody.indexOf(call)
    assert.ok(at > noticeAt, `${call} must still run after a basemap failure`)
  }
  assert.match(applySnapshotBody, /imageryLayers\.forEach\(\(layer, id\) => \{ layer\.show = id === imageryKey \}\)/)

  const prepareBody = sliceBetween(offscreenSource, 'async function prepare(', 'async function play(')
  assert.match(prepareBody, /failedImageryKeys\.clear\(\)/)
  assert.match(prepareBody, /terrainLighting = script\.terrain\.lighting/)
})

test('the recorded film matches the visible window lighting rule', () => {
  assert.match(offscreenSource, /let terrainLighting = false/)
  assert.match(offscreenSource, /terrainLighting = script\.terrain\.lighting/)
  assert.match(offscreenSource, /viewer\.scene\.globe\.enableLighting = terrainLighting \|\| snapshot\.simTime !== null/)

  const applyTerrainBody = sliceBetween(offscreenSource, 'async function applyTerrain(', 'function reportProgress(')
  assert.match(applyTerrainBody, /viewer\.scene\.globe\.enableLighting = terrainLighting\r?\n\s+viewer\.scene\.requestRender\(\)/)

  assert.match(viewerSource, /currentViewer\.scene\.globe\.enableLighting = store\.terrainLighting \|\| solarStore\.active/)
  assert.match(mainSource, /lighting: value\.lighting === true/)
})
