import { useMemo } from 'react'
import { Slider as BaseSlider } from '@base-ui/react/slider'
import { cn } from '@renderer/lib/utils'

export interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  marks?: Record<number | string, string>
  className?: string
  'aria-label'?: string
  onChange?: (value: number) => void
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  marks,
  className,
  'aria-label': ariaLabel,
  onChange
}: SliderProps) {
  const markEntries = useMemo(() => {
    if (!marks) {return []}
    const span = max - min || 1
    return Object.entries(marks).map(([key, label]) => {
      const numeric = Number(key)
      const percent = Math.min(100, Math.max(0, ((numeric - min) / span) * 100))
      return { key, numeric, label, percent }
    })
  }, [marks, max, min])

  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => {
        const numeric = Array.isArray(next) ? next[0] : next
        if (typeof numeric === 'number') {onChange?.(numeric)}
      }}
      className={cn('w-full select-none', markEntries.length > 0 && 'pb-4', className)}
    >
      <BaseSlider.Control className="flex h-5 w-full cursor-pointer items-center touch-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45">
        <BaseSlider.Track className="relative h-1 w-full rounded-full bg-border-strong">
          <BaseSlider.Indicator className="h-full rounded-full bg-primary" />
          <BaseSlider.Thumb
            aria-label={ariaLabel}
            className="size-3.5 rounded-full border-2 border-primary bg-surface shadow-xs outline-none transition-transform duration-100 hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {markEntries.length > 0 && (
        <div className="relative mt-0.5 h-3.5 w-full">
          {markEntries.map((mark) => (
            <span
              key={mark.key}
              style={{ left: `${mark.percent}%` }}
              className={cn(
                'absolute top-0 font-mono text-[10px] leading-3.5 whitespace-nowrap text-ink-tertiary',
                mark.percent <= 2
                  ? 'translate-x-0'
                  : mark.percent >= 98
                    ? '-translate-x-full'
                    : '-translate-x-1/2'
              )}
            >
              {mark.label}
            </span>
          ))}
        </div>
      )}
    </BaseSlider.Root>
  )
}

export default Slider
