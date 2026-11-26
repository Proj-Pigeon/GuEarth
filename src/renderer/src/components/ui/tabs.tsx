import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { cn } from '@renderer/lib/utils'
import type { ReactNode } from 'react'

export interface TabItem {
  key: string
  label: ReactNode
}

export interface TabsProps {
  activeKey: string
  items: TabItem[]
  className?: string
  onChange?: (key: string) => void
}

export function Tabs({ activeKey, items, className, onChange }: TabsProps) {
  return (
    <BaseTabs.Root
      value={activeKey}
      onValueChange={next => {
        if (typeof next === 'string') {
          onChange?.(next)
        }
      }}
      className={cn('w-full', className)}
    >
      <BaseTabs.List className='border-hairline relative flex items-center gap-1 border-b'>
        {items.map(item => (
          <BaseTabs.Tab
            key={item.key}
            value={item.key}
            className='text-ink-secondary hover:text-ink focus-visible:ring-ring/25 data-[active]:text-ink relative cursor-pointer border-0 bg-transparent px-3 py-2 text-[13px] leading-5 transition-colors outline-none focus-visible:ring-2 data-[active]:font-medium'
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className='bg-primary absolute bottom-0 left-0 h-0.5 w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] rounded-full transition-[transform,width] duration-150 ease-out motion-reduce:transition-none' />
      </BaseTabs.List>
    </BaseTabs.Root>
  )
}

export default Tabs
