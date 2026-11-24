import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type LandformPanel = 'fold-fault' | 'river' | 'landform-guide' | 'exogenic' | 'earth-layers'

export interface LandformState {
  panel: LandformPanel | null
}

export interface LandformActions {
  setPanel: (value: LandformPanel | null) => void
}

export type LandformStore = LandformState & LandformActions

export function createInitialLandformState(): LandformState {
  return {
    panel: null
  }
}

export const useLandformStore = create<LandformStore>()(
  subscribeWithSelector((set) => ({
    ...createInitialLandformState(),
    setPanel(value: LandformPanel | null): void {
      set({ panel: value })
    }
  }))
)

export function resetLandformStore(): void {
  useLandformStore.setState(createInitialLandformState())
}
