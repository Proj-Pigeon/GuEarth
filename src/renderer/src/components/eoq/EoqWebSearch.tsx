import { useState } from 'react'
import { ChevronDownIcon, Loader2Icon, RotateCwIcon, SearchIcon, XCircleIcon } from 'lucide-react'
import type { AiSearchReference } from '../../../../preload'
import type { ToolStep } from '@renderer/stores/ai'
import { cn } from '@renderer/lib/utils'

const VISIBLE_COUNT = 3
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

function domainOf(reference: AiSearchReference): string {
  if (reference.website) return reference.website
  try {
    return new URL(reference.url).hostname
  } catch {
    return reference.url
  }
}

function safeHref(reference: AiSearchReference): string | undefined {
  try {
    const parsed = new URL(reference.url)
    return ALLOWED_SCHEMES.has(parsed.protocol) ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function extractStepError(step: ToolStep): string {
  try {
    const parsed = JSON.parse(step.result) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : step.summary
  } catch {
    return step.summary
  }
}

export interface EoqWebSearchProps {
  step: ToolStep
  busy: boolean
  onRetry?: (query: string) => void
}

export function EoqWebSearch({ step, busy, onRetry }: EoqWebSearchProps) {
  const [expanded, setExpanded] = useState(false)

  const query = typeof step.args.query === 'string' ? step.args.query : ''
  const references = step.references ?? []
  const searching = step.status === 'running'
  const failed = step.status === 'error'
  const error = extractStepError(step)
  const visible = expanded ? references : references.slice(0, VISIBLE_COUNT)
  const hiddenCount = Math.max(0, references.length - VISIBLE_COUNT)

  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-1">
      {query && (
        <span
          title={query}
          className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[12px] leading-4 text-foreground/65"
        >
          <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{query}</span>
        </span>
      )}

      {!failed && (
        <div className="flex items-center gap-1.5 text-[12px] leading-5 text-muted-foreground" role="status" aria-live="polite">
          {searching ? (
            <>
              <Loader2Icon className="size-3 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
              <span className="shimmer motion-reduce:animate-none">正在搜索</span>
            </>
          ) : references.length > 0 ? (
            <span>已阅读 {references.length} 个来源</span>
          ) : (
            <div className="flex items-center gap-2">
              <span>未找到相关网页</span>
              {query && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetry?.(query)}
                  className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-primary transition-colors duration-100 hover:text-[#4096ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCwIcon className="size-3" />
                  重新搜索
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!failed && visible.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {visible.map((reference, index) => {
            const href = safeHref(reference)
            const domain = domainOf(reference)
            const row = (
              <>
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-foreground/[0.06] text-[10px] font-semibold text-muted-foreground"
                >
                  {domain.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-foreground/85">
                  {reference.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground">
                  {domain}
                </span>
              </>
            )

            const rowClass =
              '-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-inherit no-underline transition-colors duration-100 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

            return href ? (
              <a
                key={`${reference.url}-${index}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={reference.content || reference.title}
                className={rowClass}
              >
                {row}
              </a>
            ) : (
              <div
                key={`${reference.title}-${index}`}
                title={reference.content || reference.title}
                className={rowClass}
              >
                {row}
              </div>
            )
          })}
        </div>
      )}

      {!failed && hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
          className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-transparent py-0.5 text-[12px] leading-5 text-muted-foreground transition-colors duration-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronDownIcon
            className={cn(
              'size-3.5 transition-transform duration-200 motion-reduce:transition-none',
              expanded && 'rotate-180'
            )}
          />
          {expanded ? '收起来源' : `展开其余 ${hiddenCount} 个来源`}
        </button>
      )}

      {failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.04] px-2.5 py-1.5 text-[12px] leading-5 text-destructive"
        >
          <XCircleIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{error || '搜索失败，请稍后重试'}</span>
          {query && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRetry?.(query)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-transparent px-1 py-0.5 text-[12px] text-destructive underline-offset-2 transition-opacity duration-100 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCwIcon className="size-3" />
              重新搜索
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default EoqWebSearch
