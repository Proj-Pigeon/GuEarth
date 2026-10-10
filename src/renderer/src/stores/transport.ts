import { ref } from 'vue'
import { defineStore } from 'pinia'
import { HSR_END_YEAR, HSR_START_YEAR } from '@renderer/thematic/hsrLines'

const YEARS_PER_SECOND = 2.2

export type TransportPanel = 'transport' | null

export const useTransportStore = defineStore('transport', () => {
  const year = ref(HSR_END_YEAR)
  const isPlaying = ref(false)
  const panel = ref<TransportPanel>(null)

  function setYear(value: number): void {
    if (Number.isFinite(value)) year.value = Math.round(Math.min(HSR_END_YEAR, Math.max(HSR_START_YEAR, value)))
  }

  function setPanel(value: TransportPanel): void {
    panel.value = value
  }

  function togglePlaying(): void {
    isPlaying.value = !isPlaying.value
  }

  function advance(dtSeconds: number): void {
    if (!isPlaying.value) return
    const next = year.value + dtSeconds * YEARS_PER_SECOND
    year.value = next > HSR_END_YEAR ? HSR_START_YEAR + (next - HSR_END_YEAR - 1) : next
  }

  return { year, isPlaying, panel, setYear, setPanel, togglePlaying, advance }
})
