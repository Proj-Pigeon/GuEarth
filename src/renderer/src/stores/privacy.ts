import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_PRIVACY_SETTINGS, resolvePrivacySettings, type PrivacySettingKey, type PrivacySettings } from '../../../common/privacy'
import { applyRendererPrivacySettings } from '../lib/privacyRuntime'

export const usePrivacyStore = defineStore('privacy', () => {
  const errorReportingEnabled = ref(DEFAULT_PRIVACY_SETTINGS.errorReportingEnabled)
  const telemetryEnabled = ref(DEFAULT_PRIVACY_SETTINGS.telemetryEnabled)
  const aiTelemetryEnabled = ref(DEFAULT_PRIVACY_SETTINGS.aiTelemetryEnabled)
  const hydrated = ref(false)
  let hydratePromise: Promise<void> | null = null

  function currentSnapshot(): PrivacySettings {
    return {
      errorReportingEnabled: errorReportingEnabled.value,
      telemetryEnabled: telemetryEnabled.value,
      aiTelemetryEnabled: aiTelemetryEnabled.value
    }
  }

  function applyLocal(next: PrivacySettings): void {
    errorReportingEnabled.value = next.errorReportingEnabled
    telemetryEnabled.value = next.telemetryEnabled
    aiTelemetryEnabled.value = next.aiTelemetryEnabled
    applyRendererPrivacySettings(next)
  }

  async function hydrate(): Promise<void> {
    if (hydrated.value) return
    if (hydratePromise) return hydratePromise
    hydratePromise = (async () => {
      if (typeof window === 'undefined' || !window.guEarth?.settings) {
        applyLocal({ ...DEFAULT_PRIVACY_SETTINGS })
        hydrated.value = true
        return
      }
      try {
        const settings = await window.guEarth.settings.get()
        applyLocal(resolvePrivacySettings(settings as unknown as Record<string, unknown>))
      } catch {
        applyLocal({ ...DEFAULT_PRIVACY_SETTINGS })
      } finally {
        hydrated.value = true
        hydratePromise = null
      }
    })()
    return hydratePromise
  }

  async function setPrivacySetting(key: PrivacySettingKey, enabled: boolean): Promise<boolean> {
    const previous = currentSnapshot()
    const next: PrivacySettings = { ...previous, [key]: enabled }
    if (!enabled) applyLocal(next)
    if (typeof window === 'undefined' || !window.guEarth?.settings) {
      applyLocal(next)
      return true
    }
    try {
      const saved = await window.guEarth.settings.update({ [key]: enabled })
      applyLocal(resolvePrivacySettings(saved as unknown as Record<string, unknown>))
      return true
    } catch {
      applyLocal(previous)
      return false
    }
  }

  return {
    errorReportingEnabled,
    telemetryEnabled,
    aiTelemetryEnabled,
    hydrated,
    hydrate,
    setPrivacySetting
  }
})
