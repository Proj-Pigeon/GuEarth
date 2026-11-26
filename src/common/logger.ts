export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  time: number
  level: LogLevel
  scope: string
  message: string
  detail: string
}

const MAX_ENTRIES = 300
const MAX_TEXT_LENGTH = 500
const MAX_DUMP_CHARS = 60_000

const entries: LogEntry[] = []

function clamp(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text
}

export function stringifyLogValue(value: unknown, depth = 0, seen?: WeakSet<object>): string {
  if (typeof value === 'string') {return value}
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {return String(value)}
  if (value instanceof Error) {
    const stack = typeof value.stack === 'string' ? value.stack.split('\n').slice(0, 4).join('\n') : ''
    return clamp(stack ? `${value.name}: ${value.message}\n${stack}` : `${value.name}: ${value.message}`)
  }
  if (depth >= 4) {return '[深层结构省略]'}
  const marker = seen ?? new WeakSet()
  if (typeof value === 'object') {
    if (marker.has(value)) {return '[循环引用]'}
    marker.add(value)
    if (Array.isArray(value)) {
      const items = value.slice(0, 20).map((item) => stringifyLogValue(item, depth + 1, marker))
      if (value.length > 20) {items.push(`…共 ${value.length} 项`)}
      return `[${items.join(', ')}]`
    }
    const parts = Object.entries(value as Record<string, unknown>).slice(0, 20).map(([key, item]) => `${key}: ${stringifyLogValue(item, depth + 1, marker)}`)
    return `{${parts.join(', ')}}`
  }
  return String(value)
}

function push(level: LogLevel, scope: string, message: string, detail: unknown): void {
  entries.push({
    time: Date.now(),
    level,
    scope,
    message: clamp(message),
    detail: detail === undefined || detail === '' ? '' : clamp(stringifyLogValue(detail))
  })
  if (entries.length > MAX_ENTRIES) {entries.splice(0, entries.length - MAX_ENTRIES)}
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function formatTime(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export const logger = {
  info(scope: string, message: string, detail?: unknown): void {
    push('info', scope, message, detail)
  },
  warn(scope: string, message: string, detail?: unknown): void {
    push('warn', scope, message, detail)
  },
  error(scope: string, message: string, detail?: unknown): void {
    push('error', scope, message, detail)
  },
  dump(limit = MAX_ENTRIES): string {
    const lines = entries.slice(-limit).map((entry) => {
      const detail = entry.detail ? ` | ${entry.detail}` : ''
      return `${formatTime(entry.time)} [${entry.level}] [${entry.scope}] ${entry.message}${detail}`
    })
    const text = lines.join('\n')
    return text.length > MAX_DUMP_CHARS ? text.slice(text.length - MAX_DUMP_CHARS) : text
  },
  clear(): void {
    entries.length = 0
  }
}

let consoleTeeInstalled = false

export function attachConsoleLogTee(scope: string): void {
  if (consoleTeeInstalled) {return}
  consoleTeeInstalled = true
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)
  console.warn = (...args: unknown[]) => {
    push('warn', scope, args.map((arg) => stringifyLogValue(arg)).join(' '), '')
    originalWarn(...args)
  }
  console.error = (...args: unknown[]) => {
    push('error', scope, args.map((arg) => stringifyLogValue(arg)).join(' '), '')
    originalError(...args)
  }
}
