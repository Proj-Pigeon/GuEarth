import posthog from 'posthog-js/no-external'
import { filterPosthogEvent } from '../../common/privacy';
import type { PrivacySettings } from '../../common/privacy';

const posthogToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
const posthogHost = import.meta.env.VITE_POSTHOG_HOST

let initialized = false
let missingWarned = false
let currentPrivacy: PrivacySettings = {
  errorReportingEnabled: false,
  telemetryEnabled: false,
  aiTelemetryEnabled: false
}

function anyPosthogEnabled(privacy: PrivacySettings): boolean {
  return privacy.errorReportingEnabled || privacy.telemetryEnabled || privacy.aiTelemetryEnabled
}

function ensureInitialized(): boolean {
  if (initialized) {return true}
  if (!anyPosthogEnabled(currentPrivacy)) {return false}
  if (!posthogToken || !posthogHost) {
    if (!missingWarned && import.meta.env.DEV) {
      missingWarned = true
      const missingVariable = posthogToken ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_PROJECT_TOKEN'
      console.warn(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`)
    }
    return false
  }
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: '2026-08-30',
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    disable_external_dependency_loading: true,
    disable_session_recording: true,
    request_batching: false,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    before_send: (event) => filterPosthogEvent(event, currentPrivacy)
  })
  initialized = true
  posthog.stopExceptionAutocapture()
  if (!currentPrivacy.telemetryEnabled && posthog._isIdentified()) {
    posthog.reset()
  }
  posthog.opt_in_capturing({ captureEventName: false })
  return true
}

export function syncPosthogPrivacy(next: PrivacySettings): void {
  const previousTelemetry = currentPrivacy.telemetryEnabled
  currentPrivacy = { ...next }
  if (!initialized) {return}
  if (!anyPosthogEnabled(currentPrivacy)) {
    posthog.stopExceptionAutocapture()
    if (posthog._isIdentified()) {posthog.reset()}
    posthog.opt_out_capturing()
    return
  }
  if (previousTelemetry && !currentPrivacy.telemetryEnabled && posthog._isIdentified()) {
    posthog.reset()
  }
  posthog.opt_in_capturing({ captureEventName: false })
  posthog.stopExceptionAutocapture()
}

export function captureTelemetryEvent(event: string, properties?: Record<string, unknown>): void {
  if (!currentPrivacy.telemetryEnabled || !ensureInitialized()) {return}
  posthog.capture(event, properties)
}

export function captureAiUsageEvent(event: string, properties?: Record<string, unknown>): void {
  if (!currentPrivacy.aiTelemetryEnabled || !ensureInitialized()) {return}
  posthog.capture(event, properties)
}

export function capturePosthogException(error: unknown): void {
  if (!currentPrivacy.errorReportingEnabled || !ensureInitialized()) {return}
  posthog.captureException(error)
}

export function identifyTelemetryUser(distinctId: string, properties?: Record<string, string>): void {
  if (!currentPrivacy.telemetryEnabled || !ensureInitialized()) {return}
  posthog.identify(distinctId, properties)
}

export function resetTelemetryIdentity(): void {
  if (!initialized) {return}
  posthog.reset()
  if (anyPosthogEnabled(currentPrivacy)) {
    posthog.opt_in_capturing({ captureEventName: false })
  }
}

export function isTelemetryUserIdentified(): boolean {
  return initialized && posthog._isIdentified()
}
