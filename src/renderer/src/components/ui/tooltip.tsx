import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { cn } from '@renderer/lib/utils'
import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProviderProps {
  children: ReactNode
  delay?: number
  closeDelay?: number
}

export function TooltipProvider({ children, delay = 350, closeDelay = 0 }: TooltipProviderProps) {
  return (
    <BaseTooltip.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </BaseTooltip.Provider>
  )
}

export interface TooltipProps {
  title?: ReactNode
  placement?: TooltipPlacement
  sideOffset?: number
  className?: string
  children: ReactElement<Record<string, unknown>>
}

export function Tooltip({
  title,
  placement = 'top',
  sideOffset = 6,
  className,
  children
}: TooltipProps) {
  if (!title) {
    return children
  }

  const triggerElement = isValidElement(children) ? children : <span>{children}</span>

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={triggerElement} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          side={placement}
          sideOffset={sideOffset}
          className='z-[1500] outline-none'
        >
          <BaseTooltip.Popup
            className={cn(
              'max-w-72 rounded-lg bg-foreground px-2.5 py-1 text-[12px] leading-4 text-background shadow-[var(--shadow-popup)] transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none',
              className
            )}
          >
            {title}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

export default Tooltip
