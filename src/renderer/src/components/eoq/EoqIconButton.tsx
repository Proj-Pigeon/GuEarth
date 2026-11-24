import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Tooltip } from 'antd'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const eoqIconButtonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition-[background-color,color,opacity,transform] duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 active:scale-95 disabled:pointer-events-none disabled:cursor-not-allowed motion-reduce:transition-none',
  {
    variants: {
      variant: {
        ghost:
          'bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40',
        outline:
          'border border-border bg-background text-foreground/65 shadow-sm hover:border-foreground/20 hover:text-foreground disabled:opacity-40',
        primary:
          'bg-primary text-primary-foreground hover:bg-[#4096ff] active:bg-[#0958d9] disabled:bg-foreground/[0.06] disabled:text-foreground/25',
        ink:
          'bg-foreground text-background hover:opacity-85 disabled:bg-foreground/[0.06] disabled:text-foreground/25'
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
  function EoqIconButton(
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
  ) {
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

    if (!tooltip) return button

    return (
      <Tooltip title={tooltip} placement={tooltipPlacement}>
        {button}
      </Tooltip>
    )
  }
)

export default EoqIconButton
