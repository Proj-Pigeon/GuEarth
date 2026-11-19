import * as Sentry from '@sentry/electron/renderer'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
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
  integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Breadcrumbs' && integration.name !== 'Console'),
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

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  notifyCrashMessage(describeError(error))
  if (isErrorReportingEnabled()) {
    capturePosthogException(error)
    Sentry.captureException(error, { extra: { info } })
  }
  console.error(error)
}
app.use(createPinia()).use(Antd).mount('#app')
