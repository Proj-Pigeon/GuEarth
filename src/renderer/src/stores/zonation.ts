import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ZonationPanel = 'zonation-profile'

export const useZonationStore = defineStore('zonation', () => {
  const panel = ref<ZonationPanel | null>(null)

  function setPanel(value: ZonationPanel | null): void {
    panel.value = value
  }

  return { panel, setPanel }
})
