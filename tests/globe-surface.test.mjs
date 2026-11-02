import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  BUFFER_MISSING_REPORT_MS,
  RENDER_FAULT_LIMIT,
  SURFACE_UNAVAILABLE_DETAIL,
  SURFACE_UNAVAILABLE_MESSAGE,
  WEBGL_CONTEXT_ATTEMPTS,
  WEBGL_RETRY_STAGE,
  WEBGL_UNAVAILABLE_DETAIL,
  WEBGL_UNAVAILABLE_MESSAGE,
  advanceBufferGap,
  backingStoreSize,
  classifyRenderFault,
  contextOptionsForAttempt,
  decideRenderFrame,
  glRendererName,
  isWebGlInitializationError,
  isZeroFramebufferError,
  nudgedCanvasSize,
  shouldStopRenderLoop,
  shouldUseSoftwareMsaaWorkaround,
  surfaceFailureAlreadyShown,
  surfaceFailureCopy,
  surfaceIsRenderable,
  webGlRetryDelayMs
} from '../src/common/globeSurface.ts'

const sized = { clientWidth: 1440, clientHeight: 900, drawingBufferWidth: 1440, drawingBufferHeight: 900 }
const minimized = { clientWidth: 0, clientHeight: 0, drawingBufferWidth: 0, drawingBufferHeight: 0 }
const missingBuffer = { clientWidth: 1440, clientHeight: 900, drawingBufferWidth: 0, drawingBufferHeight: 0 }

test('a positive layout with a zero drawing buffer is not renderable', () => {
  assert.equal(surfaceIsRenderable(sized), true)
  assert.equal(surfaceIsRenderable(minimized), false)
  assert.equal(surfaceIsRenderable(missingBuffer), false)
  assert.equal(surfaceIsRenderable({ clientWidth: 800, clientHeight: 0, drawingBufferWidth: 800, drawingBufferHeight: 600 }), false)
})

test('hidden or not-yet-laid-out views skip rendering without trying to resize', () => {
  assert.deepEqual(decideRenderFrame(minimized, false), { action: 'tick', reason: 'awaiting-layout' })
  assert.deepEqual(decideRenderFrame({ clientWidth: 0, clientHeight: 900, drawingBufferWidth: 100, drawingBufferHeight: 100 }, false), { action: 'tick', reason: 'awaiting-layout' })
})

test('a zero drawing buffer forces one resize, then waits instead of creating a framebuffer', () => {
  assert.deepEqual(decideRenderFrame(missingBuffer, false), { action: 'recover-resize' })
  assert.deepEqual(decideRenderFrame(missingBuffer, true), { action: 'tick', reason: 'buffer-missing' })
  assert.deepEqual(decideRenderFrame(sized, true), { action: 'render' })
})

test('a zero-size framebuffer error is the Cesium DeveloperError seen after terrain fallback', () => {
  const error = new Error('Expected width to be greater than 0, actual value was 0')
  error.name = 'DeveloperError'
  assert.equal(isZeroFramebufferError(error), true)
  assert.equal(isZeroFramebufferError(new Error('Expected height to be greater than 0, actual value was 0')), true)
  assert.equal(isZeroFramebufferError(new Error('Shader failed to compile')), false)
  assert.equal(classifyRenderFault(error, false), 'recover')
  assert.equal(classifyRenderFault(new Error('Fragment shader compile error'), false), 'report')
  assert.equal(classifyRenderFault(new Error('Fragment shader compile error'), true), 'recover')
})

test('WebGL init failure matches Cesium rejecting getContext after a GPU process crash', () => {
  const error = new Error('The browser supports WebGL, but initialization failed.')
  error.name = 'RuntimeError'
  assert.equal(isWebGlInitializationError(error), true)
  assert.equal(isWebGlInitializationError(new Error('The browser does not support WebGL.  Visit http://get.webgl.org.')), true)
  assert.equal(isWebGlInitializationError(new Error('Expected width to be greater than 0, actual value was 0')), false)
})

test('repeated recoverable render faults stop the loop, a single one does not', () => {
  assert.equal(shouldStopRenderLoop('recover', 1), false)
  assert.equal(shouldStopRenderLoop('recover', RENDER_FAULT_LIMIT - 1), false)
  assert.equal(shouldStopRenderLoop('recover', RENDER_FAULT_LIMIT), true)
  assert.equal(shouldStopRenderLoop('report', 1), true)
})

test('a missing drawing buffer is reported once after the layout stays visible', () => {
  const state = { since: 0, reported: false }
  assert.equal(advanceBufferGap(state, 'buffer-missing', 1_000, BUFFER_MISSING_REPORT_MS), 'waiting')
  assert.equal(advanceBufferGap(state, 'buffer-missing', 1_000 + BUFFER_MISSING_REPORT_MS - 1, BUFFER_MISSING_REPORT_MS), 'waiting')
  assert.equal(advanceBufferGap(state, 'awaiting-layout', 5_000, BUFFER_MISSING_REPORT_MS), 'ok')
  assert.equal(state.since, 0)
  assert.equal(advanceBufferGap(state, 'buffer-missing', 9_000, BUFFER_MISSING_REPORT_MS), 'waiting')
  assert.equal(advanceBufferGap(state, 'buffer-missing', 9_000 + BUFFER_MISSING_REPORT_MS, BUFFER_MISSING_REPORT_MS), 'report')
  assert.equal(advanceBufferGap(state, 'buffer-missing', 20_000, BUFFER_MISSING_REPORT_MS), 'waiting')
  assert.equal(advanceBufferGap(state, 'rendered', 21_000, BUFFER_MISSING_REPORT_MS), 'ok')
  assert.equal(state.reported, false)
})

test('context attempts keep the screenshot buffer first, then relax WebGL version and attributes', () => {
  assert.equal(WEBGL_CONTEXT_ATTEMPTS.length, 4)
  assert.deepEqual(contextOptionsForAttempt(WEBGL_CONTEXT_ATTEMPTS[0]), {
    webgl: { preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }
  })
  assert.equal(contextOptionsForAttempt(WEBGL_CONTEXT_ATTEMPTS[0]).requestWebgl1, undefined)
  const fallback = contextOptionsForAttempt(WEBGL_CONTEXT_ATTEMPTS[3])
  assert.equal(fallback.requestWebgl1, true)
  assert.equal(fallback.webgl.preserveDrawingBuffer, false)
  assert.equal(fallback.webgl.antialias, false)
  assert.equal(fallback.webgl.powerPreference, 'low-power')
  assert.deepEqual(WEBGL_CONTEXT_ATTEMPTS.map((_, index) => webGlRetryDelayMs(index)), [0, 700, 1800, 4000])
  assert.equal(webGlRetryDelayMs(99), 4000)
})

test('software renderers are recognized from the Basic Render Driver string', () => {
  assert.equal(shouldUseSoftwareMsaaWorkaround('Microsoft Basic Render Driver'), true)
  assert.equal(shouldUseSoftwareMsaaWorkaround('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)'), true)
  assert.equal(shouldUseSoftwareMsaaWorkaround('Google SwiftShader'), true)
  assert.equal(shouldUseSoftwareMsaaWorkaround('llvmpipe (LLVM 15.0.7, 256 bits)'), true)
  assert.equal(shouldUseSoftwareMsaaWorkaround('NVIDIA GeForce RTX 3070 Laptop GPU'), false)
  const gl = {
    RENDERER: 0x1f01,
    getExtension(name) {
      assert.equal(name, 'WEBGL_debug_renderer_info')
      return { UNMASKED_RENDERER_WEBGL: 0x9246 }
    },
    getParameter(parameter) {
      assert.equal(parameter, 0x9246)
      return 'Microsoft Basic Render Driver'
    }
  }
  assert.equal(glRendererName(gl), 'Microsoft Basic Render Driver')
  assert.equal(glRendererName(null), '')
})

test('canvas backing stores are nudged only when Cesium would assign the same size', () => {
  assert.deepEqual(backingStoreSize(1440, 900, 1, 1), { width: 1440, height: 900 })
  assert.deepEqual(backingStoreSize(1440, 900, 1, 0.5), { width: 720, height: 450 })
  assert.deepEqual(nudgedCanvasSize(1440, 900, 1440, 900), { width: 1441, height: 900 })
  assert.deepEqual(nudgedCanvasSize(300, 150, 1440, 900), { width: 1440, height: 900 })
})

test('the globe viewer keeps rendering ownership and surfaces WebGL failure in Chinese', async () => {
  const viewerSource = await readFile(new URL('../src/renderer/src/composables/useCesiumViewer.ts', import.meta.url), 'utf8')
  const appSource = await readFile(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')
  const mainSource = await readFile(new URL('../src/renderer/src/main.ts', import.meta.url), 'utf8')
  assert.match(viewerSource, /useDefaultRenderLoop: false/)
  assert.match(viewerSource, /showRenderLoopErrors: false/)
  assert.match(viewerSource, /webglcontextlost/)
  const lostAt = viewerSource.indexOf('const onLost')
  const restoredAt = viewerSource.indexOf('const onRestored')
  const restoredEnd = viewerSource.indexOf("canvas.addEventListener('webglcontextrestored'")
  assert.ok(lostAt >= 0 && restoredAt > lostAt && restoredEnd > restoredAt)
  const lostHandler = viewerSource.slice(lostAt, restoredAt)
  const restoredHandler = viewerSource.slice(restoredAt, restoredEnd)
  assert.match(lostHandler, /webglContextLost = true/)
  assert.match(lostHandler, /preventDefault\(\)/)
  assert.match(restoredHandler, /bootstrapViewer\(\)/)
  assert.doesNotMatch(restoredHandler, /startOwnedRenderLoop|forceWidgetResize|requestRender/)
  assert.match(viewerSource, /surfaceFailureCopy\(webglContextLost\)/)
  assert.match(viewerSource, /decideRenderFrame\(/)
  assert.match(viewerSource, /createViewerWithRetries\(/)
  assert.match(viewerSource, /registerRetry\('webgl'/)
  assert.match(appSource, /globe-loading-hint/)
  assert.match(appSource, /failureStore\.notices\.webgl/)
  assert.match(mainSource, /surfaceFailureAlreadyShown\(event\.extra\)/)
})

test('a lost WebGL context uses the graphics-unavailable copy, a zero surface does not', () => {
  assert.deepEqual(surfaceFailureCopy(true), { message: WEBGL_UNAVAILABLE_MESSAGE, detail: WEBGL_UNAVAILABLE_DETAIL })
  assert.deepEqual(surfaceFailureCopy(false), { message: SURFACE_UNAVAILABLE_MESSAGE, detail: SURFACE_UNAVAILABLE_DETAIL })
  assert.match(WEBGL_UNAVAILABLE_DETAIL, /重试/)
  assert.match(SURFACE_UNAVAILABLE_DETAIL, /还原窗口/)
})

test('user-facing copy stays in Chinese and a shown surface failure does not open the crash dialog', () => {
  for (const text of [WEBGL_UNAVAILABLE_MESSAGE, WEBGL_UNAVAILABLE_DETAIL, SURFACE_UNAVAILABLE_MESSAGE, SURFACE_UNAVAILABLE_DETAIL, WEBGL_RETRY_STAGE]) {
    assert.match(text, /[\u4e00-\u9fff]/)
  }
  assert.match(WEBGL_UNAVAILABLE_DETAIL, /显卡驱动/)
  assert.match(SURFACE_UNAVAILABLE_DETAIL, /还原窗口/)
  assert.equal(surfaceFailureAlreadyShown({ surfaceNotified: true, rendererLogs: 'kept' }), true)
  assert.equal(surfaceFailureAlreadyShown({ surfaceNotified: false }), false)
  assert.equal(surfaceFailureAlreadyShown(undefined), false)
})
