import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { HSR_END_YEAR, HSR_START_YEAR } from '@renderer/thematic/hsrLines'

const YEARS_PER_SECOND = 2.2

export type TransportPanel = 'transport' | null

export interface TransportState {
  year: number
  isPlaying: boolean
  panel: TransportPanel
}

export interface TransportActions {
  setYear: (value: number) => void
  setPanel: (value: TransportPanel) => void
  togglePlaying: () => void
  advance: (dtSeconds: number) => void
}

export type TransportStore = TransportState & TransportActions

export function createInitialTransportState(): TransportState {
  return {
    year: HSR_END_YEAR,
    isPlaying: false,
    panel: null
  }
}

export const useTransportStore = create<TransportStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialTransportState(),
    setYear(value: number): void {
      if (Number.isFinite(value)) {
        set({ year: Math.round(Math.min(HSR_END_YEAR, Math.max(HSR_START_YEAR, value))) })
      }
    },
    setPanel(value: TransportPanel): void {
      set({ panel: value })
    },
    togglePlaying(): void {
      set((state) => ({ isPlaying: !state.isPlaying }))
    },
    advance(dtSeconds: number): void {
      const state = get()
      if (!state.isPlaying) return
      const next = state.year + dtSeconds * YEARS_PER_SECOND
      set({ year: next > HSR_END_YEAR ? HSR_START_YEAR + (next - HSR_END_YEAR) : next })
    }
  }))
)

export function resetTransportStore(): void {
  useTransportStore.setState(createInitialTransportState())
}
