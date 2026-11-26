import { useScrollLock } from '@assistant-ui/react'
import type { MessagePrimitive } from '@assistant-ui/react'
import { cn } from '@renderer/lib/utils'
import { CheckIcon, ChevronRightIcon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from './collapsible'

const ANIMATION_DURATION = 200

export type EoqToolGroupPart = MessagePrimitive.GroupedParts.GroupPart

export interface EoqToolGroupProps {
  group: EoqToolGroupPart
  failedCount: number
  children: ReactNode
}

export function EoqToolGroup({ group, failedCount, children }: EoqToolGroupProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lockScroll = useScrollLock(rootRef, ANIMATION_DURATION)
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      lockScroll()
      setUserOpen(nextOpen)
    },
    [lockScroll]
  )

  const total = group.indices.length
  if (total <= 1) {
    return children
  }

  const running = group.status.type === 'running'
  const completedCount = Math.max(0, total - group.counts.running)
  const isOpen = userOpen ?? (running || failedCount > 0)

  const label = running
    ? `正在调用工具 (${completedCount}/${total})`
    : failedCount > 0
      ? `已调用 ${total} 个工具（${failedCount} 项失败）`
      : `已调用 ${total} 个工具`

  return (
    <CollapsibleRoot
      ref={rootRef}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className='group/tool-group w-full'
    >
      <CollapsibleTrigger className='group/trigger text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 rounded-md py-1 text-[12px] leading-5 transition-colors duration-100'>
        <ChevronRightIcon className='size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none' />
        <span
          className={cn(
            'leading-5 tabular-nums',
            running
              ? 'shimmer text-foreground/80 motion-reduce:animate-none'
              : failedCount > 0
                ? 'text-destructive'
                : 'text-foreground/65'
          )}
        >
          {label}
        </span>
        <span className='ml-auto flex shrink-0 items-center pl-1'>
          {running ? (
            <Loader2Icon className='text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
          ) : failedCount > 0 ? (
            <XCircleIcon className='animate-eoq-pop text-destructive size-3.5 shrink-0' />
          ) : (
            <CheckIcon className='animate-eoq-pop text-success size-3.5 shrink-0' />
          )}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className='border-border mt-0.5 ml-1.5 flex flex-col gap-0.5 border-l pl-3'>
          {children}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

export default EoqToolGroup
