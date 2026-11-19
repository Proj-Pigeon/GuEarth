import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || process.env.VITE_POSTHOG_PROJECT_TOKEN
const host = import.meta.env.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST
const missingConfiguration = !projectToken
  ? 'VITE_POSTHOG_PROJECT_TOKEN'
  : !host
    ? 'VITE_POSTHOG_HOST'
    : null

if (missingConfiguration && import.meta.env.DEV) {
  console.warn(`${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`)
}

let provider: LoggerProvider | null = null
let posthogLogger: ReturnType<LoggerProvider['getLogger']> | null = null

if (projectToken && host) {
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
}

export function capturePosthogLog(
  severityText: 'info' | 'warn' | 'error',
  body: string,
  attributes?: Record<string, string | number | boolean>
): void {
  try {
    posthogLogger?.emit({ severityText, body, attributes })
  } catch {
    // Log delivery must never affect the Electron main process.
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
    // Log delivery must never block application exit.
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
