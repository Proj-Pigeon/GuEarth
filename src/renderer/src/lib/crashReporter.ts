import { reactive } from 'vue'
import * as Sentry from '@sentry/electron/renderer'
import { logger, stringifyLogValue } from '../../../common/logger'
import { describeResourceFailure } from '../../../common/resourceFailure'

const MODAL_REOPEN_COOLDOWN_MS = 3000
const MODAL_OPEN_LIMIT = 5
const DUPLICATE_WINDOW_MS = 500

const state = reactive({
  open: false,
  message: '',
  sessionErrors: 0,
  opens: 0
})

let lastModalAt = 0
let lastMessage = ''
let lastMessageAt = 0

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : `${error.name}（无错误信息）`
  const text = describeResourceFailure(error) ?? stringifyLogValue(error)
  return text || '未知错误'
}

function showModal(message: string): void {
  const now = Date.now()
  if (message === lastMessage && now - lastMessageAt < DUPLICATE_WINDOW_MS) return
  lastMessage = message
  lastMessageAt = now
  state.sessionErrors += 1
  if (state.open) return
  if (state.opens >= MODAL_OPEN_LIMIT) return
  if (now - lastModalAt < MODAL_REOPEN_COOLDOWN_MS) return
  lastModalAt = now
  state.opens += 1
  state.message = message || '未知错误'
  state.open = true
}

export function closeCrashDialog(): void {
  state.open = false
}

export function notifyCrashMessage(message: string): void {
  showModal(message)
}

export function captureError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  logger.error(scope, describeError(error), error)
  Sentry.captureException(error, { tags: { scope }, extra })
}

export function captureWarning(scope: string, message: string, extra?: Record<string, unknown>): void {
  logger.warn(scope, message)
  Sentry.captureMessage(message, { level: 'warning', tags: { scope }, extra })
}

export function installGlobalErrorListeners(): void {
  window.addEventListener('error', (event) => {
    if (!event.message && !event.error) return
    showModal(event.message || describeError(event.error))
  })
  window.addEventListener('unhandledrejection', (event) => {
    const resourceFailure = describeResourceFailure(event.reason)
    if (resourceFailure) {
      logger.warn('resource', resourceFailure, event.reason)
      return
    }
    showModal(describeError(event.reason))
  })
}

export const crashDialogState = state
