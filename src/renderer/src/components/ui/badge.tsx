import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export type BadgeTone = 'primary' | 'info' | 'success' | 'warning' | 'error'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  dot?: boolean
  count?: number
  tone?: BadgeTone
  className?: string
  children?: ReactNode
}

const dotToneClasses: Record<BadgeTone, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive'
}

const countToneClasses: Record<BadgeTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  info: 'bg-info text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-destructive text-destructive-foreground'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { dot = false, count, tone = 'primary', className, children, ...props },
  ref
) {
  const showDot = dot && count === undefined
  const showCount = typeof count === 'number' && count > 0
  return (
    <span ref={ref} className={cn('relative inline-flex', className)} {...props}>
      {children}
      {showDot && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full ring-2 ring-surface',
            dotToneClasses[tone]
          )}
        />
      )}
      {showCount && (
        <span
          className={cn(
            'pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium',
            countToneClasses[tone]
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
})

export default Badge
