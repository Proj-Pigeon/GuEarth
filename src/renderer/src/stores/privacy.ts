import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_PRIVACY_SETTINGS, resolvePrivacySettings, type PrivacySettingKey, type PrivacySettings } from '../../../common/privacy'
import { applyRendererPrivacySettings } from '../lib/privacyRuntime'

const PRIVACY_KEYS: readonly PrivacySettingKey[] = [
  'errorReportingEnabled',
  'telemetryEnabled',
  'aiTelemetryEnabled'
]

export const usePrivacyStore = defineStore('privacy', () => {
  const errorReportingEnabled = ref(false)
  const telemetryEnabled = ref(false)
  const aiTelemetryEnabled = ref(false)
  const hydrated = ref(false)
  let hydratePromise: Promise<void> | null = null
  let settledSnapshot: PrivacySettings = {
    errorReportingEnabled: false,
    telemetryEnabled: false,
    aiTelemetryEnabled: false
  }
  const pendingDisableCounts: Record<PrivacySettingKey, number> = {
    errorReportingEnabled: 0,
    telemetryEnabled: 0,
    aiTelemetryEnabled: 0
  }
  const activeUpdates: Record<PrivacySettingKey, number> = {
    errorReportingEnabled: 0,
    telemetryEnabled: 0,
    aiTelemetryEnabled: 0
  }
  const latestSeq: Record<PrivacySettingKey, number> = {
    errorReportingEnabled: 0,
    telemetryEnabled: 0,
    aiTelemetryEnabled: 0
  }
  const appliedSeq: Record<PrivacySettingKey, number> = {
    errorReportingEnabled: 0,
    telemetryEnabled: 0,
    aiTelemetryEnabled: 0
  }

  function applyLocal(next: PrivacySettings): void {
    const effective: PrivacySettings = {
      errorReportingEnabled: pendingDisableCounts.errorReportingEnabled > 0 ? false : next.errorReportingEnabled,
      telemetryEnabled: pendingDisableCounts.telemetryEnabled > 0 ? false : next.telemetryEnabled,
      aiTelemetryEnabled: pendingDisableCounts.aiTelemetryEnabled > 0 ? false : next.aiTelemetryEnabled
    }
    errorReportingEnabled.value = effective.errorReportingEnabled
    telemetryEnabled.value = effective.telemetryEnabled
    aiTelemetryEnabled.value = effective.aiTelemetryEnabled
    applyRendererPrivacySettings(effective)
  }

  function mergeSnapshot(
    resolved: PrivacySettings,
    seqAtStart: Record<PrivacySettingKey, number>,
    updatedKey?: PrivacySettingKey,
    updatedSeq?: number
  ): void {
    const next: PrivacySettings = { ...settledSnapshot }
    for (const key of PRIVACY_KEYS) {
      if (key === updatedKey && updatedSeq !== undefined) {
        if (updatedSeq > appliedSeq[key]) {
          appliedSeq[key] = updatedSeq
          next[key] = resolved[key]
        }
      } else if (activeUpdates[key] === 0 && latestSeq[key] === seqAtStart[key]) {
        next[key] = resolved[key]
      }
    }
    settledSnapshot = next
  }

  async function hydrate(): Promise<void> {
    if (hydrated.value) return
    if (hydratePromise) return hydratePromise
    hydratePromise = (async () => {
      const seqAtStart = { ...latestSeq }
      try {
        if (typeof window === 'undefined' || !window.guEarth?.settings) {
          mergeSnapshot({ ...DEFAULT_PRIVACY_SETTINGS }, seqAtStart)
          applyLocal(settledSnapshot)
          hydrated.value = true
          return
        }
        const settings = await window.guEarth.settings.get()
        const resolved = resolvePrivacySettings(settings as unknown as Record<string, unknown>)
        mergeSnapshot(resolved, seqAtStart)
        applyLocal(settledSnapshot)
        hydrated.value = true
      } catch {
        return
      } finally {
        hydratePromise = null
      }
    })()
    return hydratePromise
  }

  async function setPrivacySetting(key: PrivacySettingKey, enabled: boolean): Promise<boolean> {
    const seqAtStart = { ...latestSeq }
    const seq = ++latestSeq[key]
    activeUpdates[key] += 1
    if (!enabled) {
      pendingDisableCounts[key] += 1
      applyLocal(settledSnapshot)
    }
    if (typeof window === 'undefined' || !window.guEarth?.settings) {
      activeUpdates[key] -= 1
      if (!enabled) pendingDisableCounts[key] -= 1
      settledSnapshot = { ...settledSnapshot, [key]: enabled }
      applyLocal(settledSnapshot)
      return true
    }
    try {
      const saved = await window.guEarth.settings.update({ [key]: enabled })
      activeUpdates[key] -= 1
      if (!enabled) pendingDisableCounts[key] -= 1
      const resolved = resolvePrivacySettings(saved as unknown as Record<string, unknown>)
      mergeSnapshot(resolved, seqAtStart, key, seq)
      applyLocal(settledSnapshot)
      return true
    } catch {
      activeUpdates[key] -= 1
      if (!enabled) pendingDisableCounts[key] -= 1
      applyLocal(settledSnapshot)
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
