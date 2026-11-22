import { useScrollLock } from '@assistant-ui/react'
import { cn } from '@renderer/lib/utils'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from './collapsible'

const ANIMATION_DURATION = 200

function formatReasoningDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs <= 0) return '已深度思考'
  const seconds = durationMs / 1000
  return seconds < 1 ? '已思考 <1s' : `已思考 ${Math.round(seconds)}s`
}

export interface EoqReasoningProps {
  streaming: boolean
  durationMs?: number
  children: ReactNode
}

export function EoqReasoning({ streaming, durationMs, children }: EoqReasoningProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lockScroll = useScrollLock(rootRef, ANIMATION_DURATION)

  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const isOpen = userOpen ?? streaming
  const isPreview = streaming && isOpen

  const prevStreamingRef = useRef(streaming)
  useLayoutEffect(() => {
    if (prevStreamingRef.current === streaming) return
    prevStreamingRef.current = streaming
    if (userOpen === null) lockScroll()
  }, [lockScroll, streaming, userOpen])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      lockScroll()
      setUserOpen(nextOpen)
    },
    [lockScroll]
  )

  useEffect(() => {
    if (!isPreview) return
    const scrollEl = scrollRef.current
    const contentEl = contentRef.current
    if (!scrollEl || !contentEl) return

    let pinned = true
    let lastScrollTop = scrollEl.scrollTop
    let lastScrollHeight = scrollEl.scrollHeight

    const isAtBottom = () =>
      Math.abs(scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) <= 2 ||
      scrollEl.scrollHeight <= scrollEl.clientHeight

    const pin = () => {
      if (!pinned) return
      scrollEl.scrollTop = scrollEl.scrollHeight
    }

    const onScroll = () => {
      if (isAtBottom()) {
        pinned = true
      } else if (scrollEl.scrollTop < lastScrollTop && scrollEl.scrollHeight === lastScrollHeight) {
        pinned = false
      }
      lastScrollTop = scrollEl.scrollTop
      lastScrollHeight = scrollEl.scrollHeight
    }

    pin()
    scrollEl.addEventListener('scroll', onScroll)
    const observer = new ResizeObserver(pin)
    observer.observe(contentEl)
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [isPreview])

  return (
    <CollapsibleRoot
      ref={rootRef}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className='group/reasoning w-full'
    >
      <CollapsibleTrigger className='group/trigger text-muted-foreground hover:text-foreground flex w-fit max-w-full items-center gap-1.5 rounded-md py-1 text-[12px] leading-5 transition-colors duration-100'>
        <BrainIcon className='size-3.5 shrink-0 opacity-75' />
        <span
          className={cn(
            'inline-block tabular-nums leading-5',
            streaming && 'shimmer motion-reduce:animate-none'
          )}
        >
          {streaming ? '正在深度思考' : formatReasoningDuration(durationMs)}
        </span>
        <ChevronDownIcon className='size-3.5 shrink-0 -rotate-90 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[panel-open]/trigger:rotate-0 motion-reduce:transition-none' />
      </CollapsibleTrigger>
      <CollapsibleContent aria-busy={streaming}>
        <div className='border-border relative mt-1 ml-1.5 border-l pl-3'>
          <div className='from-background pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b to-transparent' />
          <div
            ref={scrollRef}
            className='reasoning-text text-muted-foreground max-h-48 overflow-y-auto py-1.5 text-[12px] leading-5 break-words whitespace-pre-wrap'
          >
            <div ref={contentRef} className='space-y-2'>
              {children}
            </div>
          </div>
          {isPreview && (
            <div className='from-background pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t to-transparent' />
          )}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

export default EoqReasoning
