import { cn } from '@renderer/lib/utils'
import dayjs from 'dayjs'
import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Popover } from './popover'

export interface MonthDayPickerProps {
  value: string
  className?: string
  'aria-label'?: string
  onChange: (isoDate: string) => void
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

export function MonthDayPicker({
  value,
  className,
  'aria-label': ariaLabel = '选择日期',
  onChange
}: MonthDayPickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = useMemo(() => {
    const d = dayjs(value)
    return d.isValid() ? d : dayjs('2025-06-21')
  }, [value])

  const [viewMonth, setViewMonth] = useState(parsed.month() + 1)
  const activeYear = parsed.year()
  const selectedMonth = parsed.month() + 1
  const selectedDay = parsed.date()
  const daysInMonth = dayjs(`${activeYear}-${String(viewMonth).padStart(2, '0')}-01`).daysInMonth()
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1)

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      setViewMonth(selectedMonth)
    }
    setOpen(nextOpen)
  }

  function pickDay(day: number): void {
    const next = `${activeYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement='topLeft'
      className='w-64 p-3'
      content={
        <div className='flex flex-col gap-2.5'>
          <div className='grid grid-cols-6 gap-1'>
            {MONTHS.map(month => (
              <button
                key={month}
                type='button'
                onClick={() => setViewMonth(month)}
                className={cn(
                  'h-6 cursor-pointer rounded-md border-0 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                  viewMonth === month
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-transparent text-ink-secondary hover:bg-muted hover:text-ink'
                )}
              >
                {month}月
              </button>
            ))}
          </div>
          <div className='bg-hairline h-px' />
          <div className='grid grid-cols-7 gap-1'>
            {days.map(day => {
              const selected = viewMonth === selectedMonth && day === selectedDay
              return (
                <button
                  key={day}
                  type='button'
                  onClick={() => pickDay(day)}
                  className={cn(
                    'h-7 cursor-pointer rounded-md border-0 font-mono text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                    selected
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'bg-transparent text-ink hover:bg-muted'
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      }
    >
      <button
        type='button'
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-elevated px-2 text-[12px] leading-5 text-ink transition-colors outline-none hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-ring/25',
          className
        )}
      >
        <CalendarIcon className='text-ink-tertiary size-3.5' aria-hidden='true' />
        <span className='font-mono whitespace-nowrap'>{parsed.format('M月D日')}</span>
      </button>
    </Popover>
  )
}

export default MonthDayPicker
