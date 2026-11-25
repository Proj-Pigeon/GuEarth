import type { ReactNode } from 'react'
import { InboxIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface EmptyProps {
  description?: ReactNode
  icon?: ReactNode
  className?: string
  children?: ReactNode
}

export function Empty({ description = '暂无数据', icon, className, children }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-ink-tertiary">
        {icon ?? <InboxIcon className="size-5" aria-hidden="true" />}
      </div>
      {description && <div className="text-[13px] leading-5 text-ink-secondary">{description}</div>}
      {children}
    </div>
  )
}

export default Empty
