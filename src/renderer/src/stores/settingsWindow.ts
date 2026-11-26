import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type SettingsSection =
  | 'account'
  | 'general'
  | 'map'
  | 'ai'
  | 'privacy'
  | 'laboratory'
  | 'about'

export interface SettingsWindowState {
  isOpen: boolean
  activeSection: SettingsSection
}

export interface SettingsWindowActions {
  open: (section?: SettingsSection) => void
  close: () => void
  setActiveSection: (section: SettingsSection) => void
}

export type SettingsWindowStore = SettingsWindowState & SettingsWindowActions

export function createInitialSettingsWindowState(): SettingsWindowState {
  return {
    isOpen: false,
    activeSection: 'general'
  }
}

export const useSettingsWindowStore = create<SettingsWindowStore>()(
  subscribeWithSelector(set => ({
    ...createInitialSettingsWindowState(),
    open(section?: SettingsSection): void {
      set(state => ({
        isOpen: true,
        activeSection: section ?? state.activeSection
      }))
    },
    close(): void {
      set({ isOpen: false })
    },
    setActiveSection(section: SettingsSection): void {
      set({ activeSection: section })
    }
  }))
)

export function resetSettingsWindowStore(): void {
  useSettingsWindowStore.setState(createInitialSettingsWindowState())
}
