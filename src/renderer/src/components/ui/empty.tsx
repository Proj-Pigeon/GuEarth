import { cn } from '@renderer/lib/utils'
import { InboxIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface EmptyProps {
  description?: ReactNode
  icon?: ReactNode
  className?: string
  children?: ReactNode
}

export function Empty({ description = '暂无数据', icon, className, children }: EmptyProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}
    >
      <div className='bg-muted text-ink-tertiary flex size-10 items-center justify-center rounded-full'>
        {icon ?? <InboxIcon className='size-5' aria-hidden='true' />}
      </div>
      {description && <div className='text-ink-secondary text-[13px] leading-5'>{description}</div>}
      {children}
    </div>
  )
}

export default Empty
