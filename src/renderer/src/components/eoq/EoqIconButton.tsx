import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Tooltip } from '@renderer/components/ui'
import { cn } from '@renderer/lib/utils'

const eoqIconButtonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition-[background-color,color,opacity,transform] duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 active:scale-95 disabled:pointer-events-none disabled:cursor-not-allowed motion-reduce:transition-none',
  {
    variants: {
      variant: {
        ghost:
          'bg-transparent text-ink-tertiary hover:bg-hover-fill hover:text-ink disabled:opacity-40',
        outline:
          'border border-border-strong bg-elevated text-ink-secondary shadow-xs hover:border-ink/25 hover:text-ink disabled:opacity-40',
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-muted disabled:text-ink-disabled',
        ink:
          'bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-muted disabled:text-ink-disabled'
      },
      size: {
        sm: 'size-7 text-[14px]',
        md: 'size-8 text-[14px]'
      }
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'sm'
    }
  }
)

export interface EoqIconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof eoqIconButtonVariants> {
  tooltip?: string
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right'
}

export const EoqIconButton = forwardRef<HTMLButtonElement, EoqIconButtonProps>(
  (
    {
      tooltip,
      tooltipPlacement = 'top',
      variant,
      size,
      className,
      type = 'button',
      children,
      ...props
    },
    ref
  ) => {
    const button = (
      <button
        ref={ref}
        type={type}
        aria-label={props['aria-label'] ?? tooltip}
        className={cn(eoqIconButtonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </button>
    )

    if (!tooltip) {return button}

    return (
      <Tooltip title={tooltip} placement={tooltipPlacement}>
        {button}
      </Tooltip>
    )
  }
)

export default EoqIconButton
