import { NumberField as BaseNumberField } from '@base-ui/react/number-field'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface NumberInputProps {
  value?: number | null
  min?: number
  max?: number
  step?: number
  size?: 'sm' | 'md'
  disabled?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
  onChange?: (value: number | null) => void
}

export function NumberInput({
  value,
  min,
  max,
  step = 1,
  size = 'md',
  disabled = false,
  placeholder,
  className,
  'aria-label': ariaLabel,
  onChange
}: NumberInputProps) {
  return (
    <BaseNumberField.Root
      value={value ?? null}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => onChange?.(next)}
      className={cn('inline-flex', className)}
    >
      <BaseNumberField.Group
        className={cn(
          'inline-flex w-full items-center overflow-hidden border border-border-strong bg-elevated text-ink transition-[border-color,box-shadow] duration-100 ease-out focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/12',
          size === 'sm' ? 'h-7 rounded-md text-[12px]' : 'h-8 rounded-lg text-[13px]',
          disabled && 'cursor-not-allowed border-hairline bg-muted/60 text-ink-disabled'
        )}
      >
        <BaseNumberField.Decrement
          aria-label="减少"
          className="inline-flex h-full w-6 shrink-0 cursor-pointer items-center justify-center border-0 border-r border-hairline bg-transparent text-ink-secondary transition-colors hover:bg-muted hover:text-ink disabled:cursor-not-allowed disabled:text-ink-disabled"
        >
          <MinusIcon className="size-3" />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input
          aria-label={ariaLabel}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent px-2 text-center font-mono text-inherit outline-none placeholder:text-ink-tertiary disabled:cursor-not-allowed"
        />
        <BaseNumberField.Increment
          aria-label="增加"
          className="inline-flex h-full w-6 shrink-0 cursor-pointer items-center justify-center border-0 border-l border-hairline bg-transparent text-ink-secondary transition-colors hover:bg-muted hover:text-ink disabled:cursor-not-allowed disabled:text-ink-disabled"
        >
          <PlusIcon className="size-3" />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  )
}

export default NumberInput
