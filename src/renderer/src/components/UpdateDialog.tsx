import { useUpdaterStore } from '@renderer/stores/updater'
import { tryRenderMarkdown } from '@renderer/utils/markdown'
import { Modal } from 'antd'
import { Component, useMemo, useState, type ReactNode } from 'react'

import styles from './UpdateDialog.module.css'

export interface UpdateDialogProps {}

interface MarkdownNotesBoundaryProps {
  onError: () => void
  children: ReactNode
}

interface MarkdownNotesBoundaryState {
  failed: boolean
}

class MarkdownNotesBoundary extends Component<
  MarkdownNotesBoundaryProps,
  MarkdownNotesBoundaryState
> {
  state: MarkdownNotesBoundaryState = { failed: false }

  static getDerivedStateFromError(): MarkdownNotesBoundaryState {
    return { failed: true }
  }

  componentDidCatch(): void {
    this.props.onError()
  }

  render(): ReactNode {
    if (this.state.failed) return null
    return this.props.children
  }
}

export function UpdateDialog(_props: UpdateDialogProps) {
  const promptVisible = useUpdaterStore(state => state.promptVisible)
  const currentVersion = useUpdaterStore(state => state.currentVersion)
  const version = useUpdaterStore(state => state.version)
  const notes = useUpdaterStore(state => state.notes)
  const startDownload = useUpdaterStore(state => state.startDownload)
  const remindLater = useUpdaterStore(state => state.remindLater)

  const [failedNotes, setFailedNotes] = useState<string | null>(null)
  const renderFailed = failedNotes === notes
  const hasNotes = notes.trim().length > 0
  const renderedNotes = useMemo(
    () => (renderFailed || !hasNotes ? null : tryRenderMarkdown(notes)),
    [renderFailed, hasNotes, notes]
  )

  return (
    <Modal
      open={promptVisible}
      title='发现可用更新'
      width={420}
      closable={false}
      maskClosable={false}
      keyboard={false}
      okText='立即更新'
      cancelText='下次提醒'
      onOk={() => void startDownload()}
      onCancel={remindLater}
    >
      <div className={styles.updateLine}>
        <span className={styles.updateLabel}>当前版本</span>
        <span className={styles.updateVersion}>v{currentVersion}</span>
      </div>
      <div className={styles.updateLine}>
        <span className={styles.updateLabel}>最新版本</span>
        <span className={`${styles.updateVersion} ${styles.updateVersionNew}`}>v{version}</span>
      </div>
      {renderedNotes ? (
        <MarkdownNotesBoundary key={notes} onError={() => setFailedNotes(notes)}>
          <div
            className={`${styles.updateNotes} ${styles.updateNotesMarkdown}`}
            role='region'
            aria-label='更新日志'
          >
            {renderedNotes}
          </div>
        </MarkdownNotesBoundary>
      ) : hasNotes ? (
        <p className={`${styles.updateNotes} ${styles.updateNotesPlain}`}>{notes}</p>
      ) : null}
    </Modal>
  )
}

export default UpdateDialog
