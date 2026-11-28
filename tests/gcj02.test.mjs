import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { test } from 'vite-plus/test'

import { gcj02ToWgs84, outsideChina, wgs84ToGcj02 } from '../src/main/geo/gcj02.ts'

const citiesGcj02 = [
  { name: '北京', lon: 116.4074, lat: 39.9042 },
  { name: '广州', lon: 113.2644, lat: 23.1291 },
  { name: '上海', lon: 121.4737, lat: 31.2304 },
  { name: '成都', lon: 104.0665, lat: 30.5723 },
  { name: '乌鲁木齐', lon: 87.6177, lat: 43.7928 },
  { name: '黑河', lon: 127.5285, lat: 50.2452 }
]

function metersBetween(lonA, latA, lonB, latB) {
  const latMid = (((latA + latB) / 2) * Math.PI) / 180
  const dx = (lonB - lonA) * 111_320 * Math.cos(latMid)
  const dy = (latB - latA) * 110_540
  return Math.hypot(dx, dy)
}

test('gcj02 to wgs84 shifts points by a few hundred meters inside China', () => {
  for (const city of citiesGcj02) {
    const [wgsLon, wgsLat] = gcj02ToWgs84(city.lon, city.lat)
    const distance = metersBetween(city.lon, city.lat, wgsLon, wgsLat)
    assert.ok(
      distance > 100 && distance < 900,
      `${city.name} offset ${distance.toFixed(0)}m in 100–900m band`
    )
  }
})

test('gcj02 offset matches the published algorithm at reference points', () => {
  const referencePoints = [
    { name: '北京', lon: 116.404, lat: 39.915, gcjLon: 116.41024, gcjLat: 39.9164 },
    { name: '上海', lon: 121.4737, lat: 31.2304, gcjLon: 121.47822, gcjLat: 31.22846 }
  ]
  for (const point of referencePoints) {
    const [gcjLon, gcjLat] = wgs84ToGcj02(point.lon, point.lat)
    assert.ok(
      Math.abs(gcjLon - point.gcjLon) < 1e-4,
      `${point.name} gcj lon ${gcjLon.toFixed(5)} off ${point.gcjLon}`
    )
    assert.ok(
      Math.abs(gcjLat - point.gcjLat) < 1e-4,
      `${point.name} gcj lat ${gcjLat.toFixed(5)} off ${point.gcjLat}`
    )
  }
})

test('gcj02 to wgs84 recovers the original point through the forward transform', () => {
  for (const city of citiesGcj02) {
    const [gcjLon, gcjLat] = wgs84ToGcj02(city.lon, city.lat)
    const [wgsLon, wgsLat] = gcj02ToWgs84(gcjLon, gcjLat)
    assert.ok(
      Math.abs(wgsLon - city.lon) < 1e-6,
      `${city.name} lon roundtrip ${Math.abs(wgsLon - city.lon)}`
    )
    assert.ok(
      Math.abs(wgsLat - city.lat) < 1e-6,
      `${city.name} lat roundtrip ${Math.abs(wgsLat - city.lat)}`
    )
  }
})

test('gcj02 to wgs84 is a no-op outside the China bounding box', () => {
  for (const [lon, lat] of [
    [0, 0],
    [140, 60],
    [-120, 45],
    [110, -20]
  ]) {
    assert.deepEqual(gcj02ToWgs84(lon, lat), [lon, lat])
    assert.deepEqual(wgs84ToGcj02(lon, lat), [lon, lat])
    assert.equal(outsideChina(lon, lat), true)
  }
  assert.equal(outsideChina(116.4, 39.9), false)
})

test('converted province ring samples stay within China bounds', () => {
  const geo = JSON.parse(
    readFileSync(new URL('../resources/geo/china-provinces.geojson', import.meta.url), 'utf8')
  )
  assert.equal(geo.type, 'FeatureCollection')
  for (const feature of geo.features) {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          const [wgsLon, wgsLat] = gcj02ToWgs84(lon, lat)
          assert.ok(
            wgsLon > 70 && wgsLon < 140,
            `${feature.properties.name} ring lon ${wgsLon.toFixed(3)} in bounds`
          )
          assert.ok(
            wgsLat > 1 && wgsLat < 56,
            `${feature.properties.name} ring lat ${wgsLat.toFixed(3)} in bounds`
          )
        }
      }
    }
  }
})
