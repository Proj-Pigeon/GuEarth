import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type FailureScope = 'webgl' | 'basemap' | 'terrain' | 'dataset' | 'province-dataset' | 'annotations' | 'settings' | 'sea-level-terrain' | 'recording' | 'recording-quality'

export interface FailureNotice {
  scope: FailureScope
  message: string
  detail?: string
  retryable: boolean
}

export interface DegradeNotice {
  id: number
  message: string
}

const scopeOrder: FailureScope[] = ['webgl', 'basemap', 'terrain', 'dataset', 'province-dataset', 'annotations', 'settings', 'sea-level-terrain', 'recording', 'recording-quality']

export interface FailureState {
  notices: Partial<Record<FailureScope, FailureNotice>>
  active: FailureNotice[]
  degradations: DegradeNotice[]
  retrying: Partial<Record<FailureScope, boolean>>
}

export interface FailureActions {
  reportFailure: (notice: FailureNotice) => void
  clearFailure: (scope: FailureScope) => void
  reportDegrade: (message: string) => void
  takeDegradations: () => DegradeNotice[]
  registerRetry: (scope: FailureScope, handler: () => Promise<void>) => void
  retry: (scope: FailureScope) => Promise<void>
}

export type FailureStore = FailureState & FailureActions

export function selectActiveFailures(state: Pick<FailureState, 'notices'>): FailureNotice[] {
  return scopeOrder.flatMap((scope) => {
    const notice = state.notices[scope]
    return notice ? [notice] : []
  })
}

export function createInitialFailureState(): FailureState {
  return {
    notices: {},
    active: [],
    degradations: [],
    retrying: {}
  }
}

const retryHandlers = new Map<FailureScope, () => Promise<void>>()
let degradeSeq = 0

export const useFailureStore = create<FailureStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialFailureState(),
    reportFailure(notice: FailureNotice): void {
      set((state) => {
        const notices = { ...state.notices, [notice.scope]: notice }
        return {
          notices,
          active: selectActiveFailures({ notices })
        }
      })
    },
    clearFailure(scope: FailureScope): void {
      const current = get().notices
      if (!current[scope]) {return}
      const notices = { ...current }
      delete notices[scope]
      set({
        notices,
        active: selectActiveFailures({ notices })
      })
    },
    reportDegrade(message: string): void {
      degradeSeq += 1
      const id = degradeSeq
      set((state) => ({
        degradations: [...state.degradations, { id, message }]
      }))
    },
    takeDegradations(): DegradeNotice[] {
      const pending = get().degradations
      if (pending.length > 0) {set({ degradations: [] })}
      return pending
    },
    registerRetry(scope: FailureScope, handler: () => Promise<void>): void {
      retryHandlers.set(scope, handler)
    },
    async retry(scope: FailureScope): Promise<void> {
      const handler = retryHandlers.get(scope)
      if (!handler || get().retrying[scope]) {return}
      set((state) => ({
        retrying: { ...state.retrying, [scope]: true }
      }))
      try {
        await handler()
      } catch {
        void 0
      } finally {
        set((state) => ({
          retrying: { ...state.retrying, [scope]: false }
        }))
      }
    }
  }))
)

export function resetFailureStore(): void {
  retryHandlers.clear()
  degradeSeq = 0
  useFailureStore.setState(createInitialFailureState())
}
