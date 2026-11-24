import { useEffect, useRef } from 'react'

export function useVisibleAnimation(
  enabled: boolean | (() => boolean),
  tick: (seconds: number, now: number) => void
): void {
  const isEnabled = typeof enabled === 'function' ? enabled() : enabled
  const tickRef = useRef(tick)
  const enabledRef = useRef(enabled)

  tickRef.current = tick
  enabledRef.current = enabled

  useEffect(() => {
    if (!isEnabled) return
    let frame = 0
    let previous = 0

    const active = (): boolean => {
      const current = enabledRef.current
      return typeof current === 'function' ? current() : current
    }

    const stop = (): void => {
      cancelAnimationFrame(frame)
      frame = 0
      previous = 0
    }

    const animate = (now: number): void => {
      frame = 0
      if (document.hidden || !active()) {
        previous = 0
        return
      }
      if (previous && now - previous < 1000 / 60) {
        frame = requestAnimationFrame(animate)
        return
      }
      const seconds = previous ? Math.min(0.05, (now - previous) / 1000) : 0
      previous = now
      tickRef.current(seconds, now)
      frame = requestAnimationFrame(animate)
    }

    const sync = (): void => {
      stop()
      if (!document.hidden && active()) frame = requestAnimationFrame(animate)
    }

    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [isEnabled])
}
