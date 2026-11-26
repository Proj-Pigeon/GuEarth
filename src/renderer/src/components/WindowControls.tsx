import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontalIcon, MinusIcon, SquareIcon, XIcon } from 'lucide-react'
import type { WindowControlsState } from '../../../preload'
import styles from './WindowControls.module.css'

function RestoreIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="6.5" height="6.5" rx="1" />
      <path d="M4.2 4V2.5a1 1 0 0 1 1-1h4.3a1 1 0 0 1 1 1v4.3a1 1 0 0 1-1 1H8.5" />
    </svg>
  )
}

export function WindowControls() {
  const [state, setState] = useState<WindowControlsState>(() => ({
    maximized: false,
    fullScreen: false,
    platform: window.guEarth?.platform ?? ''
  }))

  useEffect(() => {
    const api = window.guEarth?.windowControls
    if (!api) return
    let active = true
    void api.getState().then((initial) => {
      if (active) setState(initial)
    })
    const unsubscribe = api.onStateChange((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.fullscreen = state.fullScreen ? 'true' : 'false'
    return () => {
      delete document.documentElement.dataset.fullscreen
    }
  }, [state.fullScreen])

  if (!window.guEarth?.windowControls) return null

  const isMac = state.platform === 'darwin'
  const expanded = state.maximized || state.fullScreen

  function handleMinimize(): void {
    void window.guEarth.windowControls.minimize()
  }

  function handleToggleMaximize(): void {
    void window.guEarth.windowControls.toggleMaximize()
  }

  function handleClose(): void {
    void window.guEarth.windowControls.close()
  }

  const dragStripClass = [
    styles.dragStrip,
    expanded ? styles.dragStripMaximized : '',
    isMac && !state.fullScreen ? styles.dragStripDarwin : ''
  ]
    .filter(Boolean)
    .join(' ')

  const controlsPill = (
    <div className={styles.controlsPill} role="toolbar" aria-label="窗口控制">
      <div className={styles.dragHandle} title="拖动窗口">
        <GripHorizontalIcon className="size-3.5" aria-hidden="true" />
      </div>
      <button
        type="button"
        className={styles.controlButton}
        aria-label="最小化"
        title="最小化"
        onClick={handleMinimize}
      >
        <MinusIcon className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.controlButton}
        aria-label={expanded ? '还原窗口' : '最大化'}
        title={expanded ? '还原' : '最大化'}
        onClick={handleToggleMaximize}
      >
        {expanded ? <RestoreIcon /> : <SquareIcon className="size-3" aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={`${styles.controlButton} ${styles.closeButton}`}
        aria-label="关闭窗口"
        title="关闭"
        onClick={handleClose}
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <>
      <div className={dragStripClass} aria-hidden="true" />
      {!isMac && typeof document !== 'undefined' ? createPortal(controlsPill, document.body) : null}
    </>
  )
}

export default WindowControls
