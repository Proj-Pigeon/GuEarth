import { Toast as BaseToast } from '@base-ui/react/toast'
import { cn } from '@renderer/lib/utils'
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

interface ToastData {
  tone: ToastTone
}

export const toastManager = BaseToast.createToastManager()

function pushToast(tone: ToastTone, text: string, durationSeconds?: number): string {
  return toastManager.add({
    title: text,
    type: tone,
    timeout: durationSeconds ? Math.round(durationSeconds * 1000) : 3200,
    data: { tone } satisfies ToastData
  })
}

export const appToast = {
  info: (text: string, durationSeconds?: number) => pushToast('info', text, durationSeconds),
  success: (text: string, durationSeconds?: number) => pushToast('success', text, durationSeconds),
  warning: (text: string, durationSeconds?: number) => pushToast('warning', text, durationSeconds),
  error: (text: string, durationSeconds?: number) => pushToast('error', text, durationSeconds)
}

export function useToast() {
  return appToast
}

function ToastToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return <CheckCircle2Icon className='text-success size-4 shrink-0' aria-hidden='true' />
  }
  if (tone === 'warning') {
    return <AlertTriangleIcon className='text-warning size-4 shrink-0' aria-hidden='true' />
  }
  if (tone === 'error') {
    return <XCircleIcon className='text-destructive size-4 shrink-0' aria-hidden='true' />
  }
  return <InfoIcon className='text-info size-4 shrink-0' aria-hidden='true' />
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager()
  return (
    <>
      {toasts.map(toast => {
        const tone =
          (toast.data as ToastData | undefined)?.tone ?? (toast.type as ToastTone) ?? 'info'
        return (
          <BaseToast.Root
            key={toast.id}
            toast={toast}
            className={cn(
              'pointer-events-auto flex w-auto max-w-[min(420px,calc(100vw-32px))] items-center gap-2 rounded-xl border border-hairline bg-elevated px-3.5 py-2.5 text-[13px] leading-5 text-ink shadow-[var(--shadow-popup)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:-translate-y-1.5 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1.5 data-[starting-style]:opacity-0 motion-reduce:transition-none'
            )}
          >
            <ToastToneIcon tone={tone} />
            <BaseToast.Content className='min-w-0 flex-1'>
              <BaseToast.Title className='text-ink font-normal break-words' />
            </BaseToast.Content>
            <BaseToast.Close
              aria-label='关闭通知'
              className='text-ink-tertiary hover:bg-muted hover:text-ink inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition-colors'
            >
              <XIcon className='size-3.5' />
            </BaseToast.Close>
          </BaseToast.Root>
        )
      })}
    </>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider toastManager={toastManager} limit={4}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className='pointer-events-none fixed top-4 left-1/2 z-[1600] flex -translate-x-1/2 flex-col items-center gap-2 outline-none'>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  )
}
