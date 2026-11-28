import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import { clampStopIndex, mergeFlightStops, resolveStopTarget } from '../../../common/flightStops'
import type { FlightStop, StopSwitchRequest } from '../../../common/flightStops'

export type FlyToExecutor = (
  longitude: number,
  latitude: number,
  height: number
) => Promise<number | undefined>

export interface FlightStopsState {
  stops: FlightStop[]
  activeIndex: number
  turnToken: string
  isNavigating: boolean
  total: number
  currentStop: FlightStop | null
  visible: boolean
  canPrev: boolean
  canNext: boolean
}

export interface FlightStopsActions {
  beginTurnStops: (token: string, items: FlightStop[]) => FlightStop | undefined
  appendTurnStops: (token: string, items: FlightStop[]) => { added: FlightStop[]; total: number }
  goTo: (
    index: number,
    flyFn: FlyToExecutor
  ) => Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }>
  switchByRequest: (
    request: StopSwitchRequest,
    flyFn: FlyToExecutor
  ) => Promise<{
    stop?: FlightStop
    index?: number
    total: number
    actualHeight?: number
    error?: string
  }>
  prev: (
    flyFn: FlyToExecutor
  ) => Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }>
  next: (
    flyFn: FlyToExecutor
  ) => Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }>
  clear: () => void
  dismiss: () => void
}

export type FlightStopsStore = FlightStopsState & FlightStopsActions

function plainStop(stop: FlightStop): FlightStop {
  return stop.note
    ? {
        id: stop.id,
        name: stop.name,
        longitude: stop.longitude,
        latitude: stop.latitude,
        height: stop.height,
        note: stop.note
      }
    : {
        id: stop.id,
        name: stop.name,
        longitude: stop.longitude,
        latitude: stop.latitude,
        height: stop.height
      }
}

export function selectFlightStopsTotal(state: Pick<FlightStopsState, 'stops'>): number {
  return state.stops.length
}

export function selectCurrentFlightStop(
  state: Pick<FlightStopsState, 'stops' | 'activeIndex'>
): FlightStop | null {
  const stop = state.stops[state.activeIndex]
  return stop ? plainStop(stop) : null
}

export function selectFlightStopsVisible(state: Pick<FlightStopsState, 'stops'>): boolean {
  return state.stops.length >= 2
}

export function selectCanPrevFlightStop(state: Pick<FlightStopsState, 'activeIndex'>): boolean {
  return state.activeIndex > 0
}

export function selectCanNextFlightStop(
  state: Pick<FlightStopsState, 'stops' | 'activeIndex'>
): boolean {
  return state.activeIndex < state.stops.length - 1
}

function deriveFlightStopsFields(
  stops: FlightStop[],
  activeIndex: number
): Pick<FlightStopsState, 'total' | 'currentStop' | 'visible' | 'canPrev' | 'canNext'> {
  return {
    total: selectFlightStopsTotal({ stops }),
    currentStop: selectCurrentFlightStop({ stops, activeIndex }),
    visible: selectFlightStopsVisible({ stops }),
    canPrev: selectCanPrevFlightStop({ activeIndex }),
    canNext: selectCanNextFlightStop({ stops, activeIndex })
  }
}

export function createInitialFlightStopsState(): FlightStopsState {
  const stops: FlightStop[] = []
  const activeIndex = 0
  return {
    stops,
    activeIndex,
    turnToken: '',
    isNavigating: false,
    ...deriveFlightStopsFields(stops, activeIndex)
  }
}

let switchSeq = 0

export const useFlightStopsStore = create<FlightStopsStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialFlightStopsState(),
    beginTurnStops(token: string, items: FlightStop[]): FlightStop | undefined {
      const stops = mergeFlightStops([], items)
      const activeIndex = 0
      set({
        turnToken: token,
        stops,
        activeIndex,
        ...deriveFlightStopsFields(stops, activeIndex)
      })
      return stops[0] ? plainStop(stops[0]) : undefined
    },
    appendTurnStops(token: string, items: FlightStop[]): { added: FlightStop[]; total: number } {
      const state = get()
      if (token && state.turnToken !== token) {
        const first = get().beginTurnStops(token, items)
        const nextStops = get().stops
        return { added: first ? nextStops.map(plainStop) : [], total: nextStops.length }
      }
      const previousLength = state.stops.length
      const stops = mergeFlightStops(state.stops, items)
      set({
        stops,
        ...deriveFlightStopsFields(stops, state.activeIndex)
      })
      return {
        added: stops.slice(previousLength).map(plainStop),
        total: stops.length
      }
    },
    async goTo(
      index: number,
      flyFn: FlyToExecutor
    ): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
      const state = get()
      if (state.stops.length === 0) {
        return { error: '当前没有可切换的飞行地点列表' }
      }
      const targetIndex = clampStopIndex(index, state.stops.length)
      const target = plainStop(state.stops[targetIndex])
      const previousIndex = state.activeIndex
      const seq = ++switchSeq
      set(current => ({
        activeIndex: targetIndex,
        isNavigating: true,
        ...deriveFlightStopsFields(current.stops, targetIndex)
      }))
      try {
        const actualHeight = await flyFn(target.longitude, target.latitude, target.height)
        if (seq !== switchSeq) {
          return { error: '切换已取消' }
        }
        if (actualHeight === undefined) {
          set(current => ({
            activeIndex: previousIndex,
            ...deriveFlightStopsFields(current.stops, previousIndex)
          }))
          return { error: '飞行已取消' }
        }
        return { stop: target, actualHeight }
      } finally {
        if (seq === switchSeq) {
          set({ isNavigating: false })
        }
      }
    },
    async switchByRequest(
      request: StopSwitchRequest,
      flyFn: FlyToExecutor
    ): Promise<{
      stop?: FlightStop
      index?: number
      total: number
      actualHeight?: number
      error?: string
    }> {
      const state = get()
      const resolved = resolveStopTarget(state.stops, state.activeIndex, request)
      if (resolved.error || resolved.index === undefined) {
        return { error: resolved.error ?? '无法切换飞行地点', total: state.stops.length }
      }
      const result = await get().goTo(resolved.index, flyFn)
      const total = get().stops.length
      if (result.error || !result.stop) {
        return { error: result.error ?? '飞行已取消', total }
      }
      return {
        stop: result.stop,
        index: resolved.index,
        total,
        actualHeight: result.actualHeight
      }
    },
    async prev(
      flyFn: FlyToExecutor
    ): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
      const state = get()
      if (!selectCanPrevFlightStop(state)) {
        return { error: '已经是第一个地点' }
      }
      return get().goTo(state.activeIndex - 1, flyFn)
    },
    async next(
      flyFn: FlyToExecutor
    ): Promise<{ stop?: FlightStop; actualHeight?: number; error?: string }> {
      const state = get()
      if (!selectCanNextFlightStop(state)) {
        return { error: '已经是最后一个地点' }
      }
      return get().goTo(state.activeIndex + 1, flyFn)
    },
    clear(): void {
      switchSeq += 1
      set(createInitialFlightStopsState())
    },
    dismiss(): void {
      switchSeq += 1
      const anchor = selectCurrentFlightStop(get())
      const stops = anchor ? [anchor] : []
      const activeIndex = 0
      set({
        stops,
        activeIndex,
        isNavigating: false,
        ...deriveFlightStopsFields(stops, activeIndex)
      })
    }
  }))
)

export function resetFlightStopsStore(): void {
  switchSeq = 0
  useFlightStopsStore.setState(createInitialFlightStopsState())
}
