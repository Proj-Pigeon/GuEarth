import { Collapsible } from '@base-ui/react/collapsible'
import { cn } from '@renderer/lib/utils'
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ComponentRef } from 'react'

export const CollapsibleRoot = forwardRef<
  ComponentRef<typeof Collapsible.Root>,
  ComponentPropsWithoutRef<typeof Collapsible.Root>
>((props, ref) => <Collapsible.Root ref={ref} data-slot='collapsible' {...props} />)

export function CollapsibleTrigger({ className, ...props }: Collapsible.Trigger.Props) {
  return (
    <Collapsible.Trigger
      data-slot='collapsible-trigger'
      className={cn(
        'cursor-pointer border-0 bg-transparent text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className
      )}
      {...props}
    />
  )
}

export function CollapsibleContent({ className, ...props }: Collapsible.Panel.Props) {
  return (
    <Collapsible.Panel
      data-slot='collapsible-content'
      className={cn(
        'h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  )
}
