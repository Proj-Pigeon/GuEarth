import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface FocusedFeature {
  name: string
  layerName: string
  summary: string
}

export interface FeatureFocusState {
  focused: FocusedFeature | null
}

export interface FeatureFocusActions {
  setFocus: (feature: FocusedFeature) => void
  clearFocus: () => void
}

export type FeatureFocusStore = FeatureFocusState & FeatureFocusActions

export function createInitialFeatureFocusState(): FeatureFocusState {
  return {
    focused: null
  }
}

export const useFeatureFocusStore = create<FeatureFocusStore>()(
  subscribeWithSelector(set => ({
    ...createInitialFeatureFocusState(),
    setFocus(feature: FocusedFeature): void {
      set({ focused: feature })
    },
    clearFocus(): void {
      set({ focused: null })
    }
  }))
)

export function resetFeatureFocusStore(): void {
  useFeatureFocusStore.setState(createInitialFeatureFocusState())
}
