import { useState, type ReactElement, type ReactNode } from 'react'
import { runGuardedAction } from './actionError'
import { Alert } from './alert'
import { Button } from './button'
import { Popover, type PopoverPlacement } from './popover'
import { appToast } from './toast'

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
  const [errorMessage, setErrorMessage] = useState('')

  function handleOpenChange(nextOpen: boolean): void {
    if (busy && !nextOpen) return
    if (!nextOpen) setErrorMessage('')
    setOpen(nextOpen)
  }

  async function handleConfirm(): Promise<void> {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    try {
      const ok = await runGuardedAction(onConfirm, (message) => {
        setErrorMessage(message)
        appToast.error(message)
      })
      if (ok) {
        setErrorMessage('')
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement={placement}
      className="w-56 p-3"
      content={
        <div className="flex flex-col gap-2.5">
          <div className="text-[13px] leading-5 font-medium text-ink">{title}</div>
          {description && <div className="text-[12px] leading-4 text-ink-secondary">{description}</div>}
          {errorMessage && (
            <Alert type="error" showIcon title={errorMessage} className="px-2.5 py-1.5 text-[12px]" />
          )}
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => handleOpenChange(false)}>
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
