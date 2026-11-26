import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select'
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface SelectOption<T extends string = string> {
  value: T
  label: ReactNode
  title?: string
  disabled?: boolean
}

export interface SelectOptionGroup<T extends string = string> {
  label: string
  options: SelectOption<T>[]
}

export type SelectItemOption<T extends string = string> = SelectOption<T> | SelectOptionGroup<T>

function isGroup<T extends string>(item: SelectItemOption<T>): item is SelectOptionGroup<T> {
  return 'options' in item
}

export interface SelectProps<T extends string = string> {
  value?: T
  options: SelectItemOption<T>[]
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  allowClear?: boolean
  searchable?: boolean
  className?: string
  popupClassName?: string
  'aria-label'?: string
  onChange?: (value: T | undefined) => void
}

export function Select<T extends string = string>({
  value,
  options,
  placeholder = '请选择',
  size = 'md',
  disabled = false,
  allowClear = false,
  searchable = false,
  className,
  popupClassName,
  'aria-label': ariaLabel,
  onChange
}: SelectProps<T>) {
  const flatOptions = useMemo<SelectOption<T>[]>(() => {
    const list: SelectOption<T>[] = []
    for (const entry of options) {
      if (isGroup(entry)) {list.push(...entry.options)}
      else {list.push(entry)}
    }
    return list
  }, [options])

  const labelByValue = useMemo(
    () => new Map(flatOptions.map((option) => [option.value, option.label])),
    [flatOptions]
  )

  if (searchable) {
    const selectedOption = flatOptions.find((option) => option.value === value) ?? null
    return (
      <BaseCombobox.Root<SelectOption<T>>
        items={flatOptions}
        value={selectedOption}
        disabled={disabled}
        itemToStringLabel={(item) => (typeof item?.label === 'string' ? item.label : item?.value ?? '')}
        itemToStringValue={(item) => item?.value ?? ''}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(next) => onChange?.(next ? next.value : undefined)}
      >
        <div
          data-slot="select-trigger"
          className={cn(
            'relative inline-flex w-full items-center border border-border-strong bg-elevated text-ink transition-[border-color,box-shadow] duration-100 ease-out focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/12',
            size === 'sm' ? 'h-7 rounded-md text-[12px]' : 'h-8 rounded-lg text-[13px]',
            disabled && 'cursor-not-allowed border-hairline bg-muted/60 text-ink-disabled',
            className
          )}
        >
          <BaseCombobox.Input
            aria-label={ariaLabel}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent px-2.5 text-inherit outline-none placeholder:text-ink-tertiary disabled:cursor-not-allowed"
          />
          <BaseCombobox.Trigger
            aria-label={ariaLabel ?? '展开选项'}
            className="inline-flex h-full w-7 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-ink-tertiary hover:text-ink"
          >
            <ChevronDownIcon className="size-3.5" />
          </BaseCombobox.Trigger>
        </div>
        <BaseCombobox.Portal>
          <BaseCombobox.Positioner sideOffset={4} className="z-[1500] outline-none">
            <BaseCombobox.Popup
              className={cn(
                'max-h-64 min-w-[var(--anchor-width)] overflow-y-auto rounded-xl border border-hairline bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popup)] outline-none transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none',
                popupClassName
              )}
            >
              <BaseCombobox.Empty className="px-2.5 py-2 text-[12px] text-ink-tertiary">
                无匹配项
              </BaseCombobox.Empty>
              <BaseCombobox.List className="outline-none">
                {(item: SelectOption<T>) => (
                  <BaseCombobox.Item
                    key={item.value}
                    value={item}
                    disabled={item.disabled}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[highlighted]:bg-muted data-[selected]:font-medium"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <BaseCombobox.ItemIndicator>
                      <CheckIcon className="size-3.5 shrink-0 text-ink" />
                    </BaseCombobox.ItemIndicator>
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </BaseCombobox.Root>
    )
  }

  const selectedLabel = value === undefined ? undefined : labelByValue.get(value)
  const showClear = allowClear && value !== undefined && !disabled

  return (
    <div className={cn('relative inline-flex w-full items-center', className)}>
      <BaseSelect.Root<T>
        value={value ?? null}
        disabled={disabled}
        onValueChange={(next) => onChange?.(next === null ? undefined : next)}
      >
        <BaseSelect.Trigger
          data-slot="select-trigger"
          aria-label={ariaLabel}
          className={cn(
            'flex w-full cursor-pointer items-center justify-between gap-2 border border-border-strong bg-elevated px-2.5 text-left text-ink transition-[border-color,background-color,box-shadow] duration-100 ease-out outline-none hover:not-data-[disabled]:border-ink/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15 data-[disabled]:cursor-not-allowed data-[disabled]:border-hairline data-[disabled]:bg-muted/60 data-[disabled]:text-ink-disabled',
            size === 'sm' ? 'h-7 rounded-md text-[12px] leading-5' : 'h-8 rounded-lg text-[13px] leading-5',
            showClear && 'pr-12'
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', selectedLabel === undefined && 'text-ink-tertiary')}>
            {selectedLabel ?? placeholder}
          </span>
          <BaseSelect.Icon className="inline-flex shrink-0 text-ink-tertiary">
            <ChevronDownIcon className="size-3.5" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-[1500] outline-none">
            <BaseSelect.Popup
              className={cn(
                'max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-xl border border-hairline bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popup)] outline-none transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none',
                popupClassName
              )}
            >
              <BaseSelect.List className="outline-none">
                {options.length === 0 ? (
                  <div className="px-2.5 py-2 text-[12px] text-ink-tertiary">暂无选项</div>
                ) : (
                  options.map((entry, groupIndex) =>
                    isGroup(entry) ? (
                      <BaseSelect.Group key={`${entry.label}-${groupIndex}`} className="py-0.5">
                        <BaseSelect.GroupLabel className="px-2.5 py-1 text-[11px] font-medium text-ink-tertiary">
                          {entry.label}
                        </BaseSelect.GroupLabel>
                        {entry.options.map((option) => (
                          <BaseSelect.Item
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                            title={option.title}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[highlighted]:bg-muted data-[selected]:font-medium"
                          >
                            <BaseSelect.ItemText className="min-w-0 flex-1 truncate">
                              {option.label}
                            </BaseSelect.ItemText>
                            <BaseSelect.ItemIndicator>
                              <CheckIcon className="size-3.5 shrink-0 text-ink" />
                            </BaseSelect.ItemIndicator>
                          </BaseSelect.Item>
                        ))}
                      </BaseSelect.Group>
                    ) : (
                      <BaseSelect.Item
                        key={entry.value}
                        value={entry.value}
                        disabled={entry.disabled}
                        title={entry.title}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[highlighted]:bg-muted data-[selected]:font-medium"
                      >
                        <BaseSelect.ItemText className="min-w-0 flex-1 truncate">
                          {entry.label}
                        </BaseSelect.ItemText>
                        <BaseSelect.ItemIndicator>
                          <CheckIcon className="size-3.5 shrink-0 text-ink" />
                        </BaseSelect.ItemIndicator>
                      </BaseSelect.Item>
                    )
                  )
                )}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
      {showClear && (
        <button
          type="button"
          aria-label="清除选择"
          onClick={(event) => {
            event.stopPropagation()
            onChange?.(undefined)
          }}
          className="absolute right-7 inline-flex size-4 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-tertiary hover:bg-muted hover:text-ink"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  )
}

export default Select
