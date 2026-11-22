import { PostHog } from 'posthog-node'

const projectToken =
  import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || process.env.VITE_POSTHOG_PROJECT_TOKEN
const host = import.meta.env.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST

let aiPosthogEnabled = false
let posthogClient: PostHog | null = null
let missingWarned = false

function ensureClient(): PostHog | null {
  if (!aiPosthogEnabled) return null
  if (posthogClient) return posthogClient
  if (!projectToken || !host) {
    if (!missingWarned && import.meta.env.DEV) {
      missingWarned = true
      const missingConfiguration = !projectToken
        ? 'VITE_POSTHOG_PROJECT_TOKEN'
        : 'VITE_POSTHOG_HOST'
      console.warn(
        `${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`
      )
    }
    return null
  }
  posthogClient = new PostHog(projectToken, {
    host,
    privacyMode: false,
    enableExceptionAutocapture: false
  })
  return posthogClient
}

export function setAiPosthogEnabled(enabled: boolean): void {
  aiPosthogEnabled = enabled
  if (enabled) ensureClient()
}

export function isAiPosthogEnabled(): boolean {
  return aiPosthogEnabled
}

interface AiCaptureBase {
  distinctId: string
  traceId: string
  sessionId: string | null
  latencyMs: number
}

interface AiGenerationCapture extends AiCaptureBase {
  model: string
  provider: string
  input: unknown
  output?: unknown
  baseUrl: string
  requestUrl: string
  stream: boolean
  tools?: unknown
  error?: string
}

interface AiSpanCapture extends AiCaptureBase {
  spanId: string
  name: string
  input: unknown
  output: unknown
  error?: string
}

export function captureAiGeneration(capture: AiGenerationCapture): void {
  const client = ensureClient()
  if (!client) return
  try {
    client.capture({
      distinctId: capture.distinctId,
      event: '$ai_generation',
      properties: {
        $ai_trace_id: capture.traceId,
        $ai_session_id: capture.sessionId,
        $ai_model: capture.model,
        $ai_provider: capture.provider,
        $ai_input: capture.input,
        ...(capture.output === undefined ? {} : { $ai_output_choices: capture.output }),
        $ai_latency: capture.latencyMs / 1_000,
        $ai_base_url: capture.baseUrl,
        $ai_request_url: capture.requestUrl,
        $ai_stream: capture.stream,
        ...(capture.tools === undefined ? {} : { $ai_tools: capture.tools }),
        ...(capture.error ? { $ai_is_error: true, $ai_error: capture.error } : {})
      }
    })
  } catch {
    return
  }
}

export function captureAiSpan(capture: AiSpanCapture): void {
  const client = ensureClient()
  if (!client) return
  try {
    client.capture({
      distinctId: capture.distinctId,
      event: '$ai_span',
      properties: {
        $ai_trace_id: capture.traceId,
        $ai_session_id: capture.sessionId,
        $ai_span_id: capture.spanId,
        $ai_span_name: capture.name,
        $ai_input_state: capture.input,
        $ai_output_state: capture.output,
        $ai_latency: capture.latencyMs / 1_000,
        ...(capture.error ? { $ai_is_error: true, $ai_error: capture.error } : {})
      }
    })
  } catch {
    return
  }
}

export async function shutdownPosthog(): Promise<void> {
  if (!posthogClient) return
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      posthogClient.shutdown(),
      new Promise<void>(resolve => {
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
