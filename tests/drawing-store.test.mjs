import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { createPinia, setActivePinia } from 'pinia'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) return nextResolve(pathToFileURL(resolve('src/renderer/src', `${specifier.slice(10)}.ts`)).href, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { useDrawingStore, DEFAULT_DRAW_STYLE } = await import('../src/renderer/src/stores/drawing.ts')
const { transientMirrorShape } = await import('../src/renderer/src/lib/shapeGraphics.ts')

function shapeFixture(id, changes = {}) {
  return { ...DEFAULT_DRAW_STYLE, id, kind: 'point', positions: [{ longitude: 116, latitude: 39, height: 0 }], annotation: id, createdAt: 1, ...changes }
}

function storeFixture(t) {
  setActivePinia(createPinia())
  const saved = []
  globalThis.window = { guEarth: { annotations: { save: async (document) => { saved.push(document) } } } }
  t.after(() => { delete globalThis.window })
  return { store: useDrawingStore(), saved }
}

const flushSave = () => sleep(220)

test('persistence stores drawn shapes but never transient mirror shapes', async (t) => {
  const { store, saved } = storeFixture(t)
  store.addShape(shapeFixture('drawn'))
  await flushSave()
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0].shapes.map((shape) => shape.id), ['drawn'])
  assert.deepEqual(saved[0].entries, [{ type: 'shape', id: 'drawn' }])

  store.addTransientShape(shapeFixture('mirror'))
  await flushSave()
  assert.equal(saved.length, 1, '临时镜像图形不应触发新的保存')

  store.removeShape('mirror')
  await flushSave()
  assert.equal(saved.length, 1, '移除临时图形不应触发新的保存')
  assert.deepEqual(store.shapes.map((shape) => shape.id), ['drawn'])
  assert.deepEqual(store.entries.map((entry) => entry.id), ['drawn'])
})

test('removing shapes touches exactly the matching annotation entry', async (t) => {
  const { store, saved } = storeFixture(t)
  store.addShape(shapeFixture('first'))
  store.addShape(shapeFixture('second'))
  await flushSave()
  store.removeShape('first')
  await flushSave()
  assert.deepEqual(store.entries.map((entry) => entry.id), ['second'])
  assert.deepEqual(saved[saved.length - 1].shapes.map((shape) => shape.id), ['second'])
  assert.deepEqual(saved[saved.length - 1].entries.map((entry) => entry.id), ['second'])

  store.addTransientShape(shapeFixture('mirror'))
  const entriesBefore = store.entries.map((entry) => entry.id)
  store.removeShape('mirror')
  await flushSave()
  assert.deepEqual(store.entries.map((entry) => entry.id), entriesBefore)
})

test('transient mirror shapes keep the recording annotation style over the defaults', () => {
  const style = { color: '#fa541c', textColor: '#ffffff', fontFamily: 'Microsoft YaHei', fontSize: 18, textFrame: true, lineWidth: 6 }
  const shaped = transientMirrorShape({ ...shapeFixture('mirror'), ...style })
  assert.equal(shaped.color, '#fa541c')
  assert.equal(shaped.textColor, '#ffffff')
  assert.equal(shaped.fontFamily, 'Microsoft YaHei')
  assert.equal(shaped.fontSize, 18)
  assert.equal(shaped.textFrame, true)
  assert.equal(shaped.lineWidth, 6)
  const blank = transientMirrorShape({ ...shapeFixture('blank'), color: '', fontSize: 0, lineWidth: 0, textFrame: undefined })
  assert.equal(blank.color, DEFAULT_DRAW_STYLE.color)
  assert.equal(blank.fontSize, DEFAULT_DRAW_STYLE.fontSize)
  assert.equal(blank.lineWidth, DEFAULT_DRAW_STYLE.lineWidth)
  assert.equal(blank.textFrame, false)
})
