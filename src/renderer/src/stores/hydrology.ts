import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type HydrologyPanel = 'water-cycle' | 'ocean-property' | 'tide' | 'water-bodies'

export interface HydrologyState {
  panel: HydrologyPanel | null
}

export interface HydrologyActions {
  setPanel: (value: HydrologyPanel | null) => void
}

export type HydrologyStore = HydrologyState & HydrologyActions

export function createInitialHydrologyState(): HydrologyState {
  return {
    panel: null
  }
}

export const useHydrologyStore = create<HydrologyStore>()(
  subscribeWithSelector((set) => ({
    ...createInitialHydrologyState(),
    setPanel(value: HydrologyPanel | null): void {
      set({ panel: value })
    }
  }))
)

export function resetHydrologyStore(): void {
  useHydrologyStore.setState(createInitialHydrologyState())
}
