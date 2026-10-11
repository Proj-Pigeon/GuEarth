import { ref } from 'vue'
import { defineStore } from 'pinia'

export type EnvironmentPanel = 'environment' | null

export const useEnvironmentStore = defineStore('environment', () => {
  const panel = ref<EnvironmentPanel>(null)

  function setPanel(value: EnvironmentPanel): void {
    panel.value = value
  }

  return { panel, setPanel }
})
