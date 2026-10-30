export type TouchInteractionMode = 'auto' | 'on' | 'off'

export const touchInteractionModes: readonly TouchInteractionMode[] = ['auto', 'on', 'off']

export function isTouchInteractionMode(value: unknown): value is TouchInteractionMode {
  return value === 'auto' || value === 'on' || value === 'off'
}

export function normalizeTouchInteractionMode(value: unknown): TouchInteractionMode {
  return isTouchInteractionMode(value) ? value : 'auto'
}

export interface TouchEnvironment {
  coarsePointer: boolean
  maxTouchPoints: number
}

export function resolveTouchInteractionActive(mode: TouchInteractionMode, environment: TouchEnvironment): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return environment.coarsePointer || environment.maxTouchPoints > 0
}
