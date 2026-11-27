import type { MouseEvent, ReactNode } from 'react'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { Radio as BaseRadio } from '@base-ui/react/radio'
import { cn } from '@renderer/lib/utils'

export interface RadioGroupProps {
  value?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onChange?: (value: string) => void
  children?: ReactNode
}

export function RadioGroup({
  value,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  onChange,
  children
}: RadioGroupProps) {
  return (
    <BaseRadioGroup
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onValueChange={(next) => {
        if (typeof next === 'string') {onChange?.(next)}
      }}
      className={cn('flex flex-col gap-2', className)}
    >
      {children}
    </BaseRadioGroup>
  )
}

export interface RadioItemProps {
  value: string
  disabled?: boolean
  className?: string
  children?: ReactNode
}

export function RadioItem({ value, disabled = false, className, children }: RadioItemProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-ink select-none',
        disabled && 'cursor-not-allowed text-ink-disabled',
        className
      )}
    >
      <BaseRadio.Root
        value={value}
        disabled={disabled}
        className="mt-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-elevated transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-[checked]:border-primary data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
      >
        <BaseRadio.Indicator className="size-1.5 rounded-full bg-primary-foreground data-[unchecked]:hidden" />
      </BaseRadio.Root>
      {children && <span className="min-w-0 flex-1">{children}</span>}
    </label>
  )
}

export interface RadioDotProps {
  checked: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onChange?: () => void
}

export function RadioDot({
  checked,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  onClick,
  onChange
}: RadioDotProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (!checked) {onChange?.()}
      }}
      className={cn(
        'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-elevated p-0 transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-45',
        checked && 'border-primary bg-primary',
        className
      )}
    >
      {checked && <span className="size-1.5 rounded-full bg-primary-foreground" />}
    </button>
  )
}

export default RadioGroup
