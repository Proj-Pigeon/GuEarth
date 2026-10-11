import { onBeforeUnmount, onMounted, watch } from 'vue'

export function useVisibleAnimation(enabled: () => boolean, tick: (seconds: number, now: number) => void): void {
  let frame = 0
  let previous = 0

  function stop(): void {
    cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  }

  function animate(now: number): void {
    frame = 0
    if (document.hidden || !enabled()) {
      previous = 0
      return
    }
    if (previous && now - previous < 1000 / 60) {
      frame = requestAnimationFrame(animate)
      return
    }
    const seconds = previous ? Math.min(0.05, (now - previous) / 1000) : 0
    previous = now
    tick(seconds, now)
    frame = requestAnimationFrame(animate)
  }

  function sync(): void {
    stop()
    if (!document.hidden && enabled()) frame = requestAnimationFrame(animate)
  }

  watch(enabled, sync, { immediate: true, flush: 'post' })
  onMounted(() => {
    document.addEventListener('visibilitychange', sync)
    sync()
  })
  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', sync)
  })
}
