import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type FailureScope = 'basemap' | 'terrain' | 'dataset' | 'province-dataset' | 'annotations' | 'settings' | 'recording' | 'recording-quality'

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

const scopeOrder: FailureScope[] = ['basemap', 'terrain', 'dataset', 'province-dataset', 'annotations', 'settings', 'recording', 'recording-quality']

export const useFailureStore = defineStore('failure', () => {
  const notices = ref<Partial<Record<FailureScope, FailureNotice>>>({})
  const degradations = ref<DegradeNotice[]>([])
  const retrying = ref<Partial<Record<FailureScope, boolean>>>({})
  const retryHandlers = new Map<FailureScope, () => Promise<void>>()
  let degradeSeq = 0

  const active = computed(() => scopeOrder.flatMap((scope) => {
    const notice = notices.value[scope]
    return notice ? [notice] : []
  }))

  function reportFailure(notice: FailureNotice): void {
    notices.value = { ...notices.value, [notice.scope]: notice }
  }

  function clearFailure(scope: FailureScope): void {
    if (!notices.value[scope]) return
    const next = { ...notices.value }
    delete next[scope]
    notices.value = next
  }

  function reportDegrade(message: string): void {
    degradeSeq += 1
    degradations.value = [...degradations.value, { id: degradeSeq, message }]
  }

  function takeDegradations(): DegradeNotice[] {
    const pending = degradations.value
    if (pending.length) degradations.value = []
    return pending
  }

  function registerRetry(scope: FailureScope, handler: () => Promise<void>): void {
    retryHandlers.set(scope, handler)
  }

  async function retry(scope: FailureScope): Promise<void> {
    const handler = retryHandlers.get(scope)
    if (!handler || retrying.value[scope]) return
    retrying.value = { ...retrying.value, [scope]: true }
    try {
      await handler()
    } catch {
      void 0
    } finally {
      retrying.value = { ...retrying.value, [scope]: false }
    }
  }

  return {
    notices, active, degradations, retrying,
    reportFailure, clearFailure, reportDegrade, takeDegradations, registerRetry, retry
  }
})
