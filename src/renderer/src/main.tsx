import * as Sentry from '@sentry/electron/renderer'
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { StyleProvider } from '@ant-design/cssinjs'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './assets/main.css'
import { attachConsoleLogTee, logger } from '../../common/logger'
import { surfaceFailureAlreadyShown } from '../../common/globeSurface'
import { requestErrorRejectionLabel } from '../../common/resourceFailure'
import { describeError, installGlobalErrorListeners, notifyCrashMessage } from './lib/crashReporter'
import { isErrorReportingEnabled, onPrivacySettingsChange } from './lib/privacyRuntime'
import { capturePosthogException, syncPosthogPrivacy } from './posthog'

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

const antdTheme = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontFamily:
      "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'WenQuanYi Micro Hei', sans-serif"
  }
}

function handleRenderError(error: unknown, info?: { componentStack?: string }): void {
  notifyCrashMessage(describeError(error))
  if (isErrorReportingEnabled()) {
    capturePosthogException(error)
    Sentry.captureException(error, { extra: { info } })
  }
  console.error(error)
}

const container = document.getElementById('app')
if (container) {
  createRoot(container, {
    onUncaughtError: (error, info) => handleRenderError(error, info),
    onCaughtError: (error, info) => handleRenderError(error, info)
  }).render(
    <StyleProvider layer>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <AntdApp>
          <App />
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  )
}
