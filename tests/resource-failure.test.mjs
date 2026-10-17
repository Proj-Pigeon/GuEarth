import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeResourceFailure, isRequestErrorShape, requestErrorRejectionLabel } from '../src/common/resourceFailure.ts'
import { serveTileResponse, TILE_FAILURE_STATUS, tileFailureResponse } from '../src/common/tileProtocol.ts'

test('the resource rejection label matches the Sentry message reported for a Cesium request error', () => {
  assert.equal(requestErrorRejectionLabel(), 'Object captured as promise rejection with keys: response, responseHeaders, statusCode')
})

test('a Cesium request error is recognized whatever order its properties were created in', () => {
  const shapes = [
    { statusCode: 502, response: {}, responseHeaders: {} },
    { response: {}, responseHeaders: {}, statusCode: 502 },
    { statusCode: undefined, response: undefined, responseHeaders: undefined }
  ]
  for (const shape of shapes) assert.equal(isRequestErrorShape(shape), true)
})

test('ordinary errors, arrays, incomplete and overloaded objects, and primitives are not request errors', () => {
  const values = [
    new Error('boom'),
    [],
    { statusCode: 502 },
    { response: {}, responseHeaders: {} },
    { statusCode: 502, response: {}, responseHeaders: {}, extra: true },
    { message: 'failed', statusCode: 502, response: {}, responseHeaders: {} },
    null,
    undefined,
    'net::ERR_CONNECTION_REFUSED',
    502
  ]
  for (const value of values) {
    assert.equal(isRequestErrorShape(value), false, `${String(value)} must not look like a request error`)
    assert.equal(describeResourceFailure(value), null)
  }
})

test('request error rejections degrade into readable status text instead of an opaque object', () => {
  assert.equal(describeResourceFailure({ statusCode: 502, response: {}, responseHeaders: {} }), '地图资源请求失败（HTTP 502）')
  assert.equal(describeResourceFailure({ statusCode: 404, response: {}, responseHeaders: {} }), '地图资源请求失败（HTTP 404）')
  assert.equal(describeResourceFailure({ statusCode: undefined, response: undefined, responseHeaders: undefined }), '地图资源请求失败（网络中断或请求被拒绝）')
  assert.equal(describeResourceFailure({ statusCode: Number.NaN, response: {}, responseHeaders: {} }), '地图资源请求失败（网络中断或请求被拒绝）')
})

test('a throwing tile pipeline settles into a 502 response so the protocol handler never rejects', async () => {
  const failures = []
  const response = await serveTileResponse(
    async () => {
      throw new Error('nativeImage decode failed')
    },
    (error) => failures.push(error)
  )
  assert.equal(response.status, TILE_FAILURE_STATUS)
  assert.equal(await response.text(), 'Tile unavailable')
  assert.equal(failures.length, 1)
  assert.equal(failures[0].message, 'nativeImage decode failed')
})

test('a synchronously throwing tile pipeline also settles into a response', async () => {
  const response = await serveTileResponse(() => {
    throw new TypeError('bad tile key')
  })
  assert.equal(response.status, TILE_FAILURE_STATUS)
})

test('a healthy tile response passes through untouched and skips the failure hook', async () => {
  const original = new Response('tile-bytes', { status: 200, headers: { 'content-type': 'image/png' } })
  let reported = false
  const response = await serveTileResponse(
    () => original,
    () => {
      reported = true
    }
  )
  assert.equal(response, original)
  assert.equal(await response.text(), 'tile-bytes')
  assert.equal(reported, false)
})

test('the fallback response is a client-visible 502 tile body', async () => {
  const response = tileFailureResponse()
  assert.equal(response.status, TILE_FAILURE_STATUS)
  assert.equal(await response.text(), 'Tile unavailable')
})
