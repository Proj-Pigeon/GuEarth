import type { ReactNode } from 'react'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface CheckboxProps {
  checked: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onChange?: (checked: boolean) => void
  children?: ReactNode
}

export function Checkbox({
  checked,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  onChange,
  children
}: CheckboxProps) {
  const control = (
    <BaseCheckbox.Root
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(next) => onChange?.(next)}
      className={cn(
        'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-border-strong bg-elevated text-primary-foreground transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-[checked]:border-primary data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
        !children && className
      )}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center data-[unchecked]:hidden">
        <CheckIcon className="size-3 stroke-[2.5]" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )

  if (!children) return control

  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-[13px] leading-5 text-ink select-none',
        disabled && 'cursor-not-allowed text-ink-disabled',
        className
      )}
    >
      {control}
      <span>{children}</span>
    </label>
  )
}

export default Checkbox
