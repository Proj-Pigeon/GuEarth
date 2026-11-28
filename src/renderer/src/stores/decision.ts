import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type DecisionPanel = 'location' | null

export interface DecisionState {
  panel: DecisionPanel
}

export interface DecisionActions {
  setPanel: (value: DecisionPanel) => void
}

export type DecisionStore = DecisionState & DecisionActions

export function createInitialDecisionState(): DecisionState {
  return {
    panel: null
  }
}

export const useDecisionStore = create<DecisionStore>()(
  subscribeWithSelector(set => ({
    ...createInitialDecisionState(),
    setPanel(value: DecisionPanel): void {
      set({ panel: value })
    }
  }))
)

export function resetDecisionStore(): void {
  useDecisionStore.setState(createInitialDecisionState())
}
