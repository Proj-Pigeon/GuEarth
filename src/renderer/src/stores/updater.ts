import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { message } from 'ant-design-vue'
import type { UpdateCheckOutcome, UpdateState, UpdaterEvent } from '../../../preload'

export type UpdateStatus = UpdateState['status']

let bound = false
let prompted = false

function stripIpcErrorPrefix(value: unknown): string {
  if (value instanceof Error) return value.message.replace(/^Error invoking remote method '[^']+':?\s*(Error:\s*)?/i, '')
  return '未知错误'
}

export const useUpdaterStore = defineStore('updater', () => {
  const status = ref<UpdateStatus>('idle')
  const currentVersion = ref('')
  const version = ref('')
  const notes = ref('')
  const received = ref(0)
  const total = ref(0)
  const promptVisible = ref(false)
  const checking = ref(false)
  const percent = computed(() => (total.value > 0 ? Math.min(100, Math.floor((received.value / total.value) * 100)) : 0))

  function applyEvent(event: UpdaterEvent): void {
    if (event.type === 'available') {
      version.value = event.version
      notes.value = event.notes
      status.value = 'available'
      if (!prompted) {
        prompted = true
        promptVisible.value = true
      }
    } else if (event.type === 'progress') {
      status.value = 'downloading'
      received.value = event.received
      total.value = event.total
    } else if (event.type === 'downloaded') {
      status.value = 'ready'
      version.value = event.version
      if (total.value > 0) received.value = total.value
      message.success(`新版本 v${event.version} 已下载完成，可点击底部的下载按钮重启安装`, 8)
    } else if (event.type === 'error') {
      status.value = version.value ? 'available' : 'idle'
      message.error(event.message, 6)
    }
  }

  async function hydrate(): Promise<void> {
    if (bound) return
    bound = true
    window.guEarth.updater.onEvent(applyEvent)
    try {
      const state = await window.guEarth.updater.getState()
      currentVersion.value = state.currentVersion
      if (state.version) version.value = state.version
      received.value = state.received
      total.value = state.total
      if (state.status === 'available' && !prompted) {
        prompted = true
        promptVisible.value = true
      }
      status.value = state.status
    } catch {
      void 0
    }
  }

  function remindLater(): void {
    promptVisible.value = false
  }

  async function startDownload(): Promise<void> {
    promptVisible.value = false
    if (status.value !== 'available') return
    status.value = 'downloading'
    try {
      await window.guEarth.updater.download()
    } catch (error) {
      status.value = 'available'
      message.error(`无法开始下载：${stripIpcErrorPrefix(error)}`, 6)
    }
  }

  async function installNow(): Promise<void> {
    try {
      await window.guEarth.updater.install()
    } catch (error) {
      message.error(`无法启动安装：${stripIpcErrorPrefix(error)}`, 6)
    }
  }

  function reportCheckOutcome(outcome: UpdateCheckOutcome): void {
    if (outcome === 'available') message.success(`发现新版本 v${version.value}`)
    else if (outcome === 'latest') message.info('当前已是最新版本')
    else if (outcome === 'disabled') message.warning('当前环境不支持检查更新')
    else message.error('检查更新失败，请稍后重试')
  }

  async function checkNow(): Promise<void> {
    if (checking.value) return
    checking.value = true
    try {
      reportCheckOutcome(await window.guEarth.updater.check())
    } catch {
      message.error('检查更新失败，请稍后重试')
    } finally {
      checking.value = false
    }
  }

  return { status, currentVersion, version, notes, received, total, percent, promptVisible, checking, hydrate, remindLater, startDownload, installNow, checkNow }
})
