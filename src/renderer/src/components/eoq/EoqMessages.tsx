import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ActionBarPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import type { PartState } from '@assistant-ui/react';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowDownIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon
} from 'lucide-react'
import { useConfirm, useToast } from '@renderer/components/ui'
import { useAiStore } from '@renderer/stores/ai';
import type { ChatMessage, ToolStep } from '@renderer/stores/ai';
import { cn } from '@renderer/lib/utils'
import EoqIconButton from './EoqIconButton'
import EoqMarkdownText from './EoqMarkdownText'
import EoqReasoning from './EoqReasoning'
import EoqToolCall from './EoqToolCall'
import EoqToolGroup from './EoqToolGroup'
import EoqWebSearch from './EoqWebSearch'

type EoqGroupKey = 'group-reasoning' | 'group-tool'

const eoqGroupBy = (part: PartState): readonly EoqGroupKey[] => {
  if (part.type === 'reasoning') {return ['group-reasoning']}
  if (part.type === 'tool-call' && part.toolName !== 'web_search') {return ['group-tool']}
  return []
}

interface EoqThreadActionsContextValue {
  editingId: string
  editingDraft: string
  copiedMessageId: string
  setEditingDraft: (value: string) => void
  startEdit: (message: ChatMessage) => void
  cancelEdit: () => void
  confirmEdit: (message: ChatMessage) => void
  handleEditKeydown: (event: KeyboardEvent<HTMLTextAreaElement>, message: ChatMessage) => void
  copyAnswer: (message: ChatMessage) => void
  handleRegenerate: (message: ChatMessage) => void
  onSubmitPrompt: (prompt: string) => void
}

const EoqThreadActionsContext = createContext<EoqThreadActionsContextValue | null>(null)

function useEoqThreadActions(): EoqThreadActionsContextValue {
  const value = useContext(EoqThreadActionsContext)
  if (!value) {throw new Error('EoqThreadActionsContext is missing')}
  return value
}

function EoqUserMessage() {
  const chatMessage = useAuiState(
    (state) => state.message.metadata.custom?.chatMessage as ChatMessage | undefined
  )
  const isStreaming = useAiStore((state) => state.isStreaming)
  const {
    editingId,
    editingDraft,
    setEditingDraft,
    startEdit,
    cancelEdit,
    confirmEdit,
    handleEditKeydown
  } = useEoqThreadActions()

  if (!chatMessage) {return null}
  const isEditing = editingId === chatMessage.id

  return (
    <MessagePrimitive.Root className="group/user flex min-w-0 animate-eoq-fade-up flex-col items-end gap-1 motion-reduce:animate-none">
      {isEditing ? (
        <div className="edit-box flex w-full flex-col gap-2 rounded-2xl border border-primary bg-background px-3 pt-2.5 pb-2 ring-2 ring-primary/12">
          <textarea
            value={editingDraft}
            rows={3}
            autoFocus
            aria-label="编辑提问"
            onChange={(event) => setEditingDraft(event.target.value)}
            onKeyDown={(event) => handleEditKeydown(event, chatMessage)}
            className="max-h-48 w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[22px] text-foreground shadow-none outline-none ring-0 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="h-7 cursor-pointer rounded-md border border-border-strong bg-elevated px-2.5 text-[12px] leading-5 text-ink-secondary transition-colors duration-100 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!editingDraft.trim()}
              onClick={() => confirmEdit(chatMessage)}
              className="h-7 cursor-pointer rounded-md border-0 bg-primary px-3 text-[12px] leading-5 text-primary-foreground transition-colors duration-100 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-disabled"
            >
              发送
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-[88%] rounded-2xl bg-muted px-3.5 py-2 text-[14px] leading-[22px] whitespace-pre-wrap break-words text-foreground">
            {chatMessage.content}
          </div>
          {!isStreaming && (
            <ActionBarPrimitive.Root
              hideWhenRunning
              className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within/user:opacity-100 group-hover/user:opacity-100 motion-reduce:transition-none"
            >
              <EoqIconButton
                tooltip="编辑提问"
                size="sm"
                onClick={() => startEdit(chatMessage)}
              >
                <PencilIcon className="size-3.5" />
              </EoqIconButton>
            </ActionBarPrimitive.Root>
          )}
        </>
      )}
    </MessagePrimitive.Root>
  )
}

function EoqAssistantMessage() {
  const chatMessage = useAuiState(
    (state) => state.message.metadata.custom?.chatMessage as ChatMessage | undefined
  )
  const isStreaming = useAiStore((state) => state.isStreaming)
  const modelRetryNotice = useAiStore((state) => state.modelRetryNotice)
  const retryLast = useAiStore((state) => state.retryLast)
  const { copiedMessageId, copyAnswer, handleRegenerate, onSubmitPrompt } = useEoqThreadActions()

  const toolStepsById = useMemo(() => {
    const map = new Map<string, ToolStep>()
    if (!chatMessage) {return map}
    for (const part of chatMessage.parts) {
      if (part.kind === 'tool') {map.set(part.step.callId, part.step)}
    }
    return map
  }, [chatMessage])

  if (!chatMessage) {return null}

  return (
    <MessagePrimitive.Root className="assistant-block group/assistant flex min-w-0 animate-eoq-fade-up flex-col gap-2 px-0.5 motion-reduce:animate-none">
      <div className="flex min-w-0 flex-col gap-2">
        <MessagePrimitive.GroupedParts groupBy={eoqGroupBy} indicator="empty">
          {({ part, children }) => {
            switch (part.type) {
              case 'group-reasoning': {
                const running = part.status.type === 'running'
                let durationMs = 0
                for (const index of part.indices) {
                  const raw = chatMessage.parts[index]
                  if (raw?.kind === 'reasoning') {durationMs += raw.ms}
                }
                return (
                  <EoqReasoning streaming={running} durationMs={durationMs || undefined}>
                    {children}
                  </EoqReasoning>
                )
              }
              case 'group-tool': {
                let failedCount = 0
                for (const index of part.indices) {
                  const raw = chatMessage.parts[index]
                  if (raw?.kind === 'tool' && raw.step.status === 'error') {failedCount += 1}
                }
                return (
                  <EoqToolGroup group={part} failedCount={failedCount}>
                    {children}
                  </EoqToolGroup>
                )
              }
              case 'reasoning': {
                return <div className="whitespace-pre-wrap break-words">{part.text}</div>
              }
              case 'text': {
                return <EoqMarkdownText />
              }
              case 'tool-call': {
                const step = toolStepsById.get(part.toolCallId)
                if (part.toolName === 'web_search' && step) {
                  return (
                    <EoqWebSearch
                      step={step}
                      busy={isStreaming}
                      onRetry={(query) => onSubmitPrompt(`请重新联网搜索：${query}`)}
                    />
                  )
                }
                return (
                  <EoqToolCall
                    toolName={part.toolName}
                    args={(part.args ?? {})}
                    argsText={part.argsText}
                    result={part.result}
                    isError={part.isError}
                    status={part.status}
                    step={step}
                  />
                )
              }
              case 'indicator': {
                return (
                  <span className="inline-block py-1 text-[12px] leading-5 text-muted-foreground shimmer motion-reduce:animate-none">
                    思考中…
                  </span>
                )
              }
              default: {
                return null
              }
            }
          }}
        </MessagePrimitive.GroupedParts>
      </div>

      {chatMessage.status === 'streaming' && modelRetryNotice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/[0.06] px-3 py-2 text-[12px] leading-5 text-ink-secondary"
        >
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 break-words">{modelRetryNotice}</span>
        </div>
      )}

      {chatMessage.status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-[12px] leading-5 text-destructive"
        >
          <AlertCircleIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{chatMessage.error}</span>
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => void retryLast()}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] border border-destructive/30 bg-elevated px-2 py-0.5 text-[12px] leading-5 text-destructive transition-colors duration-100 hover:bg-destructive/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCwIcon className="size-3" />
            重试
          </button>
        </div>
      )}

      {chatMessage.status === 'done' && (
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          className="flex items-center gap-0.5 pt-0.5 text-muted-foreground"
        >
          <EoqIconButton
            tooltip={copiedMessageId === chatMessage.id ? '已复制' : '复制回复'}
            size="sm"
            className={cn(
              copiedMessageId === chatMessage.id && 'text-success hover:text-success'
            )}
            onClick={() => copyAnswer(chatMessage)}
          >
            {copiedMessageId === chatMessage.id ? (
              <CheckIcon className="size-3.5 animate-eoq-pop" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </EoqIconButton>
          <EoqIconButton
            tooltip="重新生成"
            size="sm"
            onClick={() => handleRegenerate(chatMessage)}
          >
            <RefreshCwIcon className="size-3.5" />
          </EoqIconButton>
        </ActionBarPrimitive.Root>
      )}
    </MessagePrimitive.Root>
  )
}

export interface EoqMessagesProps {
  onSubmitPrompt: (prompt: string) => void
}

export function EoqMessages({ onSubmitPrompt }: EoqMessagesProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const messages = useAiStore((state) => state.messages)
  const currentConversationId = useAiStore((state) => state.currentConversationId)
  const resendFrom = useAiStore((state) => state.resendFrom)
  const regenerate = useAiStore((state) => state.regenerate)

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [editingId, setEditingId] = useState('')
  const [editingDraft, setEditingDraft] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState('')

  useEffect(() => {
    if (messages.length === 0) {
      setEditingId('')
      setEditingDraft('')
    }
  }, [messages.length])

  useEffect(() => {
    setEditingId('')
    setEditingDraft('')
  }, [currentConversationId])

  useEffect(() => 
    () => {
      if (copiedTimerRef.current !== undefined) {clearTimeout(copiedTimerRef.current)}
    }
  , [])

  const discardsFollowing = useCallback((messageId: string): boolean => {
    const currentMessages = useAiStore.getState().messages
    const index = currentMessages.findIndex((item) => item.id === messageId)
    return index !== -1 && index < currentMessages.length - 1
  }, [])

  const startEdit = useCallback((chatMessage: ChatMessage) => {
    setEditingId(chatMessage.id)
    setEditingDraft(chatMessage.content)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId('')
    setEditingDraft('')
  }, [])

  const confirmEdit = useCallback(
    (chatMessage: ChatMessage) => {
      const text = editingDraft.trim()
      if (!text) {return}
      if (!discardsFollowing(chatMessage.id)) {
        cancelEdit()
        void resendFrom(chatMessage.id, text)
        return
      }
      confirm({
        title: '重新发送编辑后的提问？',
        content: '此提问之后的对话内容将被丢弃。',
        okText: '发送',
        cancelText: '取消',
        onOk: () => {
          cancelEdit()
          void resendFrom(chatMessage.id, text)
        }
      })
    },
    [cancelEdit, confirm, discardsFollowing, editingDraft, resendFrom]
  )

  const handleEditKeydown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, chatMessage: ChatMessage) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {return}
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        confirmEdit(chatMessage)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelEdit()
      }
    },
    [cancelEdit, confirmEdit]
  )

  const copyAnswer = useCallback(
    (chatMessage: ChatMessage) => {
      void navigator.clipboard
        .writeText(chatMessage.content)
        .then(() => {
          setCopiedMessageId(chatMessage.id)
          if (copiedTimerRef.current !== undefined) {clearTimeout(copiedTimerRef.current)}
          copiedTimerRef.current = setTimeout(() => {
            setCopiedMessageId('')
            copiedTimerRef.current = undefined
          }, 1600)
        })
        .catch(() => {
          toast.error('复制失败，请重试')
        })
    },
    [toast]
  )

  const handleRegenerate = useCallback(
    (chatMessage: ChatMessage) => {
      if (!discardsFollowing(chatMessage.id)) {
        void regenerate(chatMessage.id)
        return
      }
      confirm({
        title: '重新生成此回复？',
        content: '此回复之后的对话内容将被丢弃。',
        okText: '重新生成',
        cancelText: '取消',
        onOk: () => void regenerate(chatMessage.id)
      })
    },
    [confirm, discardsFollowing, regenerate]
  )

  return (
    <EoqThreadActionsContext.Provider
      value={{
        editingId,
        editingDraft,
        copiedMessageId,
        setEditingDraft,
        startEdit,
        cancelEdit,
        confirmEdit,
        handleEditKeydown,
        copyAnswer,
        handleRegenerate,
        onSubmitPrompt
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport
          autoScroll
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 pb-4"
        >
          <ThreadPrimitive.Messages
            components={{
              UserMessage: EoqUserMessage,
              AssistantMessage: EoqAssistantMessage
            }}
          />
        </ThreadPrimitive.Viewport>

        <ThreadPrimitive.ScrollToBottom asChild>
          <EoqIconButton
            variant="outline"
            size="md"
            tooltip="回到底部"
            aria-label="回到底部"
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 disabled:pointer-events-none disabled:invisible"
          >
            <ArrowDownIcon className="size-4" />
          </EoqIconButton>
        </ThreadPrimitive.ScrollToBottom>
      </div>
    </EoqThreadActionsContext.Provider>
  )
}

export default EoqMessages
