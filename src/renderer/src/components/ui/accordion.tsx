import type { ReactNode } from 'react'
import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface AccordionItemConfig {
  key: string
  label: ReactNode
  children: ReactNode
}

export interface AccordionProps {
  items: AccordionItemConfig[]
  defaultOpenKeys?: string[]
  className?: string
}

export function Accordion({ items, defaultOpenKeys, className }: AccordionProps) {
  return (
    <BaseAccordion.Root
      defaultValue={defaultOpenKeys}
      className={cn('divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface', className)}
    >
      {items.map((item) => (
        <BaseAccordion.Item key={item.key} value={item.key}>
          <BaseAccordion.Header className="m-0">
            <BaseAccordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left text-[13px] leading-5 font-medium text-ink transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/25">
              <span>{item.label}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-ink-tertiary transition-transform duration-150 group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height,opacity] duration-150 ease-out data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="border-t border-hairline px-3.5 py-3">{item.children}</div>
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  )
}

export default Accordion
