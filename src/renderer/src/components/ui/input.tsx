import { Input as BaseInput } from '@base-ui/react/input'
import { cn } from '@renderer/lib/utils'
import { EyeIcon, EyeOffIcon, XIcon } from 'lucide-react'
import { forwardRef, useState } from 'react'
import type {
  ChangeEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  TextareaHTMLAttributes
} from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md' | 'lg'
  prefix?: ReactNode
  suffix?: ReactNode
  allowClear?: boolean
  status?: 'error'
  onPressEnter?: (event: KeyboardEvent<HTMLInputElement>) => void
}

const sizeClasses = {
  sm: 'h-7 rounded-md px-2 text-[12px] leading-5',
  md: 'h-8 rounded-lg px-2.5 text-[13px] leading-5',
  lg: 'h-10 rounded-xl px-3 text-[14px] leading-[22px]'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      prefix,
      suffix,
      allowClear = false,
      status,
      className,
      value,
      disabled,
      onChange,
      onKeyDown,
      onPressEnter,
      ...props
    },
    ref
  ) => {
    const hasValue =
      typeof value === 'string'
        ? value.length > 0
        : value !== undefined && value !== null && String(value).length > 0
    const showClear = allowClear && hasValue && !disabled

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event)
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        onPressEnter?.(event)
      }
    }

    const handleClear = () => {
      if (!onChange) {
        return
      }
      const synthetic = {
        target: { value: '' },
        currentTarget: { value: '' }
      } as ChangeEvent<HTMLInputElement>
      onChange(synthetic)
    }

    return (
      <div
        data-slot='input'
        className={cn(
          'flex w-full items-center gap-1.5 border border-border-strong bg-elevated text-ink transition-[border-color,box-shadow] duration-100 ease-out focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/12',
          status === 'error' &&
            'border-destructive focus-within:border-destructive focus-within:ring-destructive/15',
          disabled && 'cursor-not-allowed border-hairline bg-muted/60 text-ink-disabled',
          sizeClasses[size],
          className
        )}
      >
        {prefix && (
          <span className='text-ink-tertiary inline-flex shrink-0 items-center'>{prefix}</span>
        )}
        <BaseInput
          ref={ref}
          value={value}
          disabled={disabled}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          className='placeholder:text-ink-tertiary disabled:text-ink-disabled min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none disabled:cursor-not-allowed'
          {...props}
        />
        {showClear && (
          <button
            type='button'
            tabIndex={-1}
            aria-label='清除输入'
            onMouseDown={event => event.preventDefault()}
            onClick={handleClear}
            className='text-ink-tertiary hover:bg-muted hover:text-ink inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors'
          >
            <XIcon className='size-3' />
          </button>
        )}
        {suffix && (
          <span className='text-ink-tertiary inline-flex shrink-0 items-center'>{suffix}</span>
        )}
      </div>
    )
  }
)

export type PasswordInputProps = Omit<InputProps, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ suffix, ...props }, ref) => {
    const [visible, setVisible] = useState(false)
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        suffix={
          <span className='inline-flex items-center gap-1'>
            {suffix}
            <button
              type='button'
              tabIndex={-1}
              aria-label={visible ? '隐藏密码' : '显示密码'}
              onMouseDown={event => event.preventDefault()}
              onClick={() => setVisible(prev => !prev)}
              className='text-ink-tertiary hover:text-ink inline-flex size-5 cursor-pointer items-center justify-center rounded border-0 bg-transparent transition-colors'
            >
              {visible ? <EyeOffIcon className='size-3.5' /> : <EyeIcon className='size-3.5' />}
            </button>
          </span>
        }
        {...props}
      />
    )
  }
)

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  showCount?: boolean
  status?: 'error'
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ showCount = false, maxLength, value, status, className, disabled, ...props }, ref) => {
    const currentLength = typeof value === 'string' ? value.length : 0
    return (
      <div className={cn('relative flex w-full flex-col', className)}>
        <textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          className={cn(
            'w-full resize-y rounded-lg border border-border-strong bg-elevated px-2.5 py-2 text-[13px] leading-5 text-ink transition-[border-color,box-shadow] duration-100 ease-out outline-none placeholder:text-ink-tertiary focus:border-ring focus:ring-2 focus:ring-ring/12 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-muted/60 disabled:text-ink-disabled',
            status === 'error' &&
              'border-destructive focus:border-destructive focus:ring-destructive/15'
          )}
          {...props}
        />
        {showCount && (
          <span className='text-ink-tertiary mt-1 self-end font-mono text-[11px] leading-4'>
            {maxLength === undefined ? currentLength : `${currentLength} / ${maxLength}`}
          </span>
        )}
      </div>
    )
  }
)

export default Input
