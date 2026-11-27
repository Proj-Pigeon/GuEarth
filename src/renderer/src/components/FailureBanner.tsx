import { useEffect } from 'react'
import { RotateCwIcon, XIcon } from 'lucide-react'
import { Alert, Button, Tooltip, useToast } from '@renderer/components/ui'
import { useFailureStore } from '@renderer/stores/failure';
import type { FailureNotice } from '@renderer/stores/failure';
import styles from './FailureBanner.module.css'

export interface FailureBannerProps {}

function alertType(notice: FailureNotice): 'error' | 'warning' {
  return notice.scope === 'terrain' || notice.scope === 'recording-quality' ? 'warning' : 'error'
}

export function FailureBanner(_props: FailureBannerProps) {
  const toast = useToast()
  const active = useFailureStore((state) => state.active)
  const degradationCount = useFailureStore((state) => state.degradations.length)
  const retrying = useFailureStore((state) => state.retrying)
  const takeDegradations = useFailureStore((state) => state.takeDegradations)
  const retry = useFailureStore((state) => state.retry)
  const clearFailure = useFailureStore((state) => state.clearFailure)

  useEffect(() => {
    if (!degradationCount) {return}
    for (const notice of takeDegradations()) {
      toast.warning(notice.message, 6)
    }
  }, [degradationCount, takeDegradations, toast])

  const bannerNotices = active.filter((notice) => notice.scope !== 'webgl')
  if (bannerNotices.length === 0) {return null}

  return (
    <div className={styles.failureBanner}>
      {bannerNotices.map((notice) => (
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
                  variant="ghost"
                  size="sm"
                  loading={Boolean(retrying[notice.scope])}
                  icon={<RotateCwIcon className="size-3.5" />}
                  onClick={() => void retry(notice.scope)}
                >
                  重试
                </Button>
              )}
              <Tooltip title="忽略">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="忽略提示"
                  icon={<XIcon className="size-3.5" />}
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
