import { CloseCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { ToolStep } from '@renderer/stores/ai'
import SearchSources from './SearchSources'
import styles from './WebSearchStep.module.css'

export interface WebSearchStepProps {
  step: ToolStep
  busy: boolean
  onRetry?: (query: string) => void
}

function extractStepError(step: ToolStep): string {
  try {
    const parsed = JSON.parse(step.result) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : step.summary
  } catch {
    return step.summary
  }
}

export function WebSearchStep({ step, busy, onRetry }: WebSearchStepProps) {
  const query = typeof step.args.query === 'string' ? step.args.query : ''
  const error = extractStepError(step)

  return (
    <div className={styles.webSearch}>
      <span className={styles.webSearchQuery} title={query}>
        <SearchOutlined className={styles.webSearchIcon} />
        {query}
      </span>
      {step.status !== 'error' && (
        <SearchSources references={step.references ?? []} searching={step.status === 'running'} />
      )}
      {step.status === 'error' ? (
        <div className={styles.webSearchError} role="alert">
          <CloseCircleOutlined />
          <span className={styles.webSearchErrorText}>{error || '搜索失败，请稍后重试'}</span>
          <Button
            type="link"
            size="small"
            className={styles.webSearchRetry}
            icon={<ReloadOutlined />}
            disabled={busy || !query}
            onClick={() => onRetry?.(query)}
          >
            重新搜索
          </Button>
        </div>
      ) : step.status === 'ok' && !step.references?.length ? (
        <div className={styles.webSearchEmpty}>
          <span>未找到相关网页</span>
          <Button
            type="link"
            size="small"
            className={styles.webSearchRetry}
            icon={<ReloadOutlined />}
            disabled={busy || !query}
            onClick={() => onRetry?.(query)}
          >
            重新搜索
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default WebSearchStep
