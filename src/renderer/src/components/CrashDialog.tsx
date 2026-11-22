import { CloseCircleFilled, CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { closeCrashDialog, useCrashDialogStore } from '@renderer/lib/crashReporter'
import { App as AntdApp, Button, Modal } from 'antd'
import { useState } from 'react'

import { logger } from '../../../common/logger'

import styles from './CrashDialog.module.css'

export interface CrashDialogProps {}

export function CrashDialog(_props: CrashDialogProps) {
  const { message: antdMessage } = AntdApp.useApp()
  const open = useCrashDialogStore(state => state.open)
  const crashMessage = useCrashDialogStore(state => state.message)
  const [copying, setCopying] = useState(false)

  async function copyLogs(): Promise<void> {
    setCopying(true)
    try {
      await window.guEarth.logs.copy(logger.dump())
      antdMessage.success('诊断日志已复制到剪贴板')
    } catch (error) {
      logger.warn('diagnostics', '复制诊断日志失败', error)
      antdMessage.error('复制失败，请重试')
    } finally {
      setCopying(false)
    }
  }

  function reloadApp(): void {
    window.location.reload()
  }

  return (
    <Modal
      open={open}
      maskClosable={false}
      width={440}
      onCancel={closeCrashDialog}
      title={
        <span className={styles.crashTitle}>
          <CloseCircleFilled className={styles.crashIcon} aria-hidden='true' />
          出现错误
        </span>
      }
      footer={
        <>
          <Button onClick={closeCrashDialog}>关闭</Button>
          <Button loading={copying} icon={<CopyOutlined />} onClick={() => void copyLogs()}>
            复制日志
          </Button>
          <Button type='primary' icon={<ReloadOutlined />} onClick={reloadApp}>
            重新加载
          </Button>
        </>
      }
    >
      <p className={styles.crashMessage}>{crashMessage}</p>
      <p className={styles.crashMeta}>可复制日志反馈给开发者排查问题。</p>
    </Modal>
  )
}

export default CrashDialog
