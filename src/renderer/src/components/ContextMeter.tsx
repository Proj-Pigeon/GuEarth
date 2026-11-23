import { useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CompressOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import { Button, Popover, Progress } from 'antd'
import type { AiContextStats } from '../../../preload'
import type { ContextCompressionStatus } from '@renderer/stores/ai'
import styles from './ContextMeter.module.css'

export interface ContextMeterProps {
  stats: AiContextStats
  status: ContextCompressionStatus
  notice: string
  disabled?: boolean
  onCompress?: () => void
}

interface Segment {
  key: string
  label: string
  tokens: number
  color: string
}

const CATEGORY_COLORS: Record<string, string> = {
  system: '#eb2f96',
  user: '#1677ff',
  assistant: '#fa8c16',
  tool: '#52c41a'
}

const FREE_COLOR = '#f0f0f0'

function formatTokens(tokens: number): string {
  const trim = (value: string): string => value.replace(/\.0$/, '')
  if (tokens >= 1_000_000) return `${trim((tokens / 1_000_000).toFixed(1))}M`
  if (tokens <= 0) return '0'
  if (tokens < 1_000) return `${Math.max(0.1, tokens / 1_000).toFixed(1)}k`
  return `${trim((tokens / 1_000).toFixed(1))}k`
}

function formatShare(share: number | undefined): string {
  return `${(share ?? 0).toFixed(1)}%`
}

export function ContextMeter({
  stats,
  status,
  notice,
  disabled = false,
  onCompress
}: ContextMeterProps) {
  const [open, setOpen] = useState(false)

  const percent = Math.min(100, Math.max(0, Math.round(stats.usagePercent)))
  const tone = percent >= 80 ? 'error' : percent > 70 ? 'warning' : 'normal'
  const strokeColor = tone === 'error' ? '#ff4d4f' : tone === 'warning' ? '#faad14' : '#1677ff'
  const statusText =
    status === 'compressing'
      ? '正在整理对话…'
      : status === 'error'
        ? '整理失败'
        : notice || `${percent}%`

  const segments = useMemo<Segment[]>(() => {
    const used = stats.categories.filter((category) => category.tokens > 0)
    const free = Math.max(0, stats.contextWindow - stats.usedTokens)
    return [
      ...used.map((category) => ({
        key: category.key,
        label: category.label,
        tokens: category.tokens,
        color: CATEGORY_COLORS[category.key] ?? '#8c8c8c'
      })),
      ...(free > 0 ? [{ key: 'free', label: '剩余空间', tokens: free, color: FREE_COLOR }] : [])
    ]
  }, [stats.categories, stats.contextWindow, stats.usedTokens])

  const windowShare = useMemo(
    () =>
      new Map(
        segments.map((segment) => [
          segment.key,
          stats.contextWindow > 0 ? (segment.tokens / stats.contextWindow) * 100 : 0
        ])
      ),
    [segments, stats.contextWindow]
  )

  const popoverContent = (
    <div className={styles.contextCard}>
      <div className={styles.contextCardHead}>
        <span className={styles.contextCardTitle}>对话容量</span>
        <span className={styles.contextCardTotal}>
          {formatTokens(stats.usedTokens)} / {formatTokens(stats.contextWindow)} ({percent}%)
        </span>
      </div>
      <div className={styles.contextBar}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={styles.contextBarSegment}
            style={{ flexGrow: segment.tokens, background: segment.color }}
          />
        ))}
      </div>
      <div className={styles.contextLegend}>
        {segments.map((segment) => (
          <div key={segment.key} className={styles.contextLegendRow}>
            <span className={styles.contextLegendChip} style={{ background: segment.color }} />
            <span className={styles.contextLegendLabel}>{segment.label}</span>
            <span className={styles.contextLegendTokens}>{formatTokens(segment.tokens)}</span>
            <span className={styles.contextLegendShare}>
              {formatShare(windowShare.get(segment.key))}
            </span>
          </div>
        ))}
      </div>
      <Button
        type="primary"
        size="small"
        block
        loading={status === 'compressing'}
        icon={<CompressOutlined />}
        disabled={disabled || stats.usedTokens === 0}
        onClick={() => onCompress?.()}
      >
        精简对话
      </Button>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      content={popoverContent}
    >
      <button
        type="button"
        className={`context-meter ${styles.contextMeter}`}
        aria-expanded={open}
        aria-label="查看上下文窗口"
      >
        <span className={styles.contextRing}>
          <Progress
            type="circle"
            percent={percent}
            size={24}
            strokeWidth={14}
            strokeColor={strokeColor}
            showInfo={false}
          />
        </span>
        <span className={styles.contextStatus}>
          {status === 'compressing' ? (
            <LoadingOutlined spin />
          ) : status === 'error' ? (
            <CloseCircleOutlined />
          ) : notice ? (
            <CheckCircleOutlined />
          ) : null}
          <span
            className={
              status === 'compressing'
                ? `${styles.contextStatusText} eoq-thinking-shimmer`
                : styles.contextStatusText
            }
          >
            {statusText}
          </span>
        </span>
      </button>
    </Popover>
  )
}

export default ContextMeter
