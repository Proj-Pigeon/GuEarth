import { randomUUID } from 'node:crypto'
import { net } from 'electron'
import type { AiModelTestRequest, AiModelTestResult, AiProtocol } from '../../preload'
import { normalizeModelTestOutput, redactApiKey } from '../../common/aiTelemetry'
import { readProviderKey } from '../keyVault'
import { captureAiGeneration } from './posthog'
import { readResponseText, ResponseTooLargeError } from './responseReader'

const TEST_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 64 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function endpoint(baseUrl: string, protocol: AiProtocol): string {
  let base = baseUrl.trim().replace(/\/+$/, '')
  if (/^https?:\/\/[^/]+$/i.test(base)) {base = `${base}/v1`}
  return `${base}${protocol === 'anthropic' ? '/messages' : '/chat/completions'}`
}

function extractPayloadError(payload: Record<string, unknown>): { message: string; code: string } | null {
  const raw = payload.error
  if (typeof raw === 'string' && raw.trim()) {return { message: raw, code: '' }}
  if (isRecord(raw)) {
    const message = typeof raw.message === 'string' ? raw.message : ''
    const code = typeof raw.code === 'string' ? raw.code : typeof raw.type === 'string' ? raw.type : ''
    if (message || code || Object.keys(raw).length > 0) {return { message, code }}
  }
  if (payload.type === 'error') {
    const message = typeof payload.message === 'string' ? payload.message : ''
    return { message, code: 'error' }
  }
  if (!Array.isArray(payload.choices) && !Array.isArray(payload.content) && typeof payload.message === 'string' && payload.message.trim()) {
    return { message: payload.message, code: '' }
  }
  return null
}

function failureMessage(status: number, text: string, apiKey: string): string {
  let message = ''
  let code = ''
  try {
    const payload: unknown = JSON.parse(text)
    if (isRecord(payload)) {
      const extracted = extractPayloadError(payload)
      if (extracted) {
        message = extracted.message
        code = extracted.code
      }
    }
  } catch {
    message = text
  }
  const hint = `${code} ${message}`.toLowerCase()
  if (status === 402 || /insufficient|balance|quota|credit/.test(hint)) {return '账户余额不足或额度已用尽'}
  if (status === 401 || status === 403 || /api.?key|unauthor|forbidden|auth/.test(hint)) {return 'API Key 无效或无权限'}
  if (status === 404 || /model.*(not.*found|not.*exist|no such)/.test(hint)) {return '模型不存在'}
  if (status === 429 || /rate.?limit|too many/.test(hint)) {return '请求过于频繁，请稍后重试'}
  const detail = (message || text).trim().replaceAll(apiKey, '[redacted]').slice(0, 160)
  return `响应失败（HTTP ${status}）${detail ? `：${detail}` : ''}`
}

function validate(value: unknown): AiModelTestRequest {
  if (!isRecord(value)) {throw new Error('无效的响应测试请求')}
  if (!['openai', 'anthropic'].includes(value.protocol as string)) {throw new Error('该协议不支持响应测试')}
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : ''
  const modelId = typeof value.modelId === 'string' ? value.modelId.trim().slice(0, 200) : ''
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || !name || !modelId) {throw new Error('模型信息不完整')}
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {throw new Error('接口地址必须使用 HTTP 或 HTTPS')}
  return { id, name: name.slice(0, 80), protocol: value.protocol as AiProtocol, baseUrl: baseUrl.slice(0, 500), modelId }
}

export async function testModel(value: unknown): Promise<AiModelTestResult> {
  const request = validate(value)
  const apiKey = readProviderKey(`ai-${request.id}`)
  if (!apiKey) {throw new Error('请先保存 API Key')}
  const headers = request.protocol === 'anthropic'
    ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  const body = request.protocol === 'anthropic'
    ? { model: request.modelId, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] }
    : { model: request.modelId, messages: [{ role: 'user', content: 'ping' }] }
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TEST_TIMEOUT_MS)
  const traceId = randomUUID()
  const startedAt = Date.now()
  const requestUrl = endpoint(request.baseUrl, request.protocol)
  try {
    const response = await net.fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await readResponseText(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      controller,
      tooLargeMessage: '响应内容过大'
    })
    if (!response.ok) {throw new Error(failureMessage(response.status, text, apiKey))}
    const payload: unknown = JSON.parse(text)
    if (!isRecord(payload)) {throw new Error('响应格式错误')}
    if (extractPayloadError(payload)) {throw new Error(failureMessage(response.status, text, apiKey))}
    captureAiGeneration({
      distinctId: `ai-model-test:${traceId}`,
      traceId,
      sessionId: null,
      model: request.modelId,
      provider: request.id,
      input: body.messages,
      output: normalizeModelTestOutput(request.protocol, payload),
      baseUrl: request.baseUrl,
      requestUrl,
      latencyMs: Date.now() - startedAt,
      stream: false
    })
    return { latencyMs: Date.now() - startedAt }
  } catch (error) {
    const failure = error instanceof ResponseTooLargeError
      ? error
      : timedOut || controller.signal.aborted
        ? new Error('响应超时')
        : error instanceof SyntaxError
          ? new Error('响应格式错误')
          : error instanceof Error
            ? error
            : new Error('响应测试失败')
    captureAiGeneration({
      distinctId: `ai-model-test:${traceId}`,
      traceId,
      sessionId: null,
      model: request.modelId,
      provider: request.id,
      input: body.messages,
      baseUrl: request.baseUrl,
      requestUrl,
      latencyMs: Date.now() - startedAt,
      stream: false,
      error: redactApiKey(failure.message, apiKey)
    })
    throw failure
  } finally {
    clearTimeout(timer)
  }
}
