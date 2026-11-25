import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { cn } from '@renderer/lib/utils'

export interface SeparatorProps extends Omit<BaseSeparator.Props, 'className'> {
  className?: string
}

export function Separator({ orientation = 'horizontal', className, ...props }: SeparatorProps) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        'shrink-0 bg-hairline',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  )
}

export default Separator
