import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { DEFAULT_PRIVACY_SETTINGS, resolvePrivacySettings, type PrivacySettingKey, type PrivacySettings } from '../../../common/privacy'
import { applyRendererPrivacySettings } from '../lib/privacyRuntime'

const PRIVACY_KEYS: readonly PrivacySettingKey[] = [
  'errorReportingEnabled',
  'telemetryEnabled',
  'aiTelemetryEnabled'
]

export interface PrivacyStoreState {
  errorReportingEnabled: boolean
  telemetryEnabled: boolean
  aiTelemetryEnabled: boolean
  hydrated: boolean
}

export interface PrivacyStoreActions {
  hydrate: () => Promise<void>
  setPrivacySetting: (key: PrivacySettingKey, enabled: boolean) => Promise<boolean>
}

export type PrivacyStore = PrivacyStoreState & PrivacyStoreActions

export function createInitialPrivacyState(): PrivacyStoreState {
  return {
    errorReportingEnabled: false,
    telemetryEnabled: false,
    aiTelemetryEnabled: false,
    hydrated: false
  }
}

function zeroPrivacyRecord(): Record<PrivacySettingKey, number> {
  return {
    errorReportingEnabled: 0,
    telemetryEnabled: 0,
    aiTelemetryEnabled: 0
  }
}

let hydratePromise: Promise<void> | null = null
let settledSnapshot: PrivacySettings = {
  errorReportingEnabled: false,
  telemetryEnabled: false,
  aiTelemetryEnabled: false
}
let pendingDisableCounts: Record<PrivacySettingKey, number> = zeroPrivacyRecord()
let activeUpdates: Record<PrivacySettingKey, number> = zeroPrivacyRecord()
let latestSeq: Record<PrivacySettingKey, number> = zeroPrivacyRecord()
let appliedSeq: Record<PrivacySettingKey, number> = zeroPrivacyRecord()

function applyLocal(next: PrivacySettings): void {
  const effective: PrivacySettings = {
    errorReportingEnabled: pendingDisableCounts.errorReportingEnabled > 0 ? false : next.errorReportingEnabled,
    telemetryEnabled: pendingDisableCounts.telemetryEnabled > 0 ? false : next.telemetryEnabled,
    aiTelemetryEnabled: pendingDisableCounts.aiTelemetryEnabled > 0 ? false : next.aiTelemetryEnabled
  }
  usePrivacyStore.setState({
    errorReportingEnabled: effective.errorReportingEnabled,
    telemetryEnabled: effective.telemetryEnabled,
    aiTelemetryEnabled: effective.aiTelemetryEnabled
  })
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

export const usePrivacyStore = create<PrivacyStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialPrivacyState(),
    async hydrate(): Promise<void> {
      if (get().hydrated) return
      if (hydratePromise) return hydratePromise
      hydratePromise = (async () => {
        const seqAtStart = { ...latestSeq }
        try {
          if (typeof window === 'undefined' || !window.guEarth?.settings) {
            mergeSnapshot({ ...DEFAULT_PRIVACY_SETTINGS }, seqAtStart)
            applyLocal(settledSnapshot)
            set({ hydrated: true })
            return
          }
          const settings = await window.guEarth.settings.get()
          const resolved = resolvePrivacySettings(settings as unknown as Record<string, unknown>)
          mergeSnapshot(resolved, seqAtStart)
          applyLocal(settledSnapshot)
          set({ hydrated: true })
        } catch {
          return
        } finally {
          hydratePromise = null
        }
      })()
      return hydratePromise
    },
    async setPrivacySetting(key: PrivacySettingKey, enabled: boolean): Promise<boolean> {
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
  }))
)

export function resetPrivacyStore(): void {
  hydratePromise = null
  settledSnapshot = {
    errorReportingEnabled: false,
    telemetryEnabled: false,
    aiTelemetryEnabled: false
  }
  pendingDisableCounts = zeroPrivacyRecord()
  activeUpdates = zeroPrivacyRecord()
  latestSeq = zeroPrivacyRecord()
  appliedSeq = zeroPrivacyRecord()
  usePrivacyStore.setState(createInitialPrivacyState())
}
