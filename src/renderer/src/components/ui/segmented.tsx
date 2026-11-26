import type { ReactNode } from 'react'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import { Toggle as BaseToggle } from '@base-ui/react/toggle'
import { cn } from '@renderer/lib/utils'

export interface SegmentedOption<T extends string | number = string> {
  label: ReactNode
  value: T
  disabled?: boolean
}

export type SegmentedOptionInput<T extends string | number = string> = T | SegmentedOption<T>

export interface SegmentedProps<T extends string | number = string> {
  value: T
  options: readonly SegmentedOptionInput<T>[]
  block?: boolean
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onChange?: (value: T) => void
}

function normalizeOption<T extends string | number>(item: SegmentedOptionInput<T>): SegmentedOption<T> {
  if (typeof item === 'string' || typeof item === 'number') {
    return { label: String(item), value: item }
  }
  return item
}

export function Segmented<T extends string | number = string>({
  value,
  options,
  block = false,
  size = 'md',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  onChange
}: SegmentedProps<T>) {
  const normalized = options.map(normalizeOption)

  return (
    <BaseToggleGroup
      data-slot="segmented"
      value={[String(value)]}
      disabled={disabled}
      aria-label={ariaLabel}
      onValueChange={(nextValues) => {
        const nextKey = nextValues[0]
        if (nextKey === undefined) {return}
        const matched = normalized.find((option) => String(option.value) === nextKey)
        if (matched) {onChange?.(matched.value)}
      }}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5',
        block && 'flex w-full',
        className
      )}
    >
      {normalized.map((option) => (
        <BaseToggle
          key={String(option.value)}
          value={String(option.value)}
          disabled={disabled || option.disabled}
          className={cn(
            'inline-flex cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent font-normal whitespace-nowrap text-ink-secondary transition-[background-color,color,box-shadow] duration-100 ease-out outline-none hover:not-data-[disabled]:text-ink focus-visible:ring-2 focus-visible:ring-ring/25 data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[pressed]:bg-surface data-[pressed]:font-medium data-[pressed]:text-ink data-[pressed]:shadow-xs motion-reduce:transition-none',
            size === 'sm' ? 'h-6 px-2 text-[12px] leading-4' : 'h-7 px-3 text-[13px] leading-5',
            block && 'min-w-0 flex-1'
          )}
        >
          {option.label}
        </BaseToggle>
      ))}
    </BaseToggleGroup>
  )
}

export default Segmented
