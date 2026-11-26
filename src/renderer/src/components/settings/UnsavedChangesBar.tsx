import { useEffect, useState } from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui'
import styles from './UnsavedChangesBar.module.css'

export interface UnsavedChangesBarProps {
  open: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

export function UnsavedChangesBar({ open, saving, onSave, onDiscard }: UnsavedChangesBarProps) {
  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      const frame = requestAnimationFrame(() => {
        setVisible(true)
      })
      return () => cancelAnimationFrame(frame)
    }
    setVisible(false)
    const timer = setTimeout(() => {
      setRendered(false)
    }, 220)
    return () => clearTimeout(timer)
  }, [open])

  if (!rendered) {return null}

  return (
    <div
      className={visible ? `${styles.unsavedBar} ${styles.unsavedBarVisible}` : styles.unsavedBar}
      role="region"
      aria-label="未保存的改动"
      aria-live="polite"
      onTransitionEnd={() => {
        if (!open) {setRendered(false)}
      }}
    >
      <AlertCircleIcon className={styles.unsavedBarIcon} aria-hidden="true" />
      <span className={styles.unsavedBarText}>您似乎有新的改动！</span>
      <div className={styles.unsavedBarActions}>
        <Button disabled={saving} onClick={onDiscard}>
          舍弃
        </Button>
        <Button variant="primary" loading={saving} onClick={onSave}>
          保存
        </Button>
      </div>
    </div>
  )
}

export default UnsavedChangesBar
