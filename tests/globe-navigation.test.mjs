import assert from 'node:assert/strict'

import {
  Cartographic,
  EllipsoidTerrainProvider,
  GeographicTilingScheme,
  HeightmapTerrainData,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme
} from 'cesium'
import { test, vi } from 'vite-plus/test'

import { createBasemapImageryProvider } from '../src/renderer/src/composables/basemapImagery.ts'
import { resolveFlightDestination } from '../src/renderer/src/composables/terrainFlight.ts'

function createDeepTerrainTile() {
  const scheme = new WebMercatorTilingScheme()
  const level = 30
  const position = Cartographic.fromDegrees(86.925, 27.988)
  const coordinates = scheme.positionToTileXY(position, level)
  return {
    level,
    rectangle: scheme.tileXYToRectangle(coordinates.x, coordinates.y, level),
    data: { imagery: [] }
  }
}

const deepTerrain = {
  getLevelMaximumGeometricError: level => 40_075_016.68557849 / (256 * 2 ** (level + 1))
}

test('unbounded imagery reproduces the Everest rectangle crash in Cesium', () => {
  const layer = new ImageryLayer(
    new UrlTemplateImageryProvider({ url: 'https://example.test/{z}/{x}/{y}.png' })
  )
  assert.throws(
    () => layer._createTileImagerySkeletons(createDeepTerrainTile(), deepTerrain),
    /Expected rectangle to be typeof object, actual typeof was undefined/
  )
  layer.destroy()
})

for (const [id, style, maximumLevel] of [
  ['osm', 'standard', 19],
  ['esri-imagery', 'satellite', 23],
  ['opentopomap', 'topo', 17],
  ['baidu', 'road', 19]
]) {
  test(`${id} reuses supported imagery for terrain refinement near Everest`, () => {
    const layer = new ImageryLayer(createBasemapImageryProvider(id, style))
    const tile = createDeepTerrainTile()
    assert.equal(layer._createTileImagerySkeletons(tile, deepTerrain), true)
    assert.ok(tile.data.imagery.length > 0)
    for (const imagery of tile.data.imagery) {
      assert.equal(imagery.loadingImagery.level, maximumLevel)
      assert.ok(Object.values(imagery.textureCoordinateRectangle).every(Number.isFinite))
      imagery.freeResources()
    }
    layer.destroy()
  })
}

function terrainScene(requestTileGeometry, exaggeration = 1, relativeHeight = 0, fovy) {
  return {
    terrainProvider: {
      tilingScheme: new GeographicTilingScheme(),
      availability: { computeMaximumLevelAtPosition: () => 1 },
      requestTileGeometry
    },
    verticalExaggeration: exaggeration,
    verticalExaggerationRelativeHeight: relativeHeight,
    camera: typeof fovy === 'number' ? { frustum: { fovy } } : undefined
  }
}

const SUMMIT_LON = 86.925
const SUMMIT_LAT = 27.988
const EARTH_RADIUS_M = 6_378_137

function surfaceDistance(longitude, latitude) {
  const dx =
    (longitude - (SUMMIT_LON * Math.PI) / 180) *
    Math.cos((SUMMIT_LAT * Math.PI) / 180) *
    EARTH_RADIUS_M
  const dy = (latitude - (SUMMIT_LAT * Math.PI) / 180) * EARTH_RADIUS_M
  return Math.hypot(dx, dy)
}

function peakedHeight(longitude, latitude) {
  return 8849 - Math.min(4300, surfaceDistance(longitude, latitude) * 0.62)
}

function gentleHeight(longitude, latitude) {
  return 50 + (latitude - (SUMMIT_LAT * Math.PI) / 180) * EARTH_RADIUS_M * 0.004
}

function terrainData(heightAt) {
  return Promise.resolve({
    interpolateHeight: (_rectangle, longitude, latitude) => heightAt(longitude, latitude)
  })
}

function heightmap(height) {
  return Promise.resolve(
    new HeightmapTerrainData({ buffer: new Float64Array(4).fill(height), width: 2, height: 2 })
  )
}

async function flightHeight(scene, height = 5000, request) {
  const destination = await resolveFlightDestination(scene, SUMMIT_LON, SUMMIT_LAT, height, request)
  assert.ok(destination)
  const position = Cartographic.fromCartesian(destination)
  assert.ok(Math.abs(position.longitude - (SUMMIT_LON * Math.PI) / 180) < 1e-8)
  assert.ok(Math.abs(position.latitude - (SUMMIT_LAT * Math.PI) / 180) < 1e-8)
  return position.height
}

test('AI flight ends above the sampled Everest summit', async () => {
  assert.ok(Math.abs((await flightHeight(terrainScene(() => heightmap(8849)))) - 9849) < 1e-5)
})

test('AI flight clearance follows exaggerated terrain and its reference height', async () => {
  assert.ok(
    Math.abs((await flightHeight(terrainScene(() => heightmap(8849), 2, 100))) - 18_598) < 1e-5
  )
})

test('ordinary lowland flight preserves the requested height', async () => {
  assert.ok(Math.abs((await flightHeight(terrainScene(() => heightmap(50)))) - 5000) < 1e-5)
})

test('high altitude flight does not wait for terrain requests', async () => {
  let requests = 0
  const scene = terrainScene(() => {
    requests += 1
    return heightmap(8849)
  })
  assert.ok(Math.abs((await flightHeight(scene, 60_000)) - 60_000) < 1e-5)
  assert.equal(requests, 0)
})

test('unavailable terrain uses a conservative altitude instead of entering the mountain', async () => {
  const scene = terrainScene(() => Promise.reject(new Error('offline')))
  assert.ok(Math.abs((await flightHeight(scene)) - 10_000) < 1e-5)
})

test('non-finite terrain samples use the conservative altitude', async () => {
  assert.ok(
    Math.abs((await flightHeight(terrainScene(() => heightmap(Number.NaN)))) - 10_000) < 1e-5
  )
})

test('terrain lookup timeout still allows flight', async context => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  context.onTestFinished(() => vi.useRealTimers())
  const flight = flightHeight(terrainScene(() => new Promise(() => {})))
  vi.advanceTimersByTime(4000)
  assert.ok(Math.abs((await flight) - 10_000) < 1e-5)
})

test('ellipsoid terrain needs no network lookup', async () => {
  const scene = {
    terrainProvider: new EllipsoidTerrainProvider(),
    verticalExaggeration: 1,
    verticalExaggerationRelativeHeight: 0
  }
  assert.ok(Math.abs((await flightHeight(scene)) - 5000) < 1e-5)
})

test('sampled steep summit keeps clearance above the old 1000m skim', async () => {
  const scene = terrainScene(() => terrainData(peakedHeight))
  const height = await flightHeight(scene, 5000)
  assert.ok(Math.abs(height - 20_849) < 1e-3)
  assert.ok(height > 8849 + 1000)
})

test('sampled lowland point and city heights stay on the requested frame', async () => {
  const scene = terrainScene(() => terrainData(gentleHeight))
  assert.ok(Math.abs((await flightHeight(scene, 6000)) - 6000) < 1e-4)
  assert.ok(Math.abs((await flightHeight(scene, 2200)) - 2200) < 1e-4)
  const close = await flightHeight(scene, 800)
  assert.ok(close < 2000)
  assert.ok(close >= 50 + 1000)
})

test('broad flight does not sample or tighten a steep destination', async () => {
  let requests = 0
  const scene = terrainScene(() => {
    requests += 1
    return heightmap(8849)
  })
  assert.ok(Math.abs((await flightHeight(scene, 400_000)) - 400_000) < 1e-3)
  assert.equal(requests, 0)
})

test('flight above the framing ceiling does not wait for terrain', async () => {
  let requests = 0
  const scene = terrainScene(() => {
    requests += 1
    return heightmap(8849)
  })
  assert.ok(Math.abs((await flightHeight(scene, 25_000)) - 25_000) < 1e-3)
  assert.equal(requests, 0)
})

test('close flight still samples flat terrain before accepting the request', async () => {
  let requests = 0
  const scene = terrainScene(() => {
    requests += 1
    return heightmap(50)
  })
  assert.ok(Math.abs((await flightHeight(scene, 15_000)) - 15_000) < 1e-5)
  assert.equal(requests, 1)
})

test('invalid neighborhood samples do not zoom out past the center clearance', async () => {
  const scene = terrainScene(() =>
    terrainData((longitude, latitude) =>
      surfaceDistance(longitude, latitude) > 100 ? Number.NaN : 8849
    )
  )
  assert.ok(Math.abs((await flightHeight(scene, 4000)) - 9849) < 1e-4)
})

test('wider fov frames a moderate ridge lower than the default view', async () => {
  const medium = (longitude, latitude) => {
    const distance = surfaceDistance(longitude, latitude)
    if (distance < 3000) {
      return 2000 - distance * 0.35
    }
    return 2000 - 3000 * 0.35 - (distance - 3000) * 0.02
  }
  const nadir = await flightHeight(
    terrainScene(() => terrainData(medium)),
    2000
  )
  const wide = await flightHeight(
    terrainScene(() => terrainData(medium), 1, 0, Math.PI / 2),
    2000
  )
  assert.ok(nadir > 2000 + 1000)
  assert.ok(wide > 2000 + 1000)
  assert.ok(wide < nadir)
})

test('already cancelled flight does not sample terrain', async () => {
  let requests = 0
  const scene = terrainScene(() => {
    requests += 1
    return heightmap(8849)
  })
  assert.equal(
    await resolveFlightDestination(scene, SUMMIT_LON, SUMMIT_LAT, 5000, {
      isCancelled: () => true
    }),
    undefined
  )
  assert.equal(requests, 0)
})

test('cancelled flight does not adopt the timeout altitude', async context => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  context.onTestFinished(() => vi.useRealTimers())
  let cancelled = false
  const flight = resolveFlightDestination(
    terrainScene(() => new Promise(() => {})),
    SUMMIT_LON,
    SUMMIT_LAT,
    5000,
    { isCancelled: () => cancelled }
  )
  cancelled = true
  vi.advanceTimersByTime(4000)
  assert.equal(await flight, undefined)
})

test('late terrain does not revive a superseded flight', async () => {
  let resolveTile
  const pending = terrainScene(
    () =>
      new Promise(resolve => {
        resolveTile = resolve
      })
  )
  let cancelled = false
  const superseded = resolveFlightDestination(pending, SUMMIT_LON, SUMMIT_LAT, 5000, {
    isCancelled: () => cancelled
  })
  // oxlint-disable-next-line eslint/no-unmodified-loop-condition -- `resolveTile` is set by the stubbed request while the loop awaits
  for (let attempt = 0; attempt < 8 && !resolveTile; attempt += 1) {
    await Promise.resolve()
  }
  assert.equal(typeof resolveTile, 'function')
  cancelled = true
  resolveTile({ interpolateHeight: () => 8849 })
  assert.equal(await superseded, undefined)
  const current = await flightHeight(
    terrainScene(() => terrainData(peakedHeight)),
    5000
  )
  assert.ok(Math.abs(current - 20_849) < 1e-3)
})
