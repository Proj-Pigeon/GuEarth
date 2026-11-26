import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './button'
import { Select } from './select'

export interface PaginationProps {
  current: number
  total: number
  pageSize: number
  pageSizeOptions?: number[]
  showSizeChanger?: boolean
  showQuickJumper?: boolean
  showTotal?: boolean
  className?: string
  onChange: (page: number, pageSize: number) => void
}

function buildPages(current: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const pages: (number | 'ellipsis')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(totalPages - 1, current + 1)
  if (start > 2) {pages.push('ellipsis')}
  for (let page = start; page <= end; page += 1) {pages.push(page)}
  if (end < totalPages - 1) {pages.push('ellipsis')}
  pages.push(totalPages)
  return pages
}

export function Pagination({
  current,
  total,
  pageSize,
  pageSizeOptions = [20, 50, 100],
  showSizeChanger = false,
  showQuickJumper = false,
  showTotal = false,
  className,
  onChange
}: PaginationProps) {
  const [jumpDraft, setJumpDraft] = useState('')
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safeCurrent = Math.min(totalPages, Math.max(1, current))
  const rangeStart = total === 0 ? 0 : (safeCurrent - 1) * pageSize + 1
  const rangeEnd = Math.min(total, safeCurrent * pageSize)
  const pages = buildPages(safeCurrent, totalPages)

  function submitJump(): void {
    const parsed = Number.parseInt(jumpDraft.trim(), 10)
    setJumpDraft('')
    if (!Number.isFinite(parsed)) {return}
    const target = Math.min(totalPages, Math.max(1, parsed))
    if (target !== safeCurrent) {onChange(target, pageSize)}
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 text-[12px] text-ink-secondary', className)}>
      {showTotal && (
        <span className="font-mono text-ink-tertiary">
          {rangeStart}-{rangeEnd} / {total}
        </span>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={safeCurrent <= 1}
          aria-label="上一页"
          icon={<ChevronLeftIcon className="size-3.5" />}
          onClick={() => onChange(safeCurrent - 1, pageSize)}
        />
        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-ink-tertiary">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === safeCurrent ? 'page' : undefined}
              onClick={() => onChange(item, pageSize)}
              className={cn(
                'inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md border px-2 font-mono text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                item === safeCurrent
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent bg-transparent text-ink-secondary hover:bg-muted hover:text-ink'
              )}
            >
              {item}
            </button>
          )
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={safeCurrent >= totalPages}
          aria-label="下一页"
          icon={<ChevronRightIcon className="size-3.5" />}
          onClick={() => onChange(safeCurrent + 1, pageSize)}
        />
      </div>
      {showSizeChanger && (
        <Select
          size="sm"
          value={String(pageSize)}
          className="w-24"
          aria-label="每页条数"
          options={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} 条/页` }))}
          onChange={(next) => {
            const parsed = Number(next)
            if (Number.isFinite(parsed) && parsed > 0) {onChange(1, parsed)}
          }}
        />
      )}
      {showQuickJumper && (
        <span className="inline-flex items-center gap-1 text-ink-tertiary">
          <span>跳至</span>
          <input
            value={jumpDraft}
            inputMode="numeric"
            aria-label="跳转页码"
            onChange={(event) => setJumpDraft(event.target.value.replaceAll(/[^\d]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {submitJump()}
            }}
            onBlur={submitJump}
            className="h-7 w-11 rounded-md border border-border-strong bg-elevated px-1.5 text-center font-mono text-[12px] text-ink outline-none focus:border-ring"
          />
          <span>页</span>
        </span>
      )}
    </div>
  )
}

export default Pagination
