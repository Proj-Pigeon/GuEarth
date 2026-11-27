export type PrivacySettingKey = 'errorReportingEnabled' | 'telemetryEnabled' | 'aiTelemetryEnabled'

export interface PrivacySettings {
  errorReportingEnabled: boolean
  telemetryEnabled: boolean
  aiTelemetryEnabled: boolean
}

export interface PrivacyDisclosureItem {
  key: PrivacySettingKey
  title: string
  summary: string
  confirmTitle: string
  confirmIntro: string
  collectedItems: readonly string[]
  destinations: string
  notice: string
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  errorReportingEnabled: true,
  telemetryEnabled: false,
  aiTelemetryEnabled: false
}

export function resolvePrivacySettings(raw: Record<string, unknown> | null | undefined): PrivacySettings {
  if (!raw) {return { ...DEFAULT_PRIVACY_SETTINGS }}
  return {
    errorReportingEnabled: typeof raw.errorReportingEnabled === 'boolean'
      ? raw.errorReportingEnabled
      : DEFAULT_PRIVACY_SETTINGS.errorReportingEnabled,
    telemetryEnabled: raw.telemetryEnabled === true,
    aiTelemetryEnabled: raw.aiTelemetryEnabled === true
  }
}

export const PRIVACY_DISCLOSURES: readonly PrivacyDisclosureItem[] = [
  {
    key: 'errorReportingEnabled',
    title: '自动化收集错误信息',
    summary: '应用发生崩溃、未捕获异常或进程故障时，自动上报错误堆栈与运行日志以帮助排查问题',
    confirmTitle: '开启“自动化收集错误信息”',
    confirmIntro: '开启后，当应用发生崩溃、未捕获异常或关键进程故障时，可能会收集、处理并上传以下数据项：',
    collectedItems: [
      '异常类型、错误消息与代码调用堆栈',
      '近期主进程与渲染进程诊断日志',
      '应用版本、操作系统与运行环境基础信息，以及客户端网络请求来源 IP'
    ],
    destinations: '上述数据将上传至 Sentry 与 PostHog 服务，仅用于故障排查与稳定性改进。',
    notice: '关闭后将立即停止向外部服务自动上传错误报告。'
  },
  {
    key: 'telemetryEnabled',
    title: '上报遥测信息',
    summary: '上报功能使用事件，用于改进教学工具体验',
    confirmTitle: '开启“上报遥测信息”',
    confirmIntro: '开启后，在使用应用核心功能时，可能会收集、处理并上传以下数据项：',
    collectedItems: [
      '功能使用事件及基础计数指标（如点击、提交、切换、选择等）',
      '应用版本、设备基础环境参数与本地生成的匿名访客标识',
      '如已登录咕咕通行证账号，将关联您的账号唯一标识（sub）；退出登录或关闭本项时会清除此类信息'
    ],
    destinations: '上述数据将上传至 PostHog 服务，仅用于产品功能统计与体验优化。',
    notice: '本项不包含 AI 对话内容与任何 API Key。'
  },
  {
    key: 'aiTelemetryEnabled',
    title: '上报 AI 使用信息',
    summary: '上报 EOQ 助手的模型调用、工具执行与测试信息，用于评估与优化 AI 教学能力',
    confirmTitle: '开启“上报 AI 使用信息”',
    confirmIntro: '开启后，在使用 EOQ 助手时，可能会收集、处理并上传以下数据项：',
    collectedItems: [
      '提问事件以及对话会话标识与单次请求追踪标识',
      'AI 服务商名称、接口地址、模型 ID、流式开关、请求耗时及已脱敏的错误信息',
      '经过脱敏处理的对话消息、模型回复文本以及工具调用名称、参数与返回结果',
      '如已登录咕咕通行证账号，将附带账号唯一标识（sub）；未登录时使用随机匿名标识'
    ],
    destinations: '上述数据将上传至 PostHog 服务，仅用于 AI 效果观测、延迟分析与调用排错。',
    notice: '任何 API Key 不会被上报；记忆内容与图片数据会自动移除。'
  }
]

export function privacyDisclosureFor(key: PrivacySettingKey): PrivacyDisclosureItem {
  const item = PRIVACY_DISCLOSURES.find((entry) => entry.key === key)
  if (!item) {throw new Error(`Unknown privacy setting key: ${key}`)}
  return item
}

export function filterPosthogEvent<T extends { event?: string }>(event: T | null | undefined, privacy: PrivacySettings): T | null {
  if (!event) {return null}
  const name = event.event ?? ''
  if (name === '$exception') {return privacy.errorReportingEnabled ? event : null}
  if (name === 'ai_prompt_submitted' || name.startsWith('$ai_')) {return privacy.aiTelemetryEnabled ? event : null}
  return privacy.telemetryEnabled ? event : null
}
