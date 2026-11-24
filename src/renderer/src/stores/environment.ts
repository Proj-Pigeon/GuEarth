import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type EnvironmentPanel = 'environment' | null

export interface EnvironmentState {
  panel: EnvironmentPanel
}

export interface EnvironmentActions {
  setPanel: (value: EnvironmentPanel) => void
}

export type EnvironmentStore = EnvironmentState & EnvironmentActions

export function createInitialEnvironmentState(): EnvironmentState {
  return {
    panel: null
  }
}

export const useEnvironmentStore = create<EnvironmentStore>()(
  subscribeWithSelector((set) => ({
    ...createInitialEnvironmentState(),
    setPanel(value: EnvironmentPanel): void {
      set({ panel: value })
    }
  }))
)

export function resetEnvironmentStore(): void {
  useEnvironmentStore.setState(createInitialEnvironmentState())
}
