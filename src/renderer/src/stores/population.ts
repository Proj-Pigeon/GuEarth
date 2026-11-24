import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type PopulationPanel = 'population' | 'cities' | null

export interface PopulationState {
  panel: PopulationPanel
}

export interface PopulationActions {
  setPanel: (value: PopulationPanel) => void
}

export type PopulationStore = PopulationState & PopulationActions

export function createInitialPopulationState(): PopulationState {
  return {
    panel: null
  }
}

export const usePopulationStore = create<PopulationStore>()(
  subscribeWithSelector((set) => ({
    ...createInitialPopulationState(),
    setPanel(value: PopulationPanel): void {
      set({ panel: value })
    }
  }))
)

export function resetPopulationStore(): void {
  usePopulationStore.setState(createInitialPopulationState())
}
