import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CustomDataSource, JulianDate, PolylineDashMaterialProperty } from 'cesium'
import { buildLiveTyphoons } from '../src/renderer/src/thematic/liveTyphoons.ts'

const observation = { time: '2026-10-30T00:00:00Z', longitude: 130, latitude: 20, type: 'TY', pressure: 970, windSpeed: 35 }
const previous = { ...observation, time: '2026-10-29T18:00:00Z', longitude: 132, latitude: 18 }
const forecast = { ...observation, time: '2026-10-30T12:00:00Z', longitude: 127, latitude: 22 }
const storm = { id: 'NP_TEST', name: '测试台风', active: true, now: observation, track: [previous], forecast: [forecast], forecastError: '' }
const feed = (storms) => ({ fetchedAt: Date.parse('2026-10-30T00:10:00Z'), storms, sources: ['QWeather'], license: ['test'] })
const time = JulianDate.now()

test('live storms distinguish observed paths, forecasts, current centers and cached metadata', () => {
  const source = new CustomDataSource('typhoon')
  buildLiveTyphoons(source, feed([storm]), true)
  const entities = source.entities.values
  const paths = entities.filter((entity) => entity.polyline)
  assert.equal(paths.length, 2)
  assert.equal(paths.filter((entity) => entity.polyline.material instanceof PolylineDashMaterialProperty).length, 1)
  assert.equal(entities.filter((entity) => entity.label).length, 1)
  const center = entities.find((entity) => entity.label)
  assert.match(center.label.text.getValue(time), /测试台风/)
  assert.match(center.label.text.getValue(time), /缓存/)
  assert.equal(center.properties.cached.getValue(time), true)
  assert.match(center.properties.summary.getValue(time), /970 hPa/)
  assert.match(center.properties.summary.getValue(time), /最新中心/)
})

test('ended storms never show a current center or forecast even if an API retains now', () => {
  for (const now of [null, observation]) {
    const source = new CustomDataSource('typhoon')
    buildLiveTyphoons(source, feed([{ ...storm, now, active: false }]), false)
    assert.equal(source.entities.values.filter((entity) => entity.label).length, 0)
    assert.equal(source.entities.values.filter((entity) => entity.polyline?.material instanceof PolylineDashMaterialProperty).length, 0)
  }
})

test('empty feeds do not manufacture history, forecast dates must be after current observations', () => {
  const empty = new CustomDataSource('typhoon')
  buildLiveTyphoons(empty, feed([]), false)
  assert.equal(empty.entities.values.length, 0)
  const source = new CustomDataSource('typhoon')
  buildLiveTyphoons(source, feed([{ ...storm, forecast: [previous, observation] }]), false)
  assert.equal(source.entities.values.filter((entity) => entity.polyline?.material instanceof PolylineDashMaterialProperty).length, 0)
})
