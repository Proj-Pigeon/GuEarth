import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface SwitchProps {
  checked: boolean
  disabled?: boolean
  loading?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
  onChange?: (checked: boolean) => void
}

export function Switch({
  checked,
  disabled = false,
  loading = false,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  onChange
}: SwitchProps) {
  const isDisabled = disabled || loading
  const small = size === 'sm'

  return (
    <BaseSwitch.Root
      data-slot="switch"
      checked={checked}
      disabled={isDisabled}
      aria-label={ariaLabel}
      onCheckedChange={(next) => onChange?.(next)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong p-0.5 transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 motion-reduce:transition-none',
        small ? 'h-[18px] w-8' : 'h-[22px] w-10',
        className
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          'flex items-center justify-center rounded-full bg-surface shadow-xs transition-transform duration-150 ease-out data-[checked]:bg-primary-foreground motion-reduce:transition-none',
          small
            ? 'size-3.5 data-[checked]:translate-x-3.5'
            : 'size-[18px] data-[checked]:translate-x-[18px]'
        )}
      >
        {loading && <Loader2Icon className="size-2.5 animate-spin text-ink-secondary" aria-hidden="true" />}
      </BaseSwitch.Thumb>
    </BaseSwitch.Root>
  )
}

export default Switch
