import { Button as BaseButton } from '@base-ui/react/button'
import { cn } from '@renderer/lib/utils'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Loader2Icon } from 'lucide-react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-normal whitespace-nowrap select-none transition-[background-color,border-color,color,opacity] duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed data-[disabled]:cursor-not-allowed motion-reduce:transition-none [&>svg]:block [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border border-transparent bg-primary text-primary-foreground hover:not-data-[disabled]:bg-primary-hover active:not-data-[disabled]:bg-primary-active data-[disabled]:bg-muted data-[disabled]:text-ink-disabled',
        default:
          'border border-border-strong bg-surface text-ink hover:not-data-[disabled]:bg-muted active:not-data-[disabled]:bg-active-fill data-[disabled]:border-hairline data-[disabled]:bg-muted/50 data-[disabled]:text-ink-disabled',
        ghost:
          'border border-transparent bg-transparent text-ink-secondary hover:not-data-[disabled]:bg-muted hover:not-data-[disabled]:text-ink active:not-data-[disabled]:bg-active-fill data-[disabled]:text-ink-disabled',
        dashed:
          'border border-dashed border-border-strong bg-transparent text-ink-secondary hover:not-data-[disabled]:border-ink/40 hover:not-data-[disabled]:bg-muted hover:not-data-[disabled]:text-ink data-[disabled]:text-ink-disabled',
        link: 'border border-transparent bg-transparent px-1 text-ink underline-offset-4 hover:not-data-[disabled]:underline data-[disabled]:text-ink-disabled'
      },
      size: {
        sm: 'h-7 rounded-md px-2.5 text-[12px] leading-5',
        md: 'h-8 rounded-lg px-3.5 text-[14px] leading-[22px]',
        lg: 'h-10 rounded-xl px-4 text-[14px] leading-[22px]'
      },
      shape: {
        default: '',
        circle: 'aspect-square rounded-full p-0'
      },
      danger: {
        true: '',
        false: ''
      },
      block: {
        true: 'w-full',
        false: ''
      }
    },
    compoundVariants: [
      {
        variant: 'primary',
        danger: true,
        className:
          'bg-destructive text-destructive-foreground hover:not-data-[disabled]:bg-destructive/90 active:not-data-[disabled]:bg-destructive/80'
      },
      {
        variant: ['default', 'dashed', 'link'],
        danger: true,
        className:
          'border-destructive/35 text-destructive hover:not-data-[disabled]:bg-destructive/8 hover:not-data-[disabled]:text-destructive'
      },
      {
        variant: 'ghost',
        danger: true,
        className:
          'border-transparent text-destructive hover:not-data-[disabled]:bg-destructive/10 hover:not-data-[disabled]:text-destructive'
      },
      {
        shape: 'circle',
        size: 'sm',
        className: 'size-7 p-0'
      },
      {
        shape: 'circle',
        size: 'md',
        className: 'size-8 p-0'
      },
      {
        shape: 'circle',
        size: 'lg',
        className: 'size-10 p-0'
      }
    ],
    defaultVariants: {
      variant: 'default',
      size: 'md',
      shape: 'default',
      danger: false,
      block: false
    }
  }
)

export interface ButtonProps
  extends Omit<BaseButton.Props, 'className'>, VariantProps<typeof buttonVariants> {
  className?: string
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLElement, ButtonProps>(
  (
    {
      variant,
      size,
      shape,
      danger,
      block,
      loading = false,
      disabled,
      icon,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || loading)
    const leadingIcon = loading ? (
      <Loader2Icon className='size-3.5 shrink-0 animate-spin' aria-hidden='true' />
    ) : (
      icon
    )
    const iconOnly =
      Boolean(leadingIcon) && (children === undefined || children === null || children === false)
    return (
      <BaseButton
        ref={ref}
        type={type}
        data-slot='button'
        disabled={isDisabled}
        className={cn(
          buttonVariants({ variant, size, shape, danger, block }),
          iconOnly && 'gap-0 leading-none',
          iconOnly &&
            shape !== 'circle' &&
            (size === 'sm' ? 'size-7 p-0' : size === 'lg' ? 'size-10 p-0' : 'size-8 p-0'),
          className
        )}
        {...props}
      >
        {leadingIcon}
        {children}
      </BaseButton>
    )
  }
)

export default Button
