import { ref } from 'vue'
import { defineStore } from 'pinia'

export type DecisionPanel = 'location' | null

export const useDecisionStore = defineStore('decision', () => {
  const panel = ref<DecisionPanel>(null)

  function setPanel(value: DecisionPanel): void {
    panel.value = value
  }

  return { panel, setPanel }
})
