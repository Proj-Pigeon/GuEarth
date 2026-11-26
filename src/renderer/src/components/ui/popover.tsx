import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover'
import { cn } from '@renderer/lib/utils'

export type PopoverPlacement = 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'left' | 'right'

function parsePlacement(placement: PopoverPlacement): {
  side: 'top' | 'bottom' | 'left' | 'right'
  align: 'start' | 'center' | 'end'
} {
  if (placement === 'topLeft') {return { side: 'top', align: 'start' }}
  if (placement === 'topRight') {return { side: 'top', align: 'end' }}
  if (placement === 'bottomLeft') {return { side: 'bottom', align: 'start' }}
  if (placement === 'bottomRight') {return { side: 'bottom', align: 'end' }}
  return { side: placement, align: 'center' }
}

export interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placement?: PopoverPlacement
  sideOffset?: number
  content: ReactNode
  className?: string
  children: ReactElement<Record<string, unknown>>
}

export function Popover({
  open,
  onOpenChange,
  placement = 'top',
  sideOffset = 8,
  content,
  className,
  children
}: PopoverProps) {
  const { side, align } = parsePlacement(placement)
  const triggerElement = isValidElement(children) ? children : <span>{children}</span>

  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={triggerElement} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-[1500] outline-none">
          <BasePopover.Popup
            className={cn(
              'rounded-xl border border-hairline bg-popover p-3 text-popover-foreground shadow-[var(--shadow-popup)] outline-none transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none',
              className
            )}
          >
            {content}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

export default Popover
