import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cn } from '@renderer/lib/utils'
import { XIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { runGuardedAction } from './actionError'
import { Alert } from './alert'
import { Button } from './button'
import { appToast } from './toast'

export interface ModalProps {
  open: boolean
  title?: ReactNode
  width?: number | string
  footer?: ReactNode | null
  okText?: string
  cancelText?: string
  okDanger?: boolean
  okDisabled?: boolean
  confirmLoading?: boolean
  closable?: boolean
  maskClosable?: boolean
  keyboard?: boolean
  zIndex?: number
  className?: string
  bodyClassName?: string
  bodyStyle?: CSSProperties
  onOk?: () => void | Promise<void>
  onCancel?: () => void
  children?: ReactNode
}

export function Modal({
  open,
  title,
  width = 480,
  footer,
  okText = '确定',
  cancelText = '取消',
  okDanger = false,
  okDisabled = false,
  confirmLoading = false,
  closable = true,
  maskClosable = true,
  keyboard = true,
  zIndex = 1300,
  className,
  bodyClassName,
  bodyStyle,
  onOk,
  onCancel,
  children
}: ModalProps) {
  const handleOpenChange = useCallback(
    (nextOpen: boolean, details?: { reason?: string }) => {
      if (nextOpen) {
        return
      }
      if (details?.reason === 'escape-key' && !keyboard) {
        return
      }
      if (details?.reason === 'outside-press' && !maskClosable) {
        return
      }
      onCancel?.()
    },
    [keyboard, maskClosable, onCancel]
  )

  const resolvedWidth = typeof width === 'number' ? `${width}px` : width

  return (
    <BaseDialog.Root
      open={open}
      disablePointerDismissal={!maskClosable}
      onOpenChange={handleOpenChange}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          style={{ zIndex }}
          className='fixed inset-0 bg-[var(--backdrop)] transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none'
        />
        <BaseDialog.Popup
          style={{ width: resolvedWidth, zIndex: zIndex + 1 }}
          onKeyDown={event => {
            if (!keyboard && event.key === 'Escape') {
              event.stopPropagation()
              event.preventDefault()
            }
          }}
          className={cn(
            'fixed top-1/2 left-1/2 flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-hairline bg-elevated text-ink shadow-[var(--shadow-dialog)] outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none',
            className
          )}
        >
          {(title !== undefined || closable) && (
            <div className='border-hairline flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5'>
              {title === undefined ? (
                <span />
              ) : (
                <BaseDialog.Title className='text-ink m-0 text-[15px] leading-6 font-semibold'>
                  {title}
                </BaseDialog.Title>
              )}
              {closable && (
                <Button
                  variant='ghost'
                  size='sm'
                  aria-label='关闭弹窗'
                  icon={<XIcon className='size-4' />}
                  onClick={() => onCancel?.()}
                />
              )}
            </div>
          )}

          <div
            style={bodyStyle}
            className={cn(
              'min-h-0 overflow-y-auto px-5 py-4 text-[14px] leading-[22px]',
              bodyStyle?.height === undefined ? 'flex-1' : 'flex-[0_1_auto]',
              bodyClassName
            )}
          >
            {children}
          </div>

          {footer !== null && (
            <div className='border-hairline flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3'>
              {footer === undefined ? (
                <>
                  <Button disabled={confirmLoading} onClick={() => onCancel?.()}>
                    {cancelText}
                  </Button>
                  <Button
                    variant='primary'
                    danger={okDanger}
                    disabled={okDisabled}
                    loading={confirmLoading}
                    onClick={() => {
                      void runGuardedAction(onOk, message => {
                        appToast.error(message)
                      })
                    }}
                  >
                    {okText}
                  </Button>
                </>
              ) : (
                footer
              )}
            </div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export interface ConfirmOptions {
  title: ReactNode
  content?: ReactNode
  okText?: string
  cancelText?: string
  danger?: boolean
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => void
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const optionsRef = useRef<ConfirmOptions | null>(null)
  optionsRef.current = options

  const confirm = useCallback((next: ConfirmOptions) => {
    setBusy(false)
    setErrorMessage('')
    setOptions(next)
  }, [])

  const close = useCallback(() => {
    if (busy) {
      return
    }
    const current = optionsRef.current
    setErrorMessage('')
    setOptions(null)
    current?.onCancel?.()
  }, [busy])

  const accept = useCallback(async () => {
    const current = optionsRef.current
    if (!current || busy) {
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const ok = await runGuardedAction(current.onOk, message => {
        setErrorMessage(message)
        appToast.error(message)
      })
      if (ok) {
        setErrorMessage('')
        setOptions(null)
      }
    } finally {
      setBusy(false)
    }
  }, [busy])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <BaseAlertDialog.Root
        open={Boolean(options)}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            close()
          }
        }}
      >
        <BaseAlertDialog.Portal>
          <BaseAlertDialog.Backdrop className='fixed inset-0 z-[1450] bg-[var(--backdrop)] transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none' />
          <BaseAlertDialog.Popup className='border-hairline bg-elevated text-ink fixed top-1/2 left-1/2 z-[1451] flex w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border p-5 shadow-[var(--shadow-dialog)] transition-[opacity,transform] duration-150 ease-out outline-none data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none'>
            <div className='flex flex-col gap-1.5'>
              <BaseAlertDialog.Title className='text-ink m-0 text-[15px] leading-6 font-semibold'>
                {options?.title}
              </BaseAlertDialog.Title>
              {options?.content && (
                <BaseAlertDialog.Description className='text-ink-secondary m-0 text-[13px] leading-5'>
                  {options.content}
                </BaseAlertDialog.Description>
              )}
            </div>
            {errorMessage && <Alert type='error' showIcon title={errorMessage} />}
            <div className='flex items-center justify-end gap-2'>
              <Button disabled={busy} onClick={close}>
                {options?.cancelText ?? '取消'}
              </Button>
              <Button
                variant='primary'
                danger={Boolean(options?.danger)}
                loading={busy}
                onClick={() => void accept()}
              >
                {options?.okText ?? '确定'}
              </Button>
            </div>
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Portal>
      </BaseAlertDialog.Root>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('ConfirmDialogProvider is missing')
  }
  return ctx.confirm
}
