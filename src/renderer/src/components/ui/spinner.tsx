import type { ReactNode } from 'react'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface SpinnerProps {
  spinning?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: ReactNode
}

const sizeClasses = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-7'
}

export function Spinner({ spinning = true, size = 'md', className, children }: SpinnerProps) {
  if (!children) {
    if (!spinning) return null
    return (
      <Loader2Icon
        role="status"
        aria-label="加载中"
        className={cn('animate-spin text-ink-secondary', sizeClasses[size], className)}
      />
    )
  }

  return (
    <div className={cn('relative', className)}>
      <div className={cn(spinning && 'pointer-events-none opacity-50 transition-opacity')}>
        {children}
      </div>
      {spinning && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2Icon role="status" aria-label="加载中" className={cn('animate-spin text-ink', sizeClasses[size])} />
        </div>
      )}
    </div>
  )
}

export default Spinner
