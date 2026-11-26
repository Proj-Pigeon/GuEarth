import type { CSSProperties, ReactNode } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cn } from '@renderer/lib/utils'

export interface DrawerProps {
  open: boolean
  placement?: 'left' | 'right'
  size?: number | string
  title?: ReactNode
  zIndex?: number
  className?: string
  headerClassName?: string
  bodyClassName?: string
  bodyStyle?: CSSProperties
  onClose?: () => void
  children?: ReactNode
}

export function Drawer({
  open,
  placement = 'right',
  size = 360,
  title,
  zIndex = 1000,
  className,
  headerClassName,
  bodyClassName,
  bodyStyle,
  onClose,
  children
}: DrawerProps) {
  const widthValue = typeof size === 'number' ? `${size}px` : size

  return (
    <BaseDialog.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {onClose?.()}
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Popup
          style={{ width: widthValue, zIndex }}
          className={cn(
            'fixed top-14 bottom-3 flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface text-ink shadow-[var(--shadow-dialog)] outline-none transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
            placement === 'right'
              ? 'right-3 data-[ending-style]:translate-x-8 data-[starting-style]:translate-x-8'
              : 'left-3 data-[ending-style]:-translate-x-8 data-[starting-style]:-translate-x-8',
            className
          )}
        >
          {title !== undefined && (
            <div
              className={cn(
                'shrink-0 border-b border-hairline px-4 py-3',
                headerClassName
              )}
            >
              {title}
            </div>
          )}
          <div
            style={bodyStyle}
            className={cn('min-h-0 flex-1 overflow-y-auto p-4', bodyClassName)}
          >
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export default Drawer
