import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { OnlineDataSnapshot } from '../../../common/onlineData'
import { useFailureStore } from './failure'

export const useOnlineDataStore = defineStore('onlineData', () => {
  const snapshot = shallowRef<OnlineDataSnapshot | null>(null)
  const loading = ref(true)
  const typhoonMode = ref<'live' | 'history'>('live')
  const typhoonLoading = computed(() => snapshot.value?.typhoonStatus === 'pending' || snapshot.value?.typhoonStatus === 'loading')
  let pending: Promise<void> | null = null

  function applySnapshot(data: OnlineDataSnapshot): void {
    if (snapshot.value && data.revision <= snapshot.value.revision) return
    const previous = snapshot.value
    snapshot.value = data
    const failure = useFailureStore()
    if (data.earthquakeError && data.earthquakeError !== previous?.earthquakeError) failure.reportDegrade(data.earthquakeError)
    if (data.typhoonError && data.typhoonError !== previous?.typhoonError) {
      failure.reportDegrade(`${data.typhoonError}${data.typhoons ? '，暂显示上次台风数据' : ''}`)
    }
  }

  onScopeDispose(window.guEarth.datasets.onOnlineData(applySnapshot))

  function setTyphoonMode(mode: 'live' | 'history'): void {
    typhoonMode.value = mode
  }

  function load(): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      try {
        applySnapshot(await window.guEarth.datasets.getOnlineData())
      } catch {
        useFailureStore().reportDegrade('在线数据加载失败，请重启应用重试')
      } finally {
        loading.value = false
      }
    })()
    return pending
  }

  async function ensureTyphoons(retry = false): Promise<void> {
    await load()
    const status = snapshot.value?.typhoonStatus
    if (status !== 'pending' && !(retry && status === 'error')) return
    try {
      applySnapshot(await window.guEarth.datasets.ensureTyphoons(retry))
    } catch {
      useFailureStore().reportDegrade('台风数据加载失败，请重试')
    }
  }

  return { snapshot, loading, typhoonLoading, typhoonMode, setTyphoonMode, load, ensureTyphoons }
})
