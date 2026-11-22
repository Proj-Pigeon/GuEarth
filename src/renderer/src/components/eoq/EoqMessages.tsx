import {
  ActionBarPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  type PartState
} from '@assistant-ui/react'
import { cn } from '@renderer/lib/utils'
import { useAiStore, type ChatMessage, type ToolStep } from '@renderer/stores/ai'
import { App as AntdApp } from 'antd'
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowDownIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'

import EoqIconButton from './EoqIconButton'
import EoqMarkdownText from './EoqMarkdownText'
import EoqReasoning from './EoqReasoning'
import EoqToolCall from './EoqToolCall'
import EoqToolGroup from './EoqToolGroup'
import EoqWebSearch from './EoqWebSearch'

type EoqGroupKey = 'group-reasoning' | 'group-tool'

const eoqGroupBy = (part: PartState): readonly EoqGroupKey[] => {
  if (part.type === 'reasoning') return ['group-reasoning']
  if (part.type === 'tool-call' && part.toolName !== 'web_search') return ['group-tool']
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
  if (!value) throw new Error('EoqThreadActionsContext is missing')
  return value
}

function EoqUserMessage() {
  const chatMessage = useAuiState(
    state => state.message.metadata.custom?.chatMessage as ChatMessage | undefined
  )
  const isStreaming = useAiStore(state => state.isStreaming)
  const {
    editingId,
    editingDraft,
    setEditingDraft,
    startEdit,
    cancelEdit,
    confirmEdit,
    handleEditKeydown
  } = useEoqThreadActions()

  if (!chatMessage) return null
  const isEditing = editingId === chatMessage.id

  return (
    <MessagePrimitive.Root className='group/user animate-eoq-fade-up flex min-w-0 flex-col items-end gap-1 motion-reduce:animate-none'>
      {isEditing ? (
        <div className='edit-box border-primary bg-background ring-primary/12 flex w-full flex-col gap-2 rounded-2xl border px-3 pt-2.5 pb-2 ring-2'>
          <textarea
            value={editingDraft}
            rows={3}
            autoFocus
            aria-label='编辑提问'
            onChange={event => setEditingDraft(event.target.value)}
            onKeyDown={event => handleEditKeydown(event, chatMessage)}
            className='text-foreground max-h-48 w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[22px] shadow-none ring-0 outline-none focus:outline-none'
          />
          <div className='flex items-center justify-end gap-2'>
            <button
              type='button'
              onClick={cancelEdit}
              className='border-border bg-background text-foreground/65 hover:border-foreground/20 hover:text-foreground focus-visible:ring-primary h-7 cursor-pointer rounded-md border px-2.5 text-[12px] leading-5 transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none'
            >
              取消
            </button>
            <button
              type='button'
              disabled={!editingDraft.trim()}
              onClick={() => confirmEdit(chatMessage)}
              className='bg-primary text-primary-foreground focus-visible:ring-primary disabled:bg-foreground/[0.06] disabled:text-foreground/25 h-7 cursor-pointer rounded-md border-0 px-3 text-[12px] leading-5 transition-colors duration-100 hover:bg-[#4096ff] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed'
            >
              发送
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className='bg-muted text-foreground max-w-[88%] rounded-2xl px-3.5 py-2 text-[14px] leading-[22px] break-words whitespace-pre-wrap'>
            {chatMessage.content}
          </div>
          {!isStreaming && (
            <ActionBarPrimitive.Root
              hideWhenRunning
              className='flex items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within/user:opacity-100 group-hover/user:opacity-100 motion-reduce:transition-none'
            >
              <EoqIconButton tooltip='编辑提问' size='sm' onClick={() => startEdit(chatMessage)}>
                <PencilIcon className='size-3.5' />
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
    state => state.message.metadata.custom?.chatMessage as ChatMessage | undefined
  )
  const isStreaming = useAiStore(state => state.isStreaming)
  const modelRetryNotice = useAiStore(state => state.modelRetryNotice)
  const retryLast = useAiStore(state => state.retryLast)
  const { copiedMessageId, copyAnswer, handleRegenerate, onSubmitPrompt } = useEoqThreadActions()

  const toolStepsById = useMemo(() => {
    const map = new Map<string, ToolStep>()
    if (!chatMessage) return map
    for (const part of chatMessage.parts) {
      if (part.kind === 'tool') map.set(part.step.callId, part.step)
    }
    return map
  }, [chatMessage])

  if (!chatMessage) return null

  return (
    <MessagePrimitive.Root className='assistant-block group/assistant animate-eoq-fade-up flex min-w-0 flex-col gap-2 px-0.5 motion-reduce:animate-none'>
      <div className='flex min-w-0 flex-col gap-2'>
        <MessagePrimitive.GroupedParts groupBy={eoqGroupBy} indicator='empty'>
          {({ part, children }) => {
            switch (part.type) {
              case 'group-reasoning': {
                const running = part.status.type === 'running'
                let durationMs = 0
                for (const index of part.indices) {
                  const raw = chatMessage.parts[index]
                  if (raw?.kind === 'reasoning') durationMs += raw.ms
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
                  if (raw?.kind === 'tool' && raw.step.status === 'error') failedCount += 1
                }
                return (
                  <EoqToolGroup group={part} failedCount={failedCount}>
                    {children}
                  </EoqToolGroup>
                )
              }
              case 'reasoning':
                return <div className='break-words whitespace-pre-wrap'>{part.text}</div>
              case 'text':
                return <EoqMarkdownText />
              case 'tool-call': {
                const step = toolStepsById.get(part.toolCallId)
                if (part.toolName === 'web_search' && step) {
                  return (
                    <EoqWebSearch
                      step={step}
                      busy={isStreaming}
                      onRetry={query => onSubmitPrompt(`请重新联网搜索：${query}`)}
                    />
                  )
                }
                return (
                  <EoqToolCall
                    toolName={part.toolName}
                    args={(part.args ?? {}) as Record<string, unknown>}
                    argsText={part.argsText}
                    result={part.result}
                    isError={part.isError}
                    status={part.status}
                    step={step}
                  />
                )
              }
              case 'indicator':
                return (
                  <span className='text-muted-foreground shimmer inline-block py-1 text-[12px] leading-5 motion-reduce:animate-none'>
                    思考中…
                  </span>
                )
              default:
                return null
            }
          }}
        </MessagePrimitive.GroupedParts>
      </div>

      {chatMessage.status === 'streaming' && modelRetryNotice && (
        <div
          role='status'
          className='text-foreground/80 flex items-start gap-2 rounded-lg border border-[#faad14]/35 bg-[#faad14]/[0.06] px-3 py-2 text-[12px] leading-5'
        >
          <AlertTriangleIcon className='mt-0.5 size-3.5 shrink-0 text-[#faad14]' />
          <span className='min-w-0 flex-1 break-words'>{modelRetryNotice}</span>
        </div>
      )}

      {chatMessage.status === 'error' && (
        <div
          role='alert'
          className='border-destructive/30 bg-destructive/[0.04] text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] leading-5'
        >
          <AlertCircleIcon className='size-3.5 shrink-0' />
          <span className='min-w-0 flex-1 break-words'>{chatMessage.error}</span>
          <button
            type='button'
            disabled={isStreaming}
            onClick={() => void retryLast()}
            className='border-destructive/30 bg-background text-destructive hover:bg-destructive/[0.06] focus-visible:ring-primary inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[12px] leading-5 transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
          >
            <RefreshCwIcon className='size-3' />
            重试
          </button>
        </div>
      )}

      {chatMessage.status === 'done' && (
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide='not-last'
          className='text-muted-foreground flex items-center gap-0.5 pt-0.5'
        >
          <EoqIconButton
            tooltip={copiedMessageId === chatMessage.id ? '已复制' : '复制回复'}
            size='sm'
            className={cn(
              copiedMessageId === chatMessage.id && 'text-[#52c41a] hover:text-[#52c41a]'
            )}
            onClick={() => copyAnswer(chatMessage)}
          >
            {copiedMessageId === chatMessage.id ? (
              <CheckIcon className='animate-eoq-pop size-3.5' />
            ) : (
              <CopyIcon className='size-3.5' />
            )}
          </EoqIconButton>
          <EoqIconButton tooltip='重新生成' size='sm' onClick={() => handleRegenerate(chatMessage)}>
            <RefreshCwIcon className='size-3.5' />
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
  const { message: antdMessage, modal } = AntdApp.useApp()
  const messages = useAiStore(state => state.messages)
  const currentConversationId = useAiStore(state => state.currentConversationId)
  const resendFrom = useAiStore(state => state.resendFrom)
  const regenerate = useAiStore(state => state.regenerate)

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

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== undefined) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const discardsFollowing = useCallback((messageId: string): boolean => {
    const currentMessages = useAiStore.getState().messages
    const index = currentMessages.findIndex(item => item.id === messageId)
    return index >= 0 && index < currentMessages.length - 1
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
      if (!text) return
      if (!discardsFollowing(chatMessage.id)) {
        cancelEdit()
        void resendFrom(chatMessage.id, text)
        return
      }
      modal.confirm({
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
    [cancelEdit, discardsFollowing, editingDraft, modal, resendFrom]
  )

  const handleEditKeydown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, chatMessage: ChatMessage) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
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
          if (copiedTimerRef.current !== undefined) clearTimeout(copiedTimerRef.current)
          copiedTimerRef.current = setTimeout(() => {
            setCopiedMessageId('')
            copiedTimerRef.current = undefined
          }, 1600)
        })
        .catch(() => {
          antdMessage.error('复制失败，请重试')
        })
    },
    [antdMessage]
  )

  const handleRegenerate = useCallback(
    (chatMessage: ChatMessage) => {
      if (!discardsFollowing(chatMessage.id)) {
        void regenerate(chatMessage.id)
        return
      }
      modal.confirm({
        title: '重新生成此回复？',
        content: '此回复之后的对话内容将被丢弃。',
        okText: '重新生成',
        cancelText: '取消',
        onOk: () => void regenerate(chatMessage.id)
      })
    },
    [discardsFollowing, modal, regenerate]
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
      <div className='relative flex min-h-0 flex-1 flex-col'>
        <ThreadPrimitive.Viewport
          autoScroll
          className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 pb-4'
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
            variant='outline'
            size='md'
            tooltip='回到底部'
            aria-label='回到底部'
            className='absolute bottom-3 left-1/2 z-10 -translate-x-1/2 disabled:pointer-events-none disabled:invisible'
          >
            <ArrowDownIcon className='size-4' />
          </EoqIconButton>
        </ThreadPrimitive.ScrollToBottom>
      </div>
    </EoqThreadActionsContext.Provider>
  )
}

export default EoqMessages
