import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { appToast } from '@renderer/components/ui/toast'
import type { UpdateCheckOutcome, UpdateState, UpdaterEvent } from '../../../preload'
import { updateReadyHint } from './updateCopy'

export type UpdateStatus = UpdateState['status']
export { updateInstallContent } from './updateCopy'

export interface UpdaterState {
  status: UpdateStatus
  currentVersion: string
  version: string
  notes: string
  packageKind: UpdateState['packageKind']
  received: number
  total: number
  percent: number
  promptVisible: boolean
  checking: boolean
}

export interface UpdaterActions {
  hydrate: () => Promise<void>
  remindLater: () => void
  startDownload: () => Promise<void>
  installNow: () => Promise<void>
  checkNow: () => Promise<void>
}

export type UpdaterStore = UpdaterState & UpdaterActions

export function selectUpdaterPercent(state: Pick<UpdaterState, 'received' | 'total'>): number {
  return state.total > 0 ? Math.min(100, Math.floor((state.received / state.total) * 100)) : 0
}

export function createInitialUpdaterState(): UpdaterState {
  return {
    status: 'idle',
    currentVersion: '',
    version: '',
    notes: '',
    packageKind: '',
    received: 0,
    total: 0,
    percent: 0,
    promptVisible: false,
    checking: false
  }
}

let bound = false
let prompted = false
let unsubscribeUpdater: (() => void) | null = null

function stripIpcErrorPrefix(value: unknown): string {
  if (value instanceof Error) {return value.message.replace(/^Error invoking remote method '[^']+':?\s*(Error:\s*)?/i, '')}
  return '未知错误'
}

function applyEvent(event: UpdaterEvent): void {
  if (event.type === 'available') {
    const shouldPrompt = !prompted
    if (shouldPrompt) {prompted = true}
    useUpdaterStore.setState((state) => ({
      version: event.version,
      notes: event.notes,
      packageKind: event.packageKind,
      status: 'available',
      promptVisible: shouldPrompt ? true : state.promptVisible
    }))
  } else if (event.type === 'progress') {
    useUpdaterStore.setState({
      status: 'downloading',
      received: event.received,
      total: event.total,
      percent: selectUpdaterPercent({ received: event.received, total: event.total })
    })
  } else if (event.type === 'downloaded') {
    useUpdaterStore.setState((state) => {
      const received = state.total > 0 ? state.total : state.received
      return {
        status: 'ready',
        version: event.version,
        packageKind: event.packageKind,
        received,
        percent: selectUpdaterPercent({ received, total: state.total })
      }
    })
    appToast.success(`新版本 v${event.version} 已下载完成，${updateReadyHint(event.packageKind)}`, 8)
  } else if (event.type === 'error') {
    useUpdaterStore.setState((state) => ({
      status: state.version ? 'available' : 'idle'
    }))
    appToast.error(event.message, 6)
  }
}

export const useUpdaterStore = create<UpdaterStore>()(
  subscribeWithSelector((set, get) => {
    function reportCheckOutcome(outcome: UpdateCheckOutcome): void {
      if (outcome === 'available') {appToast.success(`发现新版本 v${get().version}`)}
      else if (outcome === 'latest') {appToast.info('当前已是最新版本')}
      else if (outcome === 'disabled') {appToast.warning('当前环境不支持检查更新')}
      else {appToast.error('检查更新失败，请稍后重试')}
    }

    return {
      ...createInitialUpdaterState(),
      async hydrate(): Promise<void> {
        if (bound) {return}
        bound = true
        unsubscribeUpdater = window.guEarth.updater.onEvent(applyEvent)
        try {
          const state = await window.guEarth.updater.getState()
          const shouldPrompt = state.status === 'available' && !prompted
          if (shouldPrompt) {prompted = true}
          set((current) => ({
            currentVersion: state.currentVersion,
            version: state.version || current.version,
            notes: state.notes || current.notes,
            packageKind: state.packageKind,
            received: state.received,
            total: state.total,
            percent: selectUpdaterPercent({ received: state.received, total: state.total }),
            promptVisible: shouldPrompt ? true : current.promptVisible,
            status: state.status
          }))
        } catch {
          void 0
        }
      },
      remindLater(): void {
        set({ promptVisible: false })
      },
      async startDownload(): Promise<void> {
        set({ promptVisible: false })
        if (get().status !== 'available') {return}
        set({ status: 'downloading' })
        try {
          await window.guEarth.updater.download()
        } catch (error) {
          set({ status: 'available' })
          appToast.error(`无法开始下载：${stripIpcErrorPrefix(error)}`, 6)
        }
      },
      async installNow(): Promise<void> {
        try {
          await window.guEarth.updater.install()
        } catch (error) {
          appToast.error(`无法启动安装：${stripIpcErrorPrefix(error)}`, 6)
        }
      },
      async checkNow(): Promise<void> {
        if (get().checking) {return}
        set({ checking: true })
        try {
          reportCheckOutcome(await window.guEarth.updater.check())
        } catch {
          appToast.error('检查更新失败，请稍后重试')
        } finally {
          set({ checking: false })
        }
      }
    }
  })
)

export function resetUpdaterStore(): void {
  if (unsubscribeUpdater) {
    unsubscribeUpdater()
    unsubscribeUpdater = null
  }
  bound = false
  prompted = false
  useUpdaterStore.setState(createInitialUpdaterState())
}
