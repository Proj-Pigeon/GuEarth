import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const {
  DEFAULT_FLIGHT_HEIGHT,
  MAX_FLIGHT_STOPS,
  createTurnFlightGuard,
  evaluateFlightToolGuard,
  hasExplicitStopSwitchIntent,
  parseFlyToArgs,
  resolveStopTarget
} = await import('../src/common/flightStops.ts')
const { useFlightStopsStore } = await import('../src/renderer/src/stores/flightStops.ts')

test('parseFlyToArgs validates single and batch locations with deduplication and cap', () => {
  const single = parseFlyToArgs({ name: '桂林喀斯特', longitude: 110.29, latitude: 25.27 })
  assert.equal(single.isBatch, false)
  assert.equal(single.stops.length, 1)
  assert.equal(single.stops[0].name, '桂林喀斯特')
  assert.equal(single.stops[0].height, DEFAULT_FLIGHT_HEIGHT)

  const invalid = parseFlyToArgs({ longitude: 200, latitude: 25 })
  assert.match(invalid.error ?? '', /坐标无效/)

  const batch = parseFlyToArgs({
    locations: [
      { name: '张掖丹霞', longitude: 100.06, latitude: 38.92, height: 18000, note: '彩丘与单斜山' },
      { name: '张掖重复点', longitude: 100.06001, latitude: 38.92001, height: 18000 },
      { name: '广东丹霞山', longitude: 113.75, latitude: 25.03, height: 15000 }
    ]
  })
  assert.equal(batch.isBatch, true)
  assert.equal(batch.stops.length, 2)
  assert.equal(batch.stops[0].name, '张掖丹霞')
  assert.equal(batch.stops[0].note, '彩丘与单斜山')
  assert.equal(batch.stops[1].name, '广东丹霞山')

  const oversized = parseFlyToArgs({
    locations: Array.from({ length: MAX_FLIGHT_STOPS + 4 }, (_, index) => ({
      name: `点${index + 1}`,
      longitude: 100 + index * 0.5,
      latitude: 30
    }))
  })
  assert.equal(oversized.stops.length, MAX_FLIGHT_STOPS)
})

test('useFlightStopsStore starts at first stop, queues same-turn additions, and switches only on request', async () => {
  setActivePinia(createPinia())
  const store = useFlightStopsStore()
  const flights = []
  const flyFn = async (longitude, latitude, height) => {
    flights.push({ longitude, latitude, height })
    return height
  }

  const singleFirst = store.beginTurnStops('turn-1', [
    { id: '0', name: '故宫', longitude: 116.397, latitude: 39.918, height: 8000 }
  ])
  assert.equal(singleFirst?.name, '故宫')
  assert.equal(store.visible, false)

  const batchFirst = store.beginTurnStops('turn-2', [
    { id: '0', name: '路南石林', longitude: 103.32, latitude: 24.81, height: 12000 },
    { id: '1', name: '桂林峰林', longitude: 110.29, latitude: 25.27, height: 15000 }
  ])
  assert.equal(batchFirst?.name, '路南石林')
  assert.equal(store.activeIndex, 0)
  assert.equal(store.visible, true)

  const queued = store.appendTurnStops('turn-2', [
    { id: '2', name: '兴文石海', longitude: 105.08, latitude: 28.18, height: 14000 }
  ])
  assert.equal(queued.total, 3)
  assert.equal(store.activeIndex, 0)
  assert.equal(store.canPrev, false)
  assert.equal(store.canNext, true)
  assert.equal(flights.length, 0)

  const prevAtStart = await store.prev(flyFn)
  assert.match(prevAtStart.error ?? '', /第一个地点/)

  const nextOutcome = await store.next(flyFn)
  assert.equal(nextOutcome.stop?.name, '桂林峰林')
  assert.equal(store.activeIndex, 1)
  assert.equal(flights.length, 1)
  assert.deepEqual(flights[0], { longitude: 110.29, latitude: 25.27, height: 15000 })

  const byName = await store.switchByRequest({ action: 'goto', name: '兴文' }, flyFn)
  assert.equal(byName.index, 2)
  assert.equal(byName.stop?.name, '兴文石海')
  assert.equal(store.activeIndex, 2)
  assert.equal(store.canNext, false)

  const byIndex = await store.switchByRequest({ action: 'goto', index: 1 }, flyFn)
  assert.equal(byIndex.index, 0)
  assert.equal(byIndex.stop?.name, '路南石林')

  store.clear()
  assert.equal(store.total, 0)
  assert.equal(store.visible, false)
})

test('resolveStopTarget handles invalid indexes and missing names cleanly', () => {
  const stops = [
    { id: '0', name: '博格达峰', longitude: 88.33, latitude: 43.8, height: 20000 },
    { id: '1', name: '慕士塔格峰', longitude: 75.12, latitude: 38.28, height: 22000 }
  ]
  assert.match(resolveStopTarget(stops, 1, { action: 'next' }).error ?? '', /最后一个/)
  assert.match(resolveStopTarget(stops, 0, { action: 'goto', index: 5 }).error ?? '', /超出范围|无效/)
  assert.match(resolveStopTarget(stops, 0, { action: 'goto', name: '黄山' }).error ?? '', /未在当前/)
  assert.equal(resolveStopTarget(stops, 0, { action: 'goto', name: '慕士塔格' }).index, 1)
})

test('turn flight guard blocks consecutive camera moves and unrequested stop switching', () => {
  const createGuard = createTurnFlightGuard('s1:1', '帮我找几个典型的喀斯特地貌')
  assert.equal(createGuard.userRequestedSwitch, false)

  const firstFly = evaluateFlightToolGuard(createGuard, 'fly_to', { name: '路南石林', longitude: 103.32, latitude: 24.81 })
  assert.equal(firstFly.allow, true)
  assert.equal(firstFly.flightMode, 'initial')
  assert.equal(firstFly.dispatchArgs.__turnToken, 's1:1')
  createGuard.flewInTurn = true

  const secondFly = evaluateFlightToolGuard(createGuard, 'fly_to', { name: '桂林峰林', longitude: 110.29, latitude: 25.27 })
  assert.equal(secondFly.allow, true)
  assert.equal(secondFly.flightMode, 'queue')

  const sameTurnSwitch = evaluateFlightToolGuard(createGuard, 'switch_flight_stop', { action: 'next' })
  assert.equal(sameTurnSwitch.allow, false)
  assert.match(sameTurnSwitch.error ?? '', /禁止切换/)

  const followupGuard = createTurnFlightGuard('s1:2', '第一个地点是如何形成的？')
  const unrequestedSwitch = evaluateFlightToolGuard(followupGuard, 'switch_flight_stop', { action: 'next' })
  assert.equal(unrequestedSwitch.allow, false)
  assert.match(unrequestedSwitch.error ?? '', /未在当前消息中明确要求/)

  for (const prompt of ['带我看下一个地点', '切换到第 3 个', '飞到广东丹霞山', '回到上一个']) {
    assert.equal(hasExplicitStopSwitchIntent(prompt), true)
    const allowedGuard = createTurnFlightGuard('s1:3', prompt)
    assert.equal(evaluateFlightToolGuard(allowedGuard, 'switch_flight_stop', { action: 'next' }).allow, true)
  }

  for (const prompt of ['第二个地点有什么特点？', '这两个地方哪个降水多', '解释一下成因']) {
    assert.equal(hasExplicitStopSwitchIntent(prompt), false)
  }
})
