import type { ReactNode } from 'react'
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon, XIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export type AlertType = 'neutral' | 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  type?: AlertType
  title?: ReactNode
  description?: ReactNode
  showIcon?: boolean
  action?: ReactNode
  onClose?: () => void
  className?: string
}

const alertStyles: Record<AlertType, string> = {
  neutral: 'border-hairline bg-subtle text-ink',
  info: 'border-info/30 bg-info/[0.08] text-ink dark:border-info/35 dark:bg-info/[0.12]',
  success: 'border-success/30 bg-success/[0.08] text-ink dark:border-success/35 dark:bg-success/[0.12]',
  warning: 'border-warning/35 bg-warning/[0.09] text-ink dark:border-warning/35 dark:bg-warning/[0.12]',
  error: 'border-destructive/35 bg-destructive/[0.08] text-destructive dark:border-destructive/35 dark:bg-destructive/[0.12]'
}

function AlertIcon({ type }: { type: AlertType }) {
  if (type === 'info') {return <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />}
  if (type === 'success') {return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />}
  if (type === 'warning') {return <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
  if (type === 'error') {return <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
  return <InfoIcon className="mt-0.5 size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
}

export function Alert({
  type = 'info',
  title,
  description,
  showIcon = false,
  action,
  onClose,
  className
}: AlertProps) {
  return (
    <div
      role="alert"
      data-alert-type={type}
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] leading-5',
        alertStyles[type],
        className
      )}
    >
      {showIcon && <AlertIcon type={type} />}
      <div className="min-w-0 flex-1">
        {title && <div className="break-words font-medium">{title}</div>}
        {description && (
          <div className={cn('mt-0.5 break-words text-[12px] leading-5', type === 'error' ? 'text-destructive/85' : 'text-ink-secondary')}>
            {description}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      {onClose && (
        <button
          type="button"
          aria-label="关闭提示"
          onClick={onClose}
          className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-ink-tertiary transition-colors hover:bg-muted hover:text-ink"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export default Alert
