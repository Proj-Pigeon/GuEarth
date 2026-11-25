import { useState, type ReactElement, type ReactNode } from 'react'
import { Button } from './button'
import { Popover, type PopoverPlacement } from './popover'

export interface PopconfirmProps {
  title: ReactNode
  description?: ReactNode
  okText?: string
  cancelText?: string
  okDanger?: boolean
  placement?: PopoverPlacement
  onConfirm?: () => void | Promise<void>
  children: ReactElement<Record<string, unknown>>
}

export function Popconfirm({
  title,
  description,
  okText = '确定',
  cancelText = '取消',
  okDanger = true,
  placement = 'topRight',
  onConfirm,
  children
}: PopconfirmProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleConfirm(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm?.()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      className="w-56 p-3"
      content={
        <div className="flex flex-col gap-2.5">
          <div className="text-[13px] leading-5 font-medium text-ink">{title}</div>
          {description && <div className="text-[12px] leading-4 text-ink-secondary">{description}</div>}
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {cancelText}
            </Button>
            <Button
              size="sm"
              variant="primary"
              danger={okDanger}
              loading={busy}
              onClick={() => void handleConfirm()}
            >
              {okText}
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  )
}

export default Popconfirm
