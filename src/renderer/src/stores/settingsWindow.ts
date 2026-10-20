import { ref } from 'vue'
import { defineStore } from 'pinia'

export type SettingsSection = 'account' | 'general' | 'map' | 'ai' | 'about'

export const useSettingsWindowStore = defineStore('settingsWindow', () => {
  const isOpen = ref(false)
  const activeSection = ref<SettingsSection>('general')

  function open(section?: SettingsSection): void {
    if (section) activeSection.value = section
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function setActiveSection(section: SettingsSection): void {
    activeSection.value = section
  }

  return { isOpen, activeSection, open, close, setActiveSection }
})
