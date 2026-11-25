import * as Sentry from '@sentry/electron/renderer'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { CSPProvider } from '@base-ui/react/csp-provider'
import App from './App'
import './assets/main.css'
import './assets/touch.css'
import { attachConsoleLogTee, logger } from '../../common/logger'
import { surfaceFailureAlreadyShown } from '../../common/globeSurface'
import { requestErrorRejectionLabel } from '../../common/resourceFailure'
import { describeError, installGlobalErrorListeners, notifyCrashMessage } from './lib/crashReporter'
import { isErrorReportingEnabled, onPrivacySettingsChange } from './lib/privacyRuntime'
import { capturePosthogException, syncPosthogPrivacy } from './posthog'
import { useGlobeStore } from './stores/globe'
import { ConfirmDialogProvider, ToastProvider, TooltipProvider } from './components/ui'

attachConsoleLogTee('renderer')

Sentry.init({
  dsn: 'https://28239780e3a5ede424bde1114849f448@o4509333304573952.ingest.us.sentry.io/4512192370769920',
  enabled: false,
  sendClientReports: false,
  ignoreErrors: [requestErrorRejectionLabel()],
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== 'Breadcrumbs' && integration.name !== 'Console'),
  beforeSend(event) {
    const level = event.level ?? (event.exception ? 'error' : 'info')
    if ((level === 'error' || level === 'fatal') && !surfaceFailureAlreadyShown(event.extra)) {
      const exception = event.exception?.values?.at(-1)
      notifyCrashMessage([exception?.type, exception?.value ?? event.message].filter(Boolean).join(': '))
    }
    if (!isErrorReportingEnabled()) return null
    event.extra = { ...event.extra, rendererLogs: logger.dump(80) }
    return event
  }
})

onPrivacySettingsChange((next) => {
  const client = Sentry.getClient()
  if (client) client.getOptions().enabled = next.errorReportingEnabled
  syncPosthogPrivacy(next)
})

installGlobalErrorListeners()

dayjs.locale('zh-cn')

function handleRenderError(error: unknown, info?: { componentStack?: string }): void {
  notifyCrashMessage(describeError(error))
  if (isErrorReportingEnabled()) {
    capturePosthogException(error)
    Sentry.captureException(error, { extra: { info } })
  }
  console.error(error)
}

function Root() {
  const touchInteractionActive = useGlobeStore((state) => state.touchInteractionActive)
  const resolvedTheme = useGlobeStore((state) => state.resolvedTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('touch-ui', touchInteractionActive)
    return () => {
      document.documentElement.classList.remove('touch-ui')
    }
  }, [touchInteractionActive])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  return (
    <CSPProvider disableStyleElements>
      <TooltipProvider delay={350} closeDelay={0}>
        <ToastProvider>
          <ConfirmDialogProvider>
            <App />
          </ConfirmDialogProvider>
        </ToastProvider>
      </TooltipProvider>
    </CSPProvider>
  )
}

const container = document.getElementById('app')
if (container) {
  createRoot(container, {
    onUncaughtError: (error, info) => handleRenderError(error, info),
    onCaughtError: (error, info) => handleRenderError(error, info)
  }).render(<Root />)
}
