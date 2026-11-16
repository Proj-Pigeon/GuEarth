import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'
import {
  clampStopIndex,
  mergeFlightStops,
  resolveStopTarget,
  type FlightStop,
  type StopSwitchRequest
} from '../../../common/flightStops'

export type FlyToExecutor = (longitude: number, latitude: number, height: number) => Promise<number | undefined>

function plainStop(stop: FlightStop): FlightStop {
  const raw = toRaw(stop)
  return raw.note ? { id: raw.id, name: raw.name, longitude: raw.longitude, latitude: raw.latitude, height: raw.height, note: raw.note } : { id: raw.id, name: raw.name, longitude: raw.longitude, latitude: raw.latitude, height: raw.height }
}

export const useFlightStopsStore = defineStore('flightStops', () => {
  const stops = ref<FlightStop[]>([])
  const activeIndex = ref(0)
  const turnToken = ref('')
  const isNavigating = ref(false)
  let switchSeq = 0

  const total = computed(() => stops.value.length)
  const currentStop = computed(() => {
    const stop = stops.value[activeIndex.value]
    return stop ? plainStop(stop) : null
  })
  const visible = computed(() => stops.value.length >= 2)
  const canPrev = computed(() => activeIndex.value > 0)
  const canNext = computed(() => activeIndex.value < stops.value.length - 1)

  function beginTurnStops(token: string, items: FlightStop[]): FlightStop | undefined {
    turnToken.value = token
    stops.value = mergeFlightStops([], items)
    activeIndex.value = 0
    return stops.value[0] ? plainStop(stops.value[0]) : undefined
  }

  function appendTurnStops(token: string, items: FlightStop[]): { added: FlightStop[]; total: number } {
    if (token && turnToken.value !== token) {
      const first = beginTurnStops(token, items)
      return { added: first ? stops.value.map(plainStop) : [], total: stops.value.length }
    }
    const previousLength = stops.value.length
    stops.value = mergeFlightStops(stops.value, items)
    return {
      added: stops.value.slice(previousLength).map(plainStop),
      total: stops.value.length
    }
  }

  async function goTo(index: number, flyFn: FlyToExecutor): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
    if (!stops.value.length) return { error: '当前没有可切换的飞行地点列表' }
    const targetIndex = clampStopIndex(index, stops.value.length)
    const target = plainStop(stops.value[targetIndex])
    activeIndex.value = targetIndex
    const seq = ++switchSeq
    isNavigating.value = true
    try {
      const actualHeight = await flyFn(target.longitude, target.latitude, target.height)
      if (seq !== switchSeq) return { error: '切换已取消' }
      if (actualHeight === undefined) return { error: '飞行已取消' }
      return { stop: target, actualHeight }
    } finally {
      if (seq === switchSeq) isNavigating.value = false
    }
  }

  async function switchByRequest(request: StopSwitchRequest, flyFn: FlyToExecutor): Promise<{ stop?: FlightStop; index?: number; total: number; actualHeight?: number; error?: string }> {
    const resolved = resolveStopTarget(stops.value, activeIndex.value, request)
    if (resolved.error || resolved.index === undefined) {
      return { error: resolved.error ?? '无法切换飞行地点', total: stops.value.length }
    }
    const result = await goTo(resolved.index, flyFn)
    if (result.error || !result.stop) {
      return { error: result.error ?? '飞行已取消', total: stops.value.length }
    }
    return {
      stop: result.stop,
      index: resolved.index,
      total: stops.value.length,
      actualHeight: result.actualHeight
    }
  }

  async function prev(flyFn: FlyToExecutor): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
    if (!canPrev.value) return { error: '已经是第一个地点' }
    return goTo(activeIndex.value - 1, flyFn)
  }

  async function next(flyFn: FlyToExecutor): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
    if (!canNext.value) return { error: '已经是最后一个地点' }
    return goTo(activeIndex.value + 1, flyFn)
  }

  function clear(): void {
    switchSeq += 1
    stops.value = []
    activeIndex.value = 0
    turnToken.value = ''
    isNavigating.value = false
  }

  return {
    stops,
    activeIndex,
    turnToken,
    isNavigating,
    total,
    currentStop,
    visible,
    canPrev,
    canNext,
    beginTurnStops,
    appendTurnStops,
    goTo,
    switchByRequest,
    prev,
    next,
    clear
  }
})
