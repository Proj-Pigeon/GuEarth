import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const offscreenHtml = await readFile(new URL('../src/renderer/offscreen.html', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')

test('offscreen recording has an isolated Cesium entry', () => {
  assert.match(viteSource, /offscreen: resolve\('src\/renderer\/offscreen\.html'\)/)
  assert.match(offscreenHtml, /src="\/src\/offscreen\.ts"/)
  assert.match(offscreenSource, /requestRenderMode: false/)
})

test('offscreen recording requests a fixed paint rate and counts frames', () => {
  assert.match(mainSource, /offscreen: true/)
  assert.match(mainSource, /window\.webContents\.setFrameRate\(30\)/)
  assert.match(mainSource, /window\.webContents\.on\('paint'/)
})

test('offscreen recording controls stay behind typed preload IPC', () => {
  assert.match(preloadSource, /offscreenProbe: \(\): Promise<\{ fps: number; frames: number \}>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-probe'\)/)
})
