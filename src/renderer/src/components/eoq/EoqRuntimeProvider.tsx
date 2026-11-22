import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type MessageStatus,
  type ThreadMessageLike,
  type ToolCallMessagePart
} from '@assistant-ui/react'
import { useAiStore, type ChatMessage } from '@renderer/stores/ai'
import { useMemo, useRef, type ReactNode } from 'react'

export interface EoqRuntimeProviderProps {
  children: ReactNode
  onInterceptSend?: (text: string) => boolean
}

type ToolCallArgs = ToolCallMessagePart['args']

function serializeArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args)
  } catch {
    return '{}'
  }
}

function toToolArgs(args: Record<string, unknown>): ToolCallArgs {
  try {
    return JSON.parse(JSON.stringify(args)) as ToolCallArgs
  } catch {
    return {}
  }
}

function parseToolResult(result: string): unknown {
  if (!result) return ''
  try {
    return JSON.parse(result)
  } catch {
    return result
  }
}

function extractAppendText(message: AppendMessage): string {
  return message.content
    .filter(
      (part): part is Extract<(typeof message.content)[number], { type: 'text' }> =>
        part.type === 'text'
    )
    .map(part => part.text)
    .join('\n')
    .trim()
}

function toMessageStatus(message: ChatMessage): MessageStatus {
  if (message.status === 'streaming') return { type: 'running' }
  if (message.status === 'error') {
    return {
      type: 'incomplete',
      reason: 'error',
      error: message.error
    }
  }
  return { type: 'complete', reason: 'stop' }
}

export function convertChatMessage(message: ChatMessage): ThreadMessageLike {
  if (message.role === 'user') {
    return {
      id: message.id,
      role: 'user',
      content: [{ type: 'text', text: message.content }],
      metadata: {
        custom: {
          chatMessage: message
        }
      }
    }
  }

  const lastIndex = message.parts.length - 1
  const content = message.parts.map((part, index) => {
    const isLive = message.status === 'streaming' && index === lastIndex
    if (part.kind === 'reasoning') {
      const completedAt = isLive ? undefined : part.startedAt + part.ms
      return {
        type: 'reasoning' as const,
        id: part.id,
        text: part.text,
        status: isLive ? ({ type: 'running' } as const) : ({ type: 'complete' } as const),
        ...(part.startedAt > 0
          ? {
              timing: {
                startedAt: part.startedAt,
                ...(completedAt !== undefined ? { completedAt } : {})
              }
            }
          : {})
      }
    }
    if (part.kind === 'text') {
      return {
        type: 'text' as const,
        text: part.text,
        status: isLive ? ({ type: 'running' } as const) : ({ type: 'complete' } as const)
      }
    }
    return {
      type: 'tool-call' as const,
      toolCallId: part.step.callId,
      toolName: part.step.name,
      args: toToolArgs(part.step.args),
      argsText: serializeArgs(part.step.args),
      result: part.step.status === 'running' ? undefined : parseToolResult(part.step.result),
      isError: part.step.status === 'error',
      ...(part.step.startedAt !== undefined
        ? {
            timing: {
              startedAt: part.step.startedAt,
              ...(part.step.completedAt !== undefined ? { completedAt: part.step.completedAt } : {})
            }
          }
        : {})
    }
  })

  return {
    id: message.id,
    role: 'assistant',
    content,
    status: toMessageStatus(message),
    metadata: {
      custom: {
        chatMessage: message
      }
    }
  }
}

export function EoqRuntimeProvider({ children, onInterceptSend }: EoqRuntimeProviderProps) {
  const messages = useAiStore(state => state.messages)
  const isStreaming = useAiStore(state => state.isStreaming)
  const onInterceptSendRef = useRef(onInterceptSend)
  onInterceptSendRef.current = onInterceptSend

  const adapter = useMemo<ExternalStoreAdapter<ChatMessage>>(
    () => ({
      isRunning: isStreaming,
      messages,
      convertMessage: convertChatMessage,
      async onNew(message: AppendMessage): Promise<void> {
        const text = extractAppendText(message)
        if (!text) return
        if (onInterceptSendRef.current?.(text)) return
        await useAiStore.getState().send(text)
      },
      async onEdit(message: AppendMessage): Promise<void> {
        const text = extractAppendText(message)
        if (!text) return
        const state = useAiStore.getState()
        const targetId =
          message.sourceId ??
          (message.parentId === null
            ? state.messages[0]?.id
            : state.messages[state.messages.findIndex(item => item.id === message.parentId) + 1]
                ?.id)
        if (targetId) {
          await state.resendFrom(targetId, text)
        } else {
          await state.send(text)
        }
      },
      async onReload(parentId: string | null): Promise<void> {
        const state = useAiStore.getState()
        if (parentId === null) {
          const firstAssistant = state.messages.find(item => item.role === 'assistant')
          if (firstAssistant) {
            await state.regenerate(firstAssistant.id)
          } else {
            await state.retryLast()
          }
          return
        }
        const parentIndex = state.messages.findIndex(item => item.id === parentId)
        if (parentIndex < 0) return
        const nextMessage = state.messages[parentIndex + 1]
        if (nextMessage?.role === 'assistant') {
          await state.regenerate(nextMessage.id)
          return
        }
        if (state.messages[parentIndex]?.role === 'user') {
          await state.resendFrom(parentId)
        }
      },
      async onCancel(): Promise<void> {
        await useAiStore.getState().stop()
      }
    }),
    [isStreaming, messages]
  )

  const runtime = useExternalStoreRuntime(adapter)

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

export default EoqRuntimeProvider
