import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ActionBarPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import {
  CheckOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  EditOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Collapse, Input, Tooltip } from 'antd'
import {
  toolLabel,
  useAiStore,
  type AssistantPart,
  type ChatMessage,
  type ReasoningPart,
  type ToolStep
} from '@renderer/stores/ai'
import StreamingMarkdown from '../StreamingMarkdown'
import WebSearchStep from '../WebSearchStep'
import styles from '../EoqAssistant.module.css'

interface EoqThreadActionsContextValue {
  editingId: string
  editingDraft: string
  copiedMessageId: string
  reasonTouched: ReadonlySet<string>
  reasonOpen: ReadonlySet<string>
  openTools: ReadonlySet<string>
  setEditingDraft: (value: string) => void
  startEdit: (message: ChatMessage) => void
  cancelEdit: () => void
  confirmEdit: (message: ChatMessage) => void
  handleEditKeydown: (event: KeyboardEvent<HTMLTextAreaElement>, message: ChatMessage) => void
  copyAnswer: (message: ChatMessage) => void
  handleRegenerate: (message: ChatMessage) => void
  toggleReasoning: (part: ReasoningPart, keys: string | string[]) => void
  toggleTool: (step: ToolStep, keys: string | string[]) => void
  onSubmitPrompt: (prompt: string) => void
  onScrollToBottom: () => void
}

const EoqThreadActionsContext = createContext<EoqThreadActionsContextValue | null>(null)

function useEoqThreadActions(): EoqThreadActionsContextValue {
  const value = useContext(EoqThreadActionsContext)
  if (!value) throw new Error('EoqThreadActionsContext is missing')
  return value
}

function reasoningDurationText(part: ReasoningPart): string {
  const seconds = part.ms / 1000
  return seconds < 1 ? '已思考 <1s' : `已思考 ${Math.round(seconds)}s`
}

function isPartLive(message: ChatMessage, part: AssistantPart): boolean {
  return message.status === 'streaming' && message.parts[message.parts.length - 1] === part
}

function prettyInput(step: ToolStep): string {
  const entries = Object.entries(step.args).filter(([, value]) => value !== undefined && value !== '')
  if (!entries.length) return '（无输入）'
  return JSON.stringify(Object.fromEntries(entries), null, 2)
}

function prettyOutput(step: ToolStep): string {
  if (!step.result) return step.status === 'running' ? '执行中…' : '（无输出）'
  try {
    return JSON.stringify(JSON.parse(step.result), null, 2)
  } catch {
    return step.result
  }
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

  if (!chatMessage) return null
  const isEditing = editingId === chatMessage.id

  return (
    <MessagePrimitive.Root className={styles.userRow}>
      {isEditing ? (
        <div className={`edit-box ${styles.editBox}`}>
          <Input.TextArea
            value={editingDraft}
            autoFocus
            autoSize={{ minRows: 2, maxRows: 8 }}
            aria-label="编辑提问"
            onChange={(event) => setEditingDraft(event.target.value)}
            onKeyDown={(event) => handleEditKeydown(event, chatMessage)}
          />
          <div className={styles.editActions}>
            <Button size="small" onClick={cancelEdit}>
              取消
            </Button>
            <Button
              type="primary"
              size="small"
              disabled={!editingDraft.trim()}
              onClick={() => confirmEdit(chatMessage)}
            >
              发送
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.userBubble}>{chatMessage.content}</div>
          {!isStreaming && (
            <ActionBarPrimitive.Root className={styles.messageActions}>
              <Button
                type="text"
                size="small"
                className={styles.actionBtn}
                icon={<EditOutlined />}
                aria-label="编辑提问"
                onClick={() => startEdit(chatMessage)}
              >
                编辑
              </Button>
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
  const {
    copiedMessageId,
    reasonTouched,
    reasonOpen,
    openTools,
    copyAnswer,
    handleRegenerate,
    toggleReasoning,
    toggleTool,
    onSubmitPrompt,
    onScrollToBottom
  } = useEoqThreadActions()

  if (!chatMessage) return null

  return (
    <MessagePrimitive.Root className={`assistant-block ${styles.assistantBlock}`}>
      {chatMessage.parts.map((part, index) => {
        const key = `${chatMessage.id}-${index}`
        if (part.kind === 'reasoning') {
          const live = isPartLive(chatMessage, part)
          const activeKey = reasonTouched.has(part.id)
            ? reasonOpen.has(part.id)
              ? ['reasoning']
              : []
            : live
              ? ['reasoning']
              : []
          return (
            <Collapse
              key={key}
              ghost
              className={styles.reasoningCollapse}
              activeKey={activeKey}
              onChange={(keys) => toggleReasoning(part, keys)}
              items={[
                {
                  key: 'reasoning',
                  label: live ? (
                    <span className={`${styles.shimmerLabel} eoq-thinking-shimmer`}>正在深度思考</span>
                  ) : (
                    <span className={styles.collapsedTitle}>{reasoningDurationText(part)}</span>
                  ),
                  children: <div className={`reasoning-text ${styles.reasoningText}`}>{part.text}</div>
                }
              ]}
            />
          )
        }
        if (part.kind === 'text') {
          return (
            <StreamingMarkdown
              key={key}
              text={part.text}
              streaming={isPartLive(chatMessage, part)}
              onRendered={onScrollToBottom}
            />
          )
        }
        if (part.step.name === 'web_search') {
          return (
            <WebSearchStep
              key={key}
              step={part.step}
              busy={isStreaming}
              onRetry={(query) => onSubmitPrompt(`请重新联网搜索：${query}`)}
            />
          )
        }
        const step = part.step
        const label =
          step.status === 'running' ? (
            <span className={`${styles.shimmerLabel} eoq-thinking-shimmer`}>
              {toolLabel(step.name, true)}
            </span>
          ) : step.status === 'ok' ? (
            <span className={styles.toolHeader}>
              <span className={styles.toolName}>{toolLabel(step.name)}</span>
              {step.summary && (
                <span className={styles.toolSummary} title={step.summary}>
                  {step.summary}
                </span>
              )}
            </span>
          ) : (
            <span className={styles.toolHeader}>
              <CloseCircleOutlined className={styles.toolIconError} />
              <span className={styles.toolName}>{toolLabel(step.name)}</span>
              {step.summary && (
                <span
                  className={`${styles.toolSummary} ${styles.toolSummaryError}`}
                  title={step.summary}
                >
                  {step.summary}
                </span>
              )}
            </span>
          )
        return (
          <Collapse
            key={key}
            ghost
            className={styles.toolCollapse}
            activeKey={openTools.has(step.callId) ? [step.callId] : []}
            onChange={(keys) => toggleTool(step, keys)}
            items={[
              {
                key: step.callId,
                label,
                children: (
                  <div className={styles.toolIo}>
                    <div className={styles.toolIoLabel}>输入</div>
                    <pre className={styles.toolIoBody}>{prettyInput(step)}</pre>
                    <div className={styles.toolIoLabel}>输出</div>
                    <pre className={styles.toolIoBody}>{prettyOutput(step)}</pre>
                  </div>
                )
              }
            ]}
          />
        )
      })}
      {chatMessage.status === 'streaming' && chatMessage.parts.length === 0 && (
        <span className={`${styles.shimmerLabel} ${styles.pendingLine} eoq-thinking-shimmer`}>
          思考中…
        </span>
      )}
      {chatMessage.status === 'streaming' && modelRetryNotice && (
        <Alert type="warning" showIcon title={modelRetryNotice} className={styles.retryNotice} />
      )}
      {chatMessage.status === 'error' && (
        <Alert
          type="error"
          showIcon
          title={chatMessage.error}
          className={styles.answerError}
          action={
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              disabled={isStreaming}
              onClick={() => void retryLast()}
            >
              重试
            </Button>
          }
        />
      )}
      {!isStreaming && chatMessage.status === 'done' && (
        <ActionBarPrimitive.Root className={styles.messageActions}>
          <Tooltip title={copiedMessageId === chatMessage.id ? '已复制' : '复制回复'}>
            <button
              type="button"
              className={
                copiedMessageId === chatMessage.id
                  ? `${styles.actionIconBtn} ${styles.actionIconBtnCopied}`
                  : styles.actionIconBtn
              }
              aria-label={copiedMessageId === chatMessage.id ? '已复制回复' : '复制回复'}
              onClick={() => copyAnswer(chatMessage)}
            >
              {copiedMessageId === chatMessage.id ? <CheckOutlined /> : <CopyOutlined />}
            </button>
          </Tooltip>
          <Tooltip title="重新生成">
            <button
              type="button"
              className={styles.actionIconBtn}
              aria-label="重新生成"
              onClick={() => handleRegenerate(chatMessage)}
            >
              <ReloadOutlined />
            </button>
          </Tooltip>
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
  const messages = useAiStore((state) => state.messages)
  const currentConversationId = useAiStore((state) => state.currentConversationId)
  const resendFrom = useAiStore((state) => state.resendFrom)
  const regenerate = useAiStore((state) => state.regenerate)

  const listRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | undefined>(undefined)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [editingId, setEditingId] = useState('')
  const [editingDraft, setEditingDraft] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState('')
  const [reasonTouched, setReasonTouched] = useState<Set<string>>(() => new Set())
  const [reasonOpen, setReasonOpen] = useState<Set<string>>(() => new Set())
  const [openTools, setOpenTools] = useState<Set<string>>(() => new Set())

  const scheduleAssistantScroll = useCallback(() => {
    if (scrollFrameRef.current !== undefined) cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = undefined
      const container = listRef.current
      if (!container) return
      container.scrollTo({ top: container.scrollHeight })
      const reasoning = container.querySelector<HTMLElement>(
        '.assistant-block:last-child .reasoning-text'
      )
      if (reasoning) reasoning.scrollTop = reasoning.scrollHeight
    })
  }, [])

  const lastMessage = messages[messages.length - 1]
  const lastPart = lastMessage?.parts[lastMessage.parts.length - 1]
  const scrollSignature = !lastMessage
    ? ''
    : `${lastMessage.id}:${lastMessage.status}:${lastMessage.content.length}:${
        !lastPart
          ? ''
          : lastPart.kind === 'reasoning'
            ? `r${lastPart.text.length}`
            : lastPart.kind === 'text'
              ? `t${lastPart.text.length}`
              : `o${lastPart.step.status}:${lastPart.step.result.length}`
      }`

  useEffect(() => {
    if (scrollSignature) scheduleAssistantScroll()
  }, [scrollSignature, scheduleAssistantScroll])

  useEffect(() => {
    if (messages.length === 0) {
      setReasonTouched(new Set())
      setReasonOpen(new Set())
      setOpenTools(new Set())
      setEditingId('')
      setEditingDraft('')
    }
  }, [messages.length])

  useEffect(() => {
    setReasonTouched(new Set())
    setReasonOpen(new Set())
    setOpenTools(new Set())
    setEditingId('')
    setEditingDraft('')
  }, [currentConversationId])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== undefined) clearTimeout(copiedTimerRef.current)
      if (scrollFrameRef.current !== undefined) cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [])

  const discardsFollowing = useCallback((messageId: string): boolean => {
    const currentMessages = useAiStore.getState().messages
    const index = currentMessages.findIndex((item) => item.id === messageId)
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

  const toggleReasoning = useCallback((part: ReasoningPart, keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : keys ? [keys] : []
    setReasonTouched((prev) => {
      const next = new Set(prev)
      next.add(part.id)
      return next
    })
    setReasonOpen((prev) => {
      const next = new Set(prev)
      if (list.includes('reasoning')) next.add(part.id)
      else next.delete(part.id)
      return next
    })
  }, [])

  const toggleTool = useCallback((step: ToolStep, keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : keys ? [keys] : []
    setOpenTools((prev) => {
      const next = new Set(prev)
      if (list.includes(step.callId)) next.add(step.callId)
      else next.delete(step.callId)
      return next
    })
  }, [])

  return (
    <EoqThreadActionsContext.Provider
      value={{
        editingId,
        editingDraft,
        copiedMessageId,
        reasonTouched,
        reasonOpen,
        openTools,
        setEditingDraft,
        startEdit,
        cancelEdit,
        confirmEdit,
        handleEditKeydown,
        copyAnswer,
        handleRegenerate,
        toggleReasoning,
        toggleTool,
        onSubmitPrompt,
        onScrollToBottom: scheduleAssistantScroll
      }}
    >
      <ThreadPrimitive.Viewport ref={listRef} className={styles.chatList} autoScroll={false}>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: EoqUserMessage,
            AssistantMessage: EoqAssistantMessage
          }}
        />
      </ThreadPrimitive.Viewport>
    </EoqThreadActionsContext.Provider>
  )
}

export default EoqMessages
