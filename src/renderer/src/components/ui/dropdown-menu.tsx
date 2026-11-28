import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cn } from '@renderer/lib/utils'
import { CheckIcon } from 'lucide-react'
import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

export interface DropdownMenuItem {
  type?: 'item'
  key: string
  label: ReactNode
  disabled?: boolean
  danger?: boolean
  className?: string
}

export interface DropdownMenuGroup {
  type: 'group'
  key: string
  label: ReactNode
  children: DropdownMenuItem[]
}

export interface DropdownMenuDivider {
  type: 'divider'
  key: string
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuGroup | DropdownMenuDivider

export type DropdownPlacement = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

function parseDropdownPlacement(placement: DropdownPlacement): {
  side: 'top' | 'bottom'
  align: 'start' | 'end'
} {
  if (placement === 'topLeft') {
    return { side: 'top', align: 'start' }
  }
  if (placement === 'topRight') {
    return { side: 'top', align: 'end' }
  }
  if (placement === 'bottomRight') {
    return { side: 'bottom', align: 'end' }
  }
  return { side: 'bottom', align: 'start' }
}

export interface DropdownMenuProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placement?: DropdownPlacement
  items: DropdownMenuEntry[]
  selectedKeys?: string[]
  menuClassName?: string
  popupClassName?: string
  onSelect?: (key: string) => void
  children: ReactElement<Record<string, unknown>>
}

const NO_SELECTED_KEYS: string[] = []

export function DropdownMenu({
  open,
  onOpenChange,
  placement = 'bottomLeft',
  items,
  selectedKeys = NO_SELECTED_KEYS,
  menuClassName,
  popupClassName,
  onSelect,
  children
}: DropdownMenuProps) {
  const { side, align } = parseDropdownPlacement(placement)
  const selectedSet = new Set(selectedKeys)
  const triggerElement = isValidElement(children) ? children : <span>{children}</span>

  const renderItem = (item: DropdownMenuItem) => {
    const selected = selectedSet.has(item.key)
    return (
      <BaseMenu.Item
        key={item.key}
        disabled={item.disabled}
        onClick={() => onSelect?.(item.key)}
        className={cn(
          'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-tertiary data-[highlighted]:bg-muted',
          selected && 'bg-active-fill font-medium',
          item.danger && 'text-destructive data-[highlighted]:bg-destructive/10',
          item.className
        )}
      >
        <div className='min-w-0 flex-1'>{item.label}</div>
        {selected && <CheckIcon className='text-ink size-3.5 shrink-0' aria-hidden='true' />}
      </BaseMenu.Item>
    )
  }

  return (
    <BaseMenu.Root open={open} onOpenChange={onOpenChange}>
      <BaseMenu.Trigger render={triggerElement} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          side={side}
          align={align}
          sideOffset={6}
          className='z-[1500] outline-none'
        >
          <BaseMenu.Popup
            className={cn(
              'max-h-80 min-w-36 overflow-y-auto rounded-xl border border-hairline bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popup)] outline-none transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none',
              popupClassName,
              menuClassName
            )}
          >
            {items.map(entry => {
              if (entry.type === 'divider') {
                return <BaseMenu.Separator key={entry.key} className='bg-hairline my-1 h-px' />
              }
              if (entry.type === 'group') {
                return (
                  <BaseMenu.Group key={entry.key} className='py-0.5'>
                    <BaseMenu.GroupLabel className='text-ink-tertiary px-2.5 py-1 text-[11px] font-medium'>
                      {entry.label}
                    </BaseMenu.GroupLabel>
                    {entry.children.map(renderItem)}
                  </BaseMenu.Group>
                )
              }
              return renderItem(entry)
            })}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export default DropdownMenu
