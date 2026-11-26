import type { AiProtocol } from '../preload'

export interface TelemetryToolCall {
  id: string
  name: string
  arguments: string
}

export interface TelemetryWireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: TelemetryToolCall[]
  callId?: string
  name?: string
  image?: { data: string; mediaType: string }
}

const MEMORY_SECTION_PATTERN = /(?:^|\n)长期记忆：\n[\s\S]*$/
const REDACTED_MARKER = '[redacted]'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stripMemoryFromPrompt(content: string): string {
  return content.replace(MEMORY_SECTION_PATTERN, '').trimEnd()
}

export function redactApiKey(text: string, apiKey: string): string {
  if (!text || !apiKey) {return text}
  return text.replaceAll(apiKey, REDACTED_MARKER)
}

function sanitizeToolArguments(name: string, rawArguments: string): string {
  if (name !== 'save_memory') {return rawArguments}
  try {
    const parsed: unknown = JSON.parse(rawArguments)
    if (isRecord(parsed)) {
      return JSON.stringify({ ...parsed, content: REDACTED_MARKER })
    }
  } catch {
    return JSON.stringify({ content: REDACTED_MARKER })
  }
  return JSON.stringify({ content: REDACTED_MARKER })
}

export function formatTelemetryToolCalls(toolCalls: TelemetryToolCall[]): Record<string, unknown>[] {
  return toolCalls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: sanitizeToolArguments(call.name, call.arguments)
    }
  }))
}

function sanitizeToolContentValue(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) {return value}
  if (Array.isArray(value)) {return value.map((item) => sanitizeToolContentValue(item, depth + 1))}
  if (!isRecord(value)) {return value}
  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'image' && isRecord(entry) && typeof entry.data === 'string') {
      sanitized[key] = { omitted: true, mediaType: typeof entry.mediaType === 'string' ? entry.mediaType : 'unknown' }
      continue
    }
    if (key === 'data' && typeof entry === 'string' && entry.length > 256 && isRecord(value) && typeof value.mediaType === 'string') {
      sanitized[key] = REDACTED_MARKER
      continue
    }
    if (typeof entry === 'string' && entry.startsWith('data:image/')) {
      sanitized[key] = '[image omitted]'
      continue
    }
    sanitized[key] = sanitizeToolContentValue(entry, depth + 1)
  }
  return sanitized
}

function sanitizeToolMessageContent(name: string | undefined, content: string, hadImage: boolean): string {
  let nextContent = content
  if (name === 'save_memory') {
    try {
      const parsed: unknown = JSON.parse(content)
      if (isRecord(parsed) && typeof parsed.content === 'string') {
        nextContent = JSON.stringify({ ...parsed, content: REDACTED_MARKER })
      }
    } catch {
      nextContent = JSON.stringify({ content: REDACTED_MARKER })
    }
  } else if (content.includes('data:image/')) {
    try {
      const parsed: unknown = JSON.parse(content)
      nextContent = JSON.stringify(sanitizeToolContentValue(parsed))
    } catch {
      nextContent = content.replaceAll(/data:image\/[^;\s"']+;base64,[A-Za-z0-9+/=]+/g, '[image omitted]')
    }
  }
  return hadImage ? `${nextContent}\n[image omitted]` : nextContent
}

export function sanitizeTelemetryMessages(messages: TelemetryWireMessage[]): Record<string, unknown>[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      return { role: 'system', content: stripMemoryFromPrompt(message.content) }
    }
    if (message.role === 'user') {
      return { role: 'user', content: message.content }
    }
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length ? { tool_calls: formatTelemetryToolCalls(message.toolCalls) } : {})
      }
    }
    return {
      role: 'tool',
      ...(message.callId ? { tool_call_id: message.callId } : {}),
      ...(message.name ? { name: message.name } : {}),
      content: sanitizeToolMessageContent(message.name, message.content, Boolean(message.image))
    }
  })
}

export function sanitizeTelemetryToolSpan(
  name: string,
  input: unknown,
  output: unknown
): { input: unknown; output: unknown } {
  if (name === 'save_memory') {
    const safeInput = isRecord(input) ? { ...input, content: REDACTED_MARKER } : { content: REDACTED_MARKER }
    const safeOutput = isRecord(output) && typeof output.content === 'string'
      ? { ...output, content: REDACTED_MARKER }
      : sanitizeToolContentValue(output)
    return { input: safeInput, output: safeOutput }
  }
  return {
    input: sanitizeToolContentValue(input),
    output: sanitizeToolContentValue(output)
  }
}

export function normalizeModelTestOutput(protocol: AiProtocol, payload: Record<string, unknown>): Record<string, unknown>[] {
  if (protocol === 'anthropic') {
    const blocks = Array.isArray(payload.content) ? payload.content : []
    const text = blocks
      .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
    return [{ role: 'assistant', content: text }]
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : []
  const messages: Record<string, unknown>[] = []
  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {continue}
    const role = typeof choice.message.role === 'string' ? choice.message.role : 'assistant'
    const content = typeof choice.message.content === 'string' ? choice.message.content : ''
    messages.push({ role, content })
  }
  return messages.length > 0 ? messages : [{ role: 'assistant', content: '' }]
}
