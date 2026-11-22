import { CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { useFailureStore, type FailureNotice } from '@renderer/stores/failure'
import { Alert, App, Button, Tooltip } from 'antd'
import { useEffect } from 'react'

import styles from './FailureBanner.module.css'

export interface FailureBannerProps {}

function alertType(notice: FailureNotice): 'error' | 'warning' {
  return notice.scope === 'terrain' || notice.scope === 'recording-quality' ? 'warning' : 'error'
}

export function FailureBanner(_props: FailureBannerProps) {
  const { message } = App.useApp()
  const active = useFailureStore(state => state.active)
  const degradationCount = useFailureStore(state => state.degradations.length)
  const retrying = useFailureStore(state => state.retrying)
  const takeDegradations = useFailureStore(state => state.takeDegradations)
  const retry = useFailureStore(state => state.retry)
  const clearFailure = useFailureStore(state => state.clearFailure)

  useEffect(() => {
    if (!degradationCount) return
    for (const notice of takeDegradations()) {
      void message.warning(notice.message, 6)
    }
  }, [degradationCount, takeDegradations, message])

  const bannerNotices = active.filter(notice => notice.scope !== 'webgl')
  if (!bannerNotices.length) return null

  return (
    <div className={styles.failureBanner}>
      {bannerNotices.map(notice => (
        <Alert
          key={notice.scope}
          type={alertType(notice)}
          showIcon
          className={styles.failureAlert}
          title={
            <span className={styles.failureText} title={notice.detail || notice.message}>
              {notice.message}
            </span>
          }
          action={
            <span className={styles.failureActions}>
              {notice.retryable && (
                <Button
                  type='text'
                  size='small'
                  loading={Boolean(retrying[notice.scope])}
                  icon={<ReloadOutlined />}
                  onClick={() => void retry(notice.scope)}
                >
                  重试
                </Button>
              )}
              <Tooltip title='忽略'>
                <Button
                  type='text'
                  size='small'
                  aria-label='忽略提示'
                  icon={<CloseOutlined />}
                  onClick={() => clearFailure(notice.scope)}
                />
              </Tooltip>
            </span>
          }
        />
      ))}
    </div>
  )
}

export default FailureBanner
