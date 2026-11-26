import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';

const viteEnv = import.meta.env as Partial<ImportMetaEnv> | undefined
const projectToken = (viteEnv ? import.meta.env.VITE_POSTHOG_PROJECT_TOKEN : undefined) || process.env.VITE_POSTHOG_PROJECT_TOKEN
const host = (viteEnv ? import.meta.env.VITE_POSTHOG_HOST : undefined) || process.env.VITE_POSTHOG_HOST
const isDev = viteEnv ? import.meta.env.DEV : false

let posthogLogsEnabled = false
let provider: LoggerProvider | null = null
let posthogLogger: ReturnType<LoggerProvider['getLogger']> | null = null
let activeExporterController: { active: boolean } | null = null
let missingWarned = false

export function createGatedLogRecordExporter(
  exporter: LogRecordExporter,
  isEnabled: () => boolean
): LogRecordExporter {
  return {
    export(logs, resultCallback) {
      if (!isEnabled()) {
        resultCallback({ code: 0 })
        return
      }
      exporter.export(logs, resultCallback)
    },
    forceFlush() {
      if (!isEnabled()) {return Promise.resolve()}
      return exporter.forceFlush()
    },
    shutdown() {
      return exporter.shutdown()
    }
  }
}

function ensureLogger(): ReturnType<LoggerProvider['getLogger']> | null {
  if (!posthogLogsEnabled) {return null}
  if (posthogLogger) {return posthogLogger}
  if (!projectToken || !host) {
    if (!missingWarned && isDev) {
      missingWarned = true
      const missingConfiguration = projectToken ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_PROJECT_TOKEN'
      console.warn(`${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`)
    }
    return null
  }
  try {
    const controller = { active: true }
    const otlpExporter = new OTLPLogExporter({
      url: new URL('/i/v1/logs', host).toString(),
      headers: { Authorization: `Bearer ${projectToken}` }
    })
    provider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': 'guearth-electron-main'
      }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: createGatedLogRecordExporter(otlpExporter, () => controller.active && posthogLogsEnabled)
        })
      ]
    })
    activeExporterController = controller
    posthogLogger = provider.getLogger('guearth.posthog')
  } catch (error) {
    if (isDev) {console.warn('PostHog log export could not be initialized', error)}
  }
  return posthogLogger
}

export function setPosthogLogsEnabled(enabled: boolean): void {
  posthogLogsEnabled = enabled
  if (!enabled) {
    if (activeExporterController) {
      activeExporterController.active = false
      activeExporterController = null
    }
    const activeProvider = provider
    provider = null
    posthogLogger = null
    if (activeProvider) {void activeProvider.shutdown().catch(() => {})}
    return
  }
  ensureLogger()
}

export function capturePosthogLog(
  severityText: 'info' | 'warn' | 'error',
  body: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const activeLogger = ensureLogger()
  if (!activeLogger) {return}
  try {
    activeLogger.emit({ severityText, body, attributes })
  } catch {
    return
  }
}

export async function shutdownPosthogLogs(): Promise<void> {
  const activeProvider = provider
  const controller = activeExporterController
  if (!activeProvider) {return}
  provider = null
  posthogLogger = null
  activeExporterController = null
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      activeProvider.shutdown(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 1000)
        timeout.unref()
      })
    ])
  } catch {
    return
  } finally {
    if (controller) {controller.active = false}
    if (timeout) {clearTimeout(timeout)}
  }
}
