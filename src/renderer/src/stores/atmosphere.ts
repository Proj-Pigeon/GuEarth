import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type AtmospherePanel = 'circulation' | 'heating' | 'layers'

export interface AtmosphereState {
  panel: AtmospherePanel | null
}

export interface AtmosphereActions {
  setPanel: (value: AtmospherePanel | null) => void
}

export type AtmosphereStore = AtmosphereState & AtmosphereActions

export function createInitialAtmosphereState(): AtmosphereState {
  return {
    panel: null
  }
}

export const useAtmosphereStore = create<AtmosphereStore>()(
  subscribeWithSelector((set) => ({
    ...createInitialAtmosphereState(),
    setPanel(value: AtmospherePanel | null): void {
      set({ panel: value })
    }
  }))
)

export function resetAtmosphereStore(): void {
  useAtmosphereStore.setState(createInitialAtmosphereState())
}
