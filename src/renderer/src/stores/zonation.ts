import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type ZonationPanel = 'zonation-profile'

export type ZonationFlightStage = 'sampling' | 'prewarm' | 'flying'

export interface ZonationFlightHud {
  stage: ZonationFlightStage
  completed: number
  total: number
  altitudeM?: number
}

export interface ZonationState {
  panel: ZonationPanel | null
  flightHud: ZonationFlightHud | null
  flightTileCacheActive: boolean
}

export interface ZonationActions {
  setPanel: (value: ZonationPanel | null) => void
  setFlightHud: (value: ZonationFlightHud | null) => void
  setFlightTileCacheActive: (value: boolean) => void
}

export type ZonationStore = ZonationState & ZonationActions

export function createInitialZonationState(): ZonationState {
  return {
    panel: null,
    flightHud: null,
    flightTileCacheActive: false
  }
}

export const useZonationStore = create<ZonationStore>()(
  subscribeWithSelector(set => ({
    ...createInitialZonationState(),
    setPanel(value: ZonationPanel | null): void {
      set({ panel: value })
    },
    setFlightHud(value: ZonationFlightHud | null): void {
      set({ flightHud: value })
    },
    setFlightTileCacheActive(value: boolean): void {
      set({ flightTileCacheActive: value })
    }
  }))
)

export function resetZonationStore(): void {
  useZonationStore.setState(createInitialZonationState())
}
