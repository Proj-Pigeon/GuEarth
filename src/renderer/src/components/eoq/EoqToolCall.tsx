import { useCallback, useRef, useState } from 'react'
import {
  useScrollLock,
  useToolCallElapsed,
  type ToolCallMessagePartStatus
} from '@assistant-ui/react'
import { CheckIcon, ChevronRightIcon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { toolLabel, type ToolStep } from '@renderer/stores/ai'
import { cn } from '@renderer/lib/utils'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from './collapsible'

const ANIMATION_DURATION = 200

const PRIMARY_ARG_KEYS = ['query', 'name', 'place', 'location', 'city', 'layer', 'panel', 'title', 'topic']

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s'
  const seconds = ms / 1000
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

function primaryArgPreview(args: Record<string, unknown>): string {
  for (const key of PRIMARY_ARG_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function formatInput(args: Record<string, unknown>, argsText: string): string {
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== '')
  if (entries.length > 0) {
    try {
      return JSON.stringify(Object.fromEntries(entries), null, 2)
    } catch {
      return argsText || '（无输入）'
    }
  }
  if (argsText && argsText !== '{}') return argsText
  return '（无输入）'
}

function formatOutput(result: unknown, rawResult: string | undefined, isRunning: boolean): string {
  const source = rawResult !== undefined && rawResult !== '' ? rawResult : result
  if (source === undefined || source === null || source === '') {
    return isRunning ? '执行中…' : '（无输出）'
  }
  if (typeof source === 'string') {
    try {
      return JSON.stringify(JSON.parse(source), null, 2)
    } catch {
      return source
    }
  }
  try {
    return JSON.stringify(source, null, 2)
  } catch {
    return String(source)
  }
}

export interface EoqToolCallProps {
  toolName: string
  args: Record<string, unknown>
  argsText: string
  result?: unknown
  isError?: boolean
  status?: ToolCallMessagePartStatus
  step?: ToolStep
}

export function EoqToolCall({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
  step
}: EoqToolCallProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lockScroll = useScrollLock(rootRef, ANIMATION_DURATION)
  const elapsedMs = useToolCallElapsed()
  const [open, setOpen] = useState(false)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      lockScroll()
      setOpen(nextOpen)
    },
    [lockScroll]
  )

  const isRunning = step ? step.status === 'running' : status?.type === 'running'
  const isFailed = step
    ? step.status === 'error'
    : isError === true || status?.type === 'incomplete'

  const label = toolLabel(toolName, isRunning)
  const chipText = step?.summary?.trim() || primaryArgPreview(step?.args ?? args)
  const inputText = formatInput(step?.args ?? args, argsText)
  const outputText = formatOutput(result, step?.result, isRunning)

  return (
    <CollapsibleRoot
      ref={rootRef}
      open={open}
      onOpenChange={handleOpenChange}
      className="group/tool-call w-full"
    >
      <CollapsibleTrigger className="group/trigger flex w-full items-center gap-1.5 rounded-md py-1 text-[12px] leading-5 text-muted-foreground transition-colors duration-100 hover:text-foreground">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none" />
        <span
          className={cn(
            'shrink-0 whitespace-nowrap leading-5',
            isRunning
              ? 'shimmer text-foreground/80 motion-reduce:animate-none'
              : isFailed
                ? 'text-destructive'
                : 'text-foreground/65'
          )}
        >
          {label}
        </span>
        {chipText && (
          <span
            title={chipText}
            className={cn(
              'min-w-0 truncate rounded-[4px] px-1.5 py-0.5 text-[12px] leading-4',
              isFailed
                ? 'bg-destructive/[0.08] text-destructive'
                : 'bg-foreground/[0.04] text-foreground/65'
            )}
          >
            {chipText}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {elapsedMs !== undefined && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatElapsed(elapsedMs)}
            </span>
          )}
          {isRunning ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
          ) : isFailed ? (
            <XCircleIcon className="size-3.5 shrink-0 animate-eoq-pop text-destructive" />
          ) : (
            <CheckIcon className="size-3.5 shrink-0 animate-eoq-pop text-success" />
          )}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1 mb-1.5 ml-4 overflow-hidden rounded-lg border border-border bg-muted/60 text-[12px]">
          <div className="px-3 py-2">
            <div className="mb-1 text-[11px] leading-4 text-muted-foreground">输入</div>
            <pre className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-foreground/75">
              {inputText}
            </pre>
          </div>
          <div className="mx-3 h-px bg-border" />
          <div className="px-3 py-2">
            <div className="mb-1 text-[11px] leading-4 text-muted-foreground">输出</div>
            <pre className="m-0 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-foreground/85">
              {outputText}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

export default EoqToolCall
