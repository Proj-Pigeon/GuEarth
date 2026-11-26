import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export type TagTone = 'neutral' | 'outline' | 'info' | 'success' | 'warning' | 'error'

export interface TagProps {
  tone?: TagTone
  className?: string
  children?: ReactNode
}

const toneClasses: Record<TagTone, string> = {
  neutral: 'border-transparent bg-muted text-ink-secondary',
  outline: 'border-border-strong bg-transparent text-ink-secondary',
  info: 'border-info/25 bg-info/[0.09] text-info dark:border-info/30 dark:bg-info/[0.14]',
  success: 'border-success/25 bg-success/[0.09] text-success dark:border-success/30 dark:bg-success/[0.14]',
  warning: 'border-warning/30 bg-warning/[0.09] text-warning dark:border-warning/30 dark:bg-warning/[0.14]',
  error: 'border-destructive/30 bg-destructive/[0.09] text-destructive dark:border-destructive/30 dark:bg-destructive/[0.14]'
}

export function Tag({ tone = 'neutral', className, children }: TagProps) {
  return (
    <span
      data-slot="tag"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] leading-4 font-normal whitespace-nowrap',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export default Tag
