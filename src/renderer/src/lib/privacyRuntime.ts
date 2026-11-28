import type { PrivacySettings } from '../../../common/privacy'

type PrivacyListener = (settings: PrivacySettings) => void

let currentPrivacy: PrivacySettings = {
  errorReportingEnabled: false,
  telemetryEnabled: false,
  aiTelemetryEnabled: false
}
const listeners = new Set<PrivacyListener>()

export function getPrivacySettings(): PrivacySettings {
  return { ...currentPrivacy }
}

export function isErrorReportingEnabled(): boolean {
  return currentPrivacy.errorReportingEnabled
}

export function isTelemetryEnabled(): boolean {
  return currentPrivacy.telemetryEnabled
}

export function isAiTelemetryEnabled(): boolean {
  return currentPrivacy.aiTelemetryEnabled
}

export function applyRendererPrivacySettings(next: PrivacySettings): void {
  currentPrivacy = {
    errorReportingEnabled: next.errorReportingEnabled === true,
    telemetryEnabled: next.telemetryEnabled === true,
    aiTelemetryEnabled: next.aiTelemetryEnabled === true
  }
  const snapshot = getPrivacySettings()
  for (const listener of listeners) {
    listener(snapshot)
  }
}

export function onPrivacySettingsChange(listener: PrivacyListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
