import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ZonationPanel = 'zonation-profile'

export type ZonationFlightStage = 'sampling' | 'prewarm' | 'flying'

export interface ZonationFlightHud {
  stage: ZonationFlightStage
  completed: number
  total: number
  altitudeM?: number
}

export const useZonationStore = defineStore('zonation', () => {
  const panel = ref<ZonationPanel | null>(null)
  const flightHud = ref<ZonationFlightHud | null>(null)

  function setPanel(value: ZonationPanel | null): void {
    panel.value = value
  }

  function setFlightHud(value: ZonationFlightHud | null): void {
    flightHud.value = value
  }

  return { panel, flightHud, setPanel, setFlightHud }
})
