import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  dot?: boolean
  count?: number
  className?: string
  children?: ReactNode
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { dot = false, count, className, children, ...props },
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
          className="pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full bg-primary ring-2 ring-surface"
        />
      )}
      {showCount && (
        <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
})

export default Badge
