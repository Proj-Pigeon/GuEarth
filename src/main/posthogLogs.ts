import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || process.env.VITE_POSTHOG_PROJECT_TOKEN
const host = import.meta.env.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST

let posthogLogsEnabled = false
let provider: LoggerProvider | null = null
let posthogLogger: ReturnType<LoggerProvider['getLogger']> | null = null
let missingWarned = false

function ensureLogger(): ReturnType<LoggerProvider['getLogger']> | null {
  if (!posthogLogsEnabled) return null
  if (posthogLogger) return posthogLogger
  if (!projectToken || !host) {
    if (!missingWarned && import.meta.env.DEV) {
      missingWarned = true
      const missingConfiguration = !projectToken ? 'VITE_POSTHOG_PROJECT_TOKEN' : 'VITE_POSTHOG_HOST'
      console.warn(`${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`)
    }
    return null
  }
  try {
    provider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': 'guearth-electron-main'
      }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: new URL('/i/v1/logs', host).toString(),
            headers: { Authorization: `Bearer ${projectToken}` }
          })
        })
      ]
    })
    posthogLogger = provider.getLogger('guearth.posthog')
  } catch (error) {
    if (import.meta.env.DEV) console.warn('PostHog log export could not be initialized', error)
  }
  return posthogLogger
}

export function setPosthogLogsEnabled(enabled: boolean): void {
  posthogLogsEnabled = enabled
  if (enabled) ensureLogger()
}

export function capturePosthogLog(
  severityText: 'info' | 'warn' | 'error',
  body: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const activeLogger = ensureLogger()
  if (!activeLogger) return
  try {
    activeLogger.emit({ severityText, body, attributes })
  } catch {
    return
  }
}

export async function shutdownPosthogLogs(): Promise<void> {
  if (!provider) return
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      provider.shutdown(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 1_000)
        timeout.unref()
      })
    ])
  } catch {
    return
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
