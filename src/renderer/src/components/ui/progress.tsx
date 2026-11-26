import { Progress as BaseProgress } from '@base-ui/react/progress'
import { cn } from '@renderer/lib/utils'

export interface ProgressProps {
  percent: number
  type?: 'line' | 'circle'
  size?: number
  strokeWidth?: number
  strokeColor?: string
  showInfo?: boolean
  className?: string
}

export function Progress({
  percent,
  type = 'line',
  size = 20,
  strokeWidth = 3,
  strokeColor,
  showInfo = false,
  className
}: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))

  if (type === 'circle') {
    const viewBoxSize = 24
    const normalizedStroke =
      strokeWidth > 8 ? Math.max(2, (strokeWidth / 100) * viewBoxSize) : Math.max(2, strokeWidth)
    const radius = (viewBoxSize - normalizedStroke) / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - clamped / 100)
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className={cn('shrink-0 -rotate-90', className)}
        role='progressbar'
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill='none'
          stroke='var(--hairline)'
          strokeWidth={normalizedStroke}
        />
        <circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill='none'
          stroke={strokeColor ?? 'var(--primary)'}
          strokeWidth={normalizedStroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap='round'
        />
      </svg>
    )
  }

  return (
    <BaseProgress.Root value={clamped} className={cn('flex w-full items-center gap-2', className)}>
      <BaseProgress.Track className='bg-muted h-1.5 flex-1 overflow-hidden rounded-full'>
        <BaseProgress.Indicator
          style={strokeColor ? { backgroundColor: strokeColor } : undefined}
          className='bg-primary h-full rounded-full transition-[width] duration-150 ease-out'
        />
      </BaseProgress.Track>
      {showInfo && (
        <span className='text-ink-secondary shrink-0 font-mono text-[12px]'>
          {Math.round(clamped)}%
        </span>
      )}
    </BaseProgress.Root>
  )
}

export default Progress
