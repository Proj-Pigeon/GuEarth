import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { OnlineDataSnapshot } from '../../../common/onlineData'
import { useFailureStore } from './failure'

export type TyphoonMode = 'live' | 'history'

export interface OnlineDataState {
  snapshot: OnlineDataSnapshot | null
  loading: boolean
  typhoonMode: TyphoonMode
  typhoonLoading: boolean
}

export interface OnlineDataActions {
  setTyphoonMode: (mode: TyphoonMode) => void
  load: () => Promise<void>
  ensureTyphoons: (retry?: boolean) => Promise<void>
  subscribe: () => () => void
}

export type OnlineDataStore = OnlineDataState & OnlineDataActions

export function selectTyphoonLoading(state: Pick<OnlineDataState, 'snapshot'>): boolean {
  return state.snapshot?.typhoonStatus === 'pending' || state.snapshot?.typhoonStatus === 'loading'
}

export function createInitialOnlineDataState(): OnlineDataState {
  return {
    snapshot: null,
    loading: true,
    typhoonMode: 'live',
    typhoonLoading: false
  }
}

let pending: Promise<void> | null = null
let unsubscribeOnlineData: (() => void) | null = null

function applySnapshot(data: OnlineDataSnapshot): void {
  const previous = useOnlineDataStore.getState().snapshot
  if (previous && data.revision <= previous.revision) {
    return
  }
  useOnlineDataStore.setState({
    snapshot: data,
    typhoonLoading: selectTyphoonLoading({ snapshot: data })
  })
  const failure = useFailureStore.getState()
  if (data.earthquakeError && data.earthquakeError !== previous?.earthquakeError) {
    failure.reportDegrade(data.earthquakeError)
  }
  if (data.typhoonError && data.typhoonError !== previous?.typhoonError) {
    failure.reportDegrade(`${data.typhoonError}${data.typhoons ? '，暂显示上次台风数据' : ''}`)
  }
}

function ensureSubscribed(): () => void {
  if (
    !unsubscribeOnlineData &&
    typeof window !== 'undefined' &&
    typeof window.guEarth?.datasets?.onOnlineData === 'function'
  ) {
    unsubscribeOnlineData = window.guEarth.datasets.onOnlineData(applySnapshot)
  }
  return () => {
    if (!unsubscribeOnlineData) {
      return
    }
    const dispose = unsubscribeOnlineData
    unsubscribeOnlineData = null
    dispose()
  }
}

export const useOnlineDataStore = create<OnlineDataStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialOnlineDataState(),
    setTyphoonMode(mode: TyphoonMode): void {
      set({ typhoonMode: mode })
    },
    load(): Promise<void> {
      ensureSubscribed()
      if (pending) {
        return pending
      }
      pending = (async () => {
        try {
          applySnapshot(await window.guEarth.datasets.getOnlineData())
        } catch {
          useFailureStore.getState().reportDegrade('在线数据加载失败，请重启应用重试')
        } finally {
          set({ loading: false })
        }
      })()
      return pending
    },
    async ensureTyphoons(retry = false): Promise<void> {
      await get().load()
      const status = get().snapshot?.typhoonStatus
      if (status !== 'pending' && !(retry && status === 'error')) {
        return
      }
      try {
        applySnapshot(await window.guEarth.datasets.ensureTyphoons(retry))
      } catch {
        useFailureStore.getState().reportDegrade('台风数据加载失败，请重试')
      }
    },
    subscribe(): () => void {
      return ensureSubscribed()
    }
  }))
)

ensureSubscribed()

export function resetOnlineDataStore(): void {
  if (unsubscribeOnlineData) {
    unsubscribeOnlineData()
    unsubscribeOnlineData = null
  }
  pending = null
  useOnlineDataStore.setState(createInitialOnlineDataState())
}
