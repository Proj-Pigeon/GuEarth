import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AiChatEvent, AiChatTurn, AiContextCompressionResult, AiContextEntry, AiContextStats, AiSearchReference, AiSettings, AiToolDefinition, StoredAiCompression, StoredAiConversation, StoredAiConversationSummary, StoredAiMessage, StoredAiPart } from '../../../preload'
import { defaultAiSettings } from '../../../shared/aiSettings'
import { ipcErrorMessage } from '../lib/ipcError'
import { useFlightStopsStore } from './flightStops'
import { useAccountStore } from './account'
import { captureAiUsageEvent } from '../posthog'

export interface ToolStep {
  callId: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'ok' | 'error'
  summary: string
  result: string
  references?: AiSearchReference[]
}

export interface ReasoningPart {
  kind: 'reasoning'
  id: string
  text: string
  ms: number
  startedAt: number
}

export interface TextPart {
  kind: 'text'
  text: string
}

export interface ToolPart {
  kind: 'tool'
  step: ToolStep
}

export type AssistantPart = ReasoningPart | TextPart | ToolPart

export type ContextCompressionStatus = 'idle' | 'compressing' | 'error'

interface ConversationCompression {
  summary: string
  coveredMessageIds: Set<string>
}

function emptyConversationCompression(): ConversationCompression {
  return { summary: '', coveredMessageIds: new Set() }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: AssistantPart[]
  status: 'streaming' | 'done' | 'error'
  error: string
}

export interface RendererTool {
  definition: AiToolDefinition
  label: string
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

export interface AiStoreState {
  settings: AiSettings
  messages: ChatMessage[]
  conversations: StoredAiConversationSummary[]
  currentConversationId: string
  isStreaming: boolean
  isPanelOpen: boolean
  hydrated: boolean
  contextStats: AiContextStats
  contextCompressionStatus: ContextCompressionStatus
  contextCompressionNotice: string
  modelRetryNotice: string
}

export interface AiStoreActions {
  hydrate: () => Promise<void>
  registerTool: (tool: RendererTool) => void
  unregisterTool: (name: string) => void
  saveSettings: (next: AiSettings) => Promise<void>
  setSkipDeleteConversationConfirm: (value: boolean) => void
  setMemoryEnabled: (value: boolean) => Promise<void>
  setSocraticEnabled: (value: boolean) => Promise<void>
  setActiveModel: (providerId: string, modelId: string) => Promise<void>
  send: (text: string) => Promise<void>
  stop: () => Promise<void>
  resendFrom: (messageId: string, content?: string) => Promise<void>
  regenerate: (messageId: string) => Promise<void>
  retryLast: () => Promise<void>
  compressContext: () => Promise<void>
  newConversation: () => void
  openConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  persistConversation: () => Promise<void>
  setPanelOpen: (value: boolean) => void
  activeModelVisionEnabled: () => boolean
}

export type AiStore = AiStoreState & AiStoreActions

const MAIN_PROCESS_TOOL_LABELS: Record<string, string> = {
  search_place: '地点检索',
  poi_statistics: 'POI 统计',
  analyze_location: '区位分析',
  web_search: '联网搜索',
  retrieve_knowledge: '知识库检索',
  search_conversations: '历史对话检索',
  save_memory: '写入记忆',
  delete_memory: '删除记忆'
}

const MAIN_PROCESS_RUNNING_LABELS: Record<string, string> = {
  save_memory: '正在写入记忆',
  delete_memory: '正在删除记忆',
  analyze_location: '正在分析区位',
  search_conversations: '正在检索历史对话'
}

const STREAM_IDLE_TIMEOUT_MS = 120_000

const rendererTools = new Map<string, RendererTool>()

export function registerRendererTool(tool: RendererTool): void {
  rendererTools.set(tool.definition.name, tool)
}

export function unregisterRendererTool(name: string): void {
  rendererTools.delete(name)
}

export function toolLabel(name: string, running = false): string {
  if (running && MAIN_PROCESS_RUNNING_LABELS[name]) return MAIN_PROCESS_RUNNING_LABELS[name]
  return rendererTools.get(name)?.label ?? MAIN_PROCESS_TOOL_LABELS[name] ?? '工具调用'
}

function emptyContextStats(contextWindow = 128_000): AiContextStats {
  return {
    usedTokens: 0,
    contextWindow,
    usagePercent: 0,
    categories: [
      { key: 'system', label: '系统提示词', tokens: 0, ratio: 0 },
      { key: 'user', label: '用户消息', tokens: 0, ratio: 0 },
      { key: 'assistant', label: '助手回复', tokens: 0, ratio: 0 },
      { key: 'tool', label: '工具结果', tokens: 0, ratio: 0 }
    ]
  }
}

function cloneContextStats(stats: AiContextStats): AiContextStats {
  return {
    ...stats,
    categories: stats.categories.map((category) => ({ ...category }))
  }
}

function formatContextTokens(tokens: number): string {
  if (tokens < 1_000) return `${Math.max(0.1, tokens / 1_000).toFixed(1)}k`
  return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`
}

function reportsFailure(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false
  const error = (result as Record<string, unknown>).error
  return typeof error === 'string' && error !== ''
}

function updateLastAssistant(
  messages: ChatMessage[],
  updater: (message: ChatMessage) => ChatMessage | null
): ChatMessage[] | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      const updated = updater(messages[index])
      if (!updated) return null
      const next = messages.slice()
      next[index] = updated
      return next
    }
  }
  return null
}

function clonePart(part: AssistantPart): AssistantPart {
  if (part.kind === 'tool') {
    return {
      kind: 'tool',
      step: {
        ...part.step,
        args: { ...part.step.args },
        references: part.step.references ? part.step.references.map((item) => ({ ...item })) : undefined
      }
    }
  }
  return { ...part }
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    parts: message.parts.map(clonePart)
  }
}

export function createInitialAiState(): AiStoreState {
  return {
    settings: defaultAiSettings(),
    messages: [],
    conversations: [],
    currentConversationId: '',
    isStreaming: false,
    isPanelOpen: false,
    hydrated: false,
    contextStats: emptyContextStats(),
    contextCompressionStatus: 'idle',
    contextCompressionNotice: '',
    modelRetryNotice: ''
  }
}

let eventListenerBound = false
let unsubscribeAiEvent: (() => void) | null = null
let messageSeq = 0
let sessionSeq = 0
let activeSessionId = ''
let idleTimer: ReturnType<typeof setTimeout> | undefined
let contextNoticeTimer: ReturnType<typeof setTimeout> | undefined
let deltaTimer: ReturnType<typeof setTimeout> | undefined
let deltaEvent: Extract<AiChatEvent, { type: 'text-delta' | 'reasoning-delta' }> | undefined
let deltaChunks: string[] = []
let conversationLoadSequence = 0
const compressionByConversation = new Map<string, ConversationCompression>()
let compression = emptyConversationCompression()

export const useAiStore = create<AiStore>()(
  subscribeWithSelector((set, get) => {
    function clearContextNoticeTimer(): void {
      if (contextNoticeTimer !== undefined) {
        clearTimeout(contextNoticeTimer)
        contextNoticeTimer = undefined
      }
    }

    function setContextNotice(message: string, status: ContextCompressionStatus): void {
      clearContextNoticeTimer()
      set({
        contextCompressionStatus: status,
        contextCompressionNotice: message
      })
      if (status !== 'compressing' && message) {
        contextNoticeTimer = setTimeout(() => {
          set({
            contextCompressionNotice: '',
            contextCompressionStatus: 'idle'
          })
          contextNoticeTimer = undefined
        }, 4_000)
      }
    }

    function conversationTurns(): AiChatTurn[] {
      const summaryTurns: AiChatTurn[] = compression.summary ? [{ role: 'assistant', content: `[上下文摘要]\n${compression.summary}` }] : []
      return [
        ...summaryTurns,
        ...get().messages
          .filter((message) => message.status !== 'streaming' && message.status !== 'error')
          .filter((message) => !compression.coveredMessageIds.has(message.id))
          .filter((message) => message.content.trim() !== '' || message.role === 'user')
          .map((message) => ({ role: message.role, content: message.content }))
      ]
    }

    function contextEntries(): AiContextEntry[] {
      const summaryEntries: AiContextEntry[] = compression.summary ? [{ role: 'assistant', content: `[上下文摘要]\n${compression.summary}` }] : []
      return [
        ...summaryEntries,
        ...get().messages
          .filter((message) => message.status !== 'streaming')
          .filter((message) => !compression.coveredMessageIds.has(message.id))
          .flatMap((message): AiContextEntry[] => {
            const entries: AiContextEntry[] = []
            if (message.content.trim() !== '' || message.role === 'user') entries.push({ role: message.role, content: message.content })
            if (message.role === 'assistant') {
              for (const part of message.parts) {
                if (part.kind !== 'tool') continue
                const result = part.step.result.trim() || part.step.summary.trim()
                if (!result) continue
                entries.push({
                  role: 'tool',
                  content: result,
                  callId: part.step.callId,
                  name: part.step.name,
                  isError: part.step.status === 'error'
                })
              }
            }
            return entries
          })
      ]
    }

    function persistConversationCompression(): void {
      const id = get().currentConversationId
      if (!id) return
      compressionByConversation.set(id, compression)
    }

    function resetContextCompression(): void {
      compression = emptyConversationCompression()
    }

    function restoreConversationCompression(conversation: StoredAiConversation): void {
      const stored = conversation.compression
      const restored = stored
        ? { summary: stored.summary, coveredMessageIds: new Set(stored.coveredMessageIds) }
        : emptyConversationCompression()
      compressionByConversation.set(conversation.id, restored)
      compression = restored
    }

    function conversationSnapshot(): StoredAiConversation | null {
      const state = get()
      if (!state.currentConversationId) return null
      const firstUser = state.messages.find((message) => message.role === 'user')
      if (!firstUser) return null
      const existing = state.conversations.find((item) => item.id === state.currentConversationId)
      const now = Date.now()
      const snapshotted = state.messages.flatMap((message): StoredAiMessage[] => {
        const status = message.status === 'streaming' ? 'done' : message.status
        if (message.role === 'assistant' && status !== 'error' && message.content === '' && message.parts.length === 0) return []
        const clone = JSON.parse(JSON.stringify({ id: message.id, role: message.role, content: message.content, parts: message.parts, error: message.error })) as StoredAiMessage
        return [{
          ...clone,
          status,
          parts: clone.parts.map((part): StoredAiPart => part.kind === 'tool'
            ? { kind: 'tool', step: { ...part.step, status: part.step.status === 'running' ? 'ok' : part.step.status, references: part.step.references ?? [] } }
            : part)
        }]
      })
      const storedCompression: StoredAiCompression | undefined = compression.summary
        ? { summary: compression.summary, coveredMessageIds: [...compression.coveredMessageIds] }
        : undefined
      return {
        id: state.currentConversationId,
        title: firstUser.content.slice(0, 30),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: snapshotted,
        ...(storedCompression ? { compression: storedCompression } : {})
      }
    }

    async function persistConversation(): Promise<void> {
      if (typeof window === 'undefined' || !window.guEarth?.ai) return
      const conversation = conversationSnapshot()
      if (!conversation) return
      try {
        const saved = await window.guEarth.ai.chatHistory.save(conversation)
        set({ conversations: [...saved] })
      } catch (error) {
        console.warn('[ai] 会话保存失败', error)
      }
    }

    function applyCompressedContext(result: AiContextCompressionResult): void {
      const currentMessages = get().messages
      const streaming = currentMessages.find((message) => message.role === 'assistant' && message.status === 'streaming')
      const completed = currentMessages.filter((message) => message !== streaming && message.status !== 'error')
      const retainedIds = new Set<string>()
      let cursor = completed.length - 1
      for (let index = result.retainedTurns.length - 1; index >= 0; index -= 1) {
        const turn = result.retainedTurns[index]
        for (; cursor >= 0; cursor -= 1) {
          const candidate = completed[cursor]
          if (candidate.role === turn.role && candidate.content === turn.content) {
            retainedIds.add(candidate.id)
            cursor -= 1
            break
          }
        }
      }
      compression = {
        summary: result.summary,
        coveredMessageIds: new Set(completed.filter((message) => !retainedIds.has(message.id)).map((message) => message.id))
      }
      persistConversationCompression()
      void persistConversation()
      set({ contextStats: cloneContextStats(result.stats) })
    }

    async function refreshContextStats(): Promise<void> {
      if (typeof window === 'undefined' || !window.guEarth?.ai) return
      try {
        const stats = await window.guEarth.ai.getContextStats(contextEntries())
        set({ contextStats: cloneContextStats(stats) })
      } catch {
        return
      }
    }

    function clearIdleWatchdog(): void {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer)
        idleTimer = undefined
      }
    }

    function armIdleWatchdog(): void {
      clearIdleWatchdog()
      idleTimer = setTimeout(() => {
        idleTimer = undefined
        flushDeltas()
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) =>
            assistant.status === 'streaming'
              ? { ...assistant, status: 'error', error: '模型响应超时，请重试' }
              : null
          )
          return nextMessages
            ? { messages: nextMessages, isStreaming: false }
            : { isStreaming: false }
        })
      }, STREAM_IDLE_TIMEOUT_MS)
    }

    function flushDeltas(): void {
      if (deltaTimer !== undefined) clearTimeout(deltaTimer)
      deltaTimer = undefined
      const event = deltaEvent
      deltaEvent = undefined
      if (!event) return
      const text = deltaChunks.join('')
      deltaChunks = []
      applyEvent({ ...event, text })
    }

    function handleEvent(event: AiChatEvent): void {
      if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
        if (event.sessionId !== activeSessionId) return
        if (get().isStreaming) armIdleWatchdog()
        if (deltaEvent && (deltaEvent.type !== event.type || deltaEvent.sessionId !== event.sessionId)) flushDeltas()
        deltaEvent = event
        deltaChunks.push(event.text)
        if (deltaTimer === undefined) deltaTimer = setTimeout(flushDeltas, 32)
        return
      }
      flushDeltas()
      applyEvent(event)
    }

    function applyEvent(event: AiChatEvent): void {
      if (event.type === 'context-stats') {
        if (event.sessionId === activeSessionId) set({ contextStats: cloneContextStats(event.stats) })
        return
      }
      if (event.type === 'context-compression-start') {
        if (event.sessionId === activeSessionId) setContextNotice('正在整理对话…', 'compressing')
        return
      }
      if (event.type === 'context-compressed') {
        if (event.sessionId === activeSessionId) {
          applyCompressedContext({
            summary: event.summary,
            retainedTurns: event.retainedTurns,
            stats: event.stats,
            beforeTokens: event.beforeTokens,
            afterTokens: event.afterTokens
          })
          setContextNotice(`已精简对话 ${formatContextTokens(event.afterTokens)}`, 'idle')
        }
        return
      }
      if (event.type === 'context-compression-error') {
        if (event.sessionId === activeSessionId) setContextNotice('整理失败', 'error')
        return
      }
      if (event.type === 'model-retry') {
        if (event.sessionId === activeSessionId) {
          set({ modelRetryNotice: `模型请求失败（${event.reason}），正在自动重试 ${event.attempt}/${event.maxRetries}…` })
        }
        return
      }
      if (event.sessionId !== activeSessionId) return
      if (get().isStreaming) armIdleWatchdog()
      if (event.type === 'reasoning-delta' || event.type === 'text-delta') {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) => {
            if (assistant.status !== 'streaming') return null
            const last = assistant.parts[assistant.parts.length - 1]
            if (event.type === 'reasoning-delta') {
              if (last && last.kind === 'reasoning') {
                const updatedPart: ReasoningPart = {
                  ...last,
                  text: last.text + event.text,
                  ms: Date.now() - last.startedAt
                }
                return {
                  ...assistant,
                  parts: [...assistant.parts.slice(0, -1), updatedPart]
                }
              }
              const startedAt = Date.now()
              const newPart: ReasoningPart = {
                kind: 'reasoning',
                id: `${assistant.id}-r${assistant.parts.length}`,
                text: event.text,
                ms: 0,
                startedAt
              }
              return {
                ...assistant,
                parts: [...assistant.parts, newPart]
              }
            }
            if (last && last.kind === 'text') {
              const updatedPart: TextPart = {
                ...last,
                text: last.text + event.text
              }
              return {
                ...assistant,
                content: assistant.content + event.text,
                parts: [...assistant.parts.slice(0, -1), updatedPart]
              }
            }
            const newPart: TextPart = { kind: 'text', text: event.text }
            return {
              ...assistant,
              content: assistant.content + event.text,
              parts: [...assistant.parts, newPart]
            }
          })
          return nextMessages
            ? { modelRetryNotice: '', messages: nextMessages }
            : { modelRetryNotice: '' }
        })
        return
      }
      if (event.type === 'tool-start') {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) => {
            if (assistant.status !== 'streaming') return null
            const newPart: ToolPart = {
              kind: 'tool',
              step: {
                callId: event.callId,
                name: event.name,
                args: { ...((event.args ?? {}) as Record<string, unknown>) },
                status: 'running',
                summary: '',
                result: ''
              }
            }
            return {
              ...assistant,
              parts: [...assistant.parts, newPart]
            }
          })
          return nextMessages ? { messages: nextMessages } : state
        })
        return
      }
      if (event.type === 'tool-end') {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) => {
            const partIndex = assistant.parts.findIndex(
              (part): part is ToolPart => part.kind === 'tool' && part.step.callId === event.callId
            )
            if (partIndex < 0) return null
            const existing = assistant.parts[partIndex] as ToolPart
            const updatedPart: ToolPart = {
              kind: 'tool',
              step: {
                ...existing.step,
                status: event.ok ? 'ok' : 'error',
                summary: event.summary,
                result: event.result,
                references: event.references ? event.references.map((item) => ({ ...item })) : undefined
              }
            }
            const parts = assistant.parts.slice()
            parts[partIndex] = updatedPart
            return { ...assistant, parts }
          })
          return nextMessages ? { messages: nextMessages } : state
        })
        return
      }
      if (event.type === 'execute-tool') {
        void (async () => {
          const tool = rendererTools.get(event.name)
          if (!tool) {
            await window.guEarth.ai.toolResult(event.sessionId, event.callId, false, { error: `未知工具 ${event.name}` })
            return
          }
          try {
            const result = await tool.execute((event.args ?? {}) as Record<string, unknown>)
            await window.guEarth.ai.toolResult(event.sessionId, event.callId, !reportsFailure(result), result ?? { ok: true })
          } catch (error) {
            await window.guEarth.ai.toolResult(event.sessionId, event.callId, false, { error: error instanceof Error ? error.message : '工具执行失败' })
          }
        })()
        return
      }
      if (event.type === 'done') {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) =>
            assistant.status === 'streaming' ? { ...assistant, status: 'done' } : null
          )
          return nextMessages
            ? { messages: nextMessages, modelRetryNotice: '', isStreaming: false }
            : { modelRetryNotice: '', isStreaming: false }
        })
        clearIdleWatchdog()
        void persistConversation()
        return
      }
      if (event.type === 'error') {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) => {
            if (assistant.status !== 'streaming') return null
            const parts = assistant.parts.map((part): AssistantPart => {
              if (part.kind === 'tool' && part.step.name === 'web_search' && part.step.status === 'running') {
                return {
                  kind: 'tool',
                  step: {
                    ...part.step,
                    status: 'error',
                    summary: event.message,
                    result: JSON.stringify({ error: event.message })
                  }
                }
              }
              return part
            })
            return {
              ...assistant,
              status: 'error',
              error: event.message,
              parts
            }
          })
          return nextMessages
            ? { messages: nextMessages, modelRetryNotice: '', isStreaming: false }
            : { modelRetryNotice: '', isStreaming: false }
        })
        clearIdleWatchdog()
        void persistConversation()
      }
    }

    function bindEventListener(): void {
      if (eventListenerBound || typeof window === 'undefined' || !window.guEarth?.ai) return
      eventListenerBound = true
      unsubscribeAiEvent = window.guEarth.ai.onEvent(handleEvent)
    }

    function toolDefinitions(): AiToolDefinition[] {
      return [...rendererTools.values()].map((tool) => tool.definition)
    }

    function activeModelReady(): boolean {
      const currentSettings = get().settings
      const provider = currentSettings.providers.find((item) => item.id === currentSettings.activeProviderId)
      return Boolean(provider?.models.some((model) => model.id === currentSettings.activeModelId))
    }

    async function hydrate(): Promise<void> {
      bindEventListener()
      if (get().hydrated || typeof window === 'undefined' || !window.guEarth?.ai) return
      try {
        const nextSettings = await window.guEarth.ai.getSettings()
        set({ settings: nextSettings, hydrated: true })
      } catch {
        set({ settings: defaultAiSettings() })
      }
      try {
        const list = await window.guEarth.ai.chatHistory.list()
        set({ conversations: [...list] })
      } catch {
        set({ conversations: [] })
      }
    }

    async function saveSettings(next: AiSettings): Promise<void> {
      const saved = await window.guEarth.ai.updateSettings(next)
      set({ settings: saved })
      void refreshContextStats()
    }

    async function send(text: string): Promise<void> {
      const question = text.trim()
      if (!question || get().isStreaming) return
      captureAiUsageEvent('ai_prompt_submitted', { prompt_length: question.length })
      conversationLoadSequence += 1
      set({ modelRetryNotice: '' })
      await hydrate()
      messageSeq += 1
      const userMessage: ChatMessage = { id: `m${messageSeq}`, role: 'user', content: question, parts: [], status: 'done', error: '' }
      messageSeq += 1
      const assistantMessage: ChatMessage = { id: `m${messageSeq}`, role: 'assistant', content: '', parts: [], status: 'streaming', error: '' }
      set((state) => ({
        messages: [...state.messages, userMessage, assistantMessage],
        currentConversationId: state.currentConversationId || crypto.randomUUID()
      }))
      void refreshContextStats()
      void persistConversation()
      if (!activeModelReady()) {
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) => ({
            ...assistant,
            status: 'error',
            error: '尚未配置 AI 模型：请点击右上角设置，添加服务商和模型并保存 API Key'
          }))
          return nextMessages ? { messages: nextMessages } : state
        })
        void persistConversation()
        return
      }
      sessionSeq += 1
      activeSessionId = `s${sessionSeq}`
      const sessionId = activeSessionId
      set({ isStreaming: true })
      armIdleWatchdog()
      const turns = conversationTurns()
      const distinctId = useAccountStore.getState().profile?.sub.trim() ?? ''
      try {
        await window.guEarth.ai.chat(sessionId, turns, toolDefinitions(), get().currentConversationId, distinctId)
      } catch (error) {
        flushDeltas()
        const errorMessage = ipcErrorMessage(error, 'AI 请求失败')
        set((state) => {
          const nextMessages = updateLastAssistant(state.messages, (assistant) =>
            assistant.status === 'streaming'
              ? { ...assistant, status: 'error', error: errorMessage }
              : null
          )
          return nextMessages
            ? { messages: nextMessages, isStreaming: false }
            : { isStreaming: false }
        })
        clearIdleWatchdog()
        void persistConversation()
      }
    }

    async function regenerate(messageId: string): Promise<void> {
      const state = get()
      if (state.isStreaming) return
      const index = state.messages.findIndex((message) => message.id === messageId)
      if (index < 0 || state.messages[index].role !== 'assistant') return
      let userIndex = -1
      for (let cursor = index; cursor >= 0; cursor -= 1) {
        if (state.messages[cursor].role === 'user') {
          userIndex = cursor
          break
        }
      }
      if (userIndex < 0) return
      const question = state.messages[userIndex]
      const text = question.content.trim()
      if (!text) return
      set({ messages: state.messages.slice(0, userIndex) })
      await send(text)
    }

    return {
      ...createInitialAiState(),
      hydrate,
      registerTool: registerRendererTool,
      unregisterTool: unregisterRendererTool,
      saveSettings,
      setSkipDeleteConversationConfirm(value: boolean): void {
        const next = JSON.parse(JSON.stringify(get().settings)) as AiSettings
        next.skipDeleteConversationConfirm = value
        void saveSettings(next)
      },
      async setMemoryEnabled(value: boolean): Promise<void> {
        const next = JSON.parse(JSON.stringify(get().settings)) as AiSettings
        next.memoryEnabled = value
        await saveSettings(next)
      },
      async setSocraticEnabled(value: boolean): Promise<void> {
        const next = JSON.parse(JSON.stringify(get().settings)) as AiSettings
        next.socraticEnabled = value
        await saveSettings(next)
      },
      async setActiveModel(providerId: string, modelId: string): Promise<void> {
        const next = JSON.parse(JSON.stringify(get().settings)) as AiSettings
        const provider = next.providers.find((item) => item.id === providerId)
        if (!provider?.models.some((model) => model.id === modelId)) return
        next.activeProviderId = providerId
        next.activeModelId = modelId
        await saveSettings(next)
      },
      send,
      async stop(): Promise<void> {
        if (!activeSessionId) return
        await window.guEarth.ai.stop(activeSessionId)
      },
      async resendFrom(messageId: string, content?: string): Promise<void> {
        const state = get()
        if (state.isStreaming) return
        const index = state.messages.findIndex((message) => message.id === messageId)
        if (index < 0) return
        const anchor = state.messages[index]
        if (anchor.role !== 'user') return
        const text = (content ?? anchor.content).trim()
        if (!text) return
        set({ messages: state.messages.slice(0, index) })
        await send(text)
      },
      regenerate,
      async retryLast(): Promise<void> {
        const state = get()
        if (state.isStreaming) return
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
          const message = state.messages[index]
          if (message.role === 'assistant' && message.status === 'error') {
            const question = state.messages[index - 1]
            if (!question || question.role !== 'user') return
            await regenerate(message.id)
            return
          }
        }
      },
      async compressContext(): Promise<void> {
        if (get().isStreaming || typeof window === 'undefined' || !window.guEarth?.ai) return
        setContextNotice('正在整理对话…', 'compressing')
        try {
          const distinctId = useAccountStore.getState().profile?.sub.trim() ?? ''
          const result = await window.guEarth.ai.compressContext(contextEntries(), get().currentConversationId, distinctId)
          applyCompressedContext(result)
          setContextNotice(`已精简对话 ${formatContextTokens(result.afterTokens)}`, 'idle')
        } catch {
          setContextNotice('整理失败', 'error')
        }
      },
      newConversation(): void {
        if (get().isStreaming) return
        conversationLoadSequence += 1
        resetContextCompression()
        clearContextNoticeTimer()
        set((state) => ({
          currentConversationId: '',
          messages: [],
          contextStats: emptyContextStats(state.contextStats.contextWindow),
          contextCompressionStatus: 'idle',
          contextCompressionNotice: ''
        }))
        useFlightStopsStore.getState().clear()
      },
      async openConversation(id: string): Promise<void> {
        if (get().isStreaming || id === get().currentConversationId || typeof window === 'undefined' || !window.guEarth?.ai) return
        const sequence = ++conversationLoadSequence
        try {
          const conversation = await window.guEarth.ai.chatHistory.get(id)
          if (!conversation || sequence !== conversationLoadSequence || get().isStreaming) return
          const loadedMessages = (conversation.messages as ChatMessage[]).map(cloneMessage)
          set({
            currentConversationId: id,
            messages: loadedMessages
          })
          restoreConversationCompression(conversation)
          useFlightStopsStore.getState().clear()
          void refreshContextStats()
        } catch (error) {
          console.warn('[ai] 会话读取失败', error)
        }
      },
      async deleteConversation(id: string): Promise<void> {
        conversationLoadSequence += 1
        compressionByConversation.delete(id)
        if (get().currentConversationId === id) {
          resetContextCompression()
          set((state) => ({
            currentConversationId: '',
            messages: [],
            contextStats: emptyContextStats(state.contextStats.contextWindow)
          }))
          useFlightStopsStore.getState().clear()
        }
        if (typeof window === 'undefined' || !window.guEarth?.ai) return
        try {
          const remaining = await window.guEarth.ai.chatHistory.delete(id)
          set({ conversations: [...remaining] })
        } catch {
          return
        }
      },
      persistConversation,
      setPanelOpen(value: boolean): void {
        set({ isPanelOpen: value })
        if (value) {
          void hydrate()
          void refreshContextStats()
        }
      },
      activeModelVisionEnabled(): boolean {
        const currentSettings = get().settings
        const provider = currentSettings.providers.find((item) => item.id === currentSettings.activeProviderId)
        return provider?.models.find((model) => model.id === currentSettings.activeModelId)?.vision === true
      }
    }
  })
)

export function resetAiStore(): void {
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }
  if (contextNoticeTimer !== undefined) {
    clearTimeout(contextNoticeTimer)
    contextNoticeTimer = undefined
  }
  if (deltaTimer !== undefined) {
    clearTimeout(deltaTimer)
    deltaTimer = undefined
  }
  deltaEvent = undefined
  deltaChunks = []
  if (unsubscribeAiEvent) {
    unsubscribeAiEvent()
    unsubscribeAiEvent = null
  }
  eventListenerBound = false
  messageSeq = 0
  sessionSeq = 0
  activeSessionId = ''
  conversationLoadSequence = 0
  compressionByConversation.clear()
  compression = emptyConversationCompression()
  rendererTools.clear()
  useAiStore.setState(createInitialAiState())
}
