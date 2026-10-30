import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { OnlineDataSnapshot } from '../../../common/onlineData'
import { useFailureStore } from './failure'

export const useOnlineDataStore = defineStore('onlineData', () => {
  const snapshot = shallowRef<OnlineDataSnapshot | null>(null)
  const loading = ref(true)
  const typhoonMode = ref<'live' | 'history'>('live')
  let pending: Promise<void> | null = null

  function setTyphoonMode(mode: 'live' | 'history'): void {
    typhoonMode.value = mode
  }

  function load(): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      const failure = useFailureStore()
      try {
        snapshot.value = await window.guEarth.datasets.getOnlineData()
        const data = snapshot.value
        if (data.earthquakeError) failure.reportDegrade(data.earthquakeError)
        if (data.typhoonError) failure.reportDegrade(`${data.typhoonError}；${data.typhoons ? '显示带时间标注的缓存台风数据' : '本次无法显示在线台风'}，下次启动重试`)
      } catch {
        failure.reportDegrade('启动在线数据读取失败，请重新启动应用')
      } finally {
        loading.value = false
      }
    })()
    return pending
  }

  return { snapshot, loading, typhoonMode, setTyphoonMode, load }
})
