import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AiChatEvent, AiChatTurn, AiContextCompressionResult, AiContextEntry, AiContextStats, AiSearchReference, AiSettings, AiToolDefinition, StoredAiCompression, StoredAiConversation, StoredAiMessage, StoredAiPart } from '../../../preload'
import { defaultAiSettings } from '../../../shared/aiSettings'

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

const MAIN_PROCESS_TOOL_LABELS: Record<string, string> = {
  search_place: '地点检索',
  poi_statistics: 'POI 统计',
  analyze_location: '区位分析',
  web_search: '联网搜索',
  retrieve_knowledge: '知识库检索',
  save_memory: '写入记忆',
  delete_memory: '删除记忆'
}

const MAIN_PROCESS_RUNNING_LABELS: Record<string, string> = {
  save_memory: '正在写入记忆',
  delete_memory: '正在删除记忆',
  analyze_location: '正在分析区位'
}

export function toolLabel(name: string, running = false): string {
  if (running && MAIN_PROCESS_RUNNING_LABELS[name]) return MAIN_PROCESS_RUNNING_LABELS[name]
  return rendererTools.get(name)?.label ?? MAIN_PROCESS_TOOL_LABELS[name] ?? '工具调用'
}

let eventListenerBound = false
let messageSeq = 0
let sessionSeq = 0
let activeSessionId = ''
let idleTimer: ReturnType<typeof setTimeout> | undefined

const STREAM_IDLE_TIMEOUT_MS = 120_000

const rendererTools = new Map<string, RendererTool>()

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

function formatContextTokens(tokens: number): string {
  if (tokens < 1_000) return `${Math.max(0.1, tokens / 1_000).toFixed(1)}k`
  return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`
}

function stripIpcErrorPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':?\s*(Error:\s*)?/i, '')
}

function reportsFailure(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false
  const error = (result as Record<string, unknown>).error
  return typeof error === 'string' && error !== ''
}

export const useAiStore = defineStore('ai', () => {
  const settings = ref<AiSettings>(defaultAiSettings())
  const messages = ref<ChatMessage[]>([])
  const conversations = ref<StoredAiConversation[]>([])
  const currentConversationId = ref('')
  const isStreaming = ref(false)
  const isPanelOpen = ref(false)
  const isSettingsOpen = ref(false)
  const hydrated = ref(false)
  const contextStats = ref<AiContextStats>(emptyContextStats())
  const contextCompressionStatus = ref<ContextCompressionStatus>('idle')
  const contextCompressionNotice = ref('')
  const modelRetryNotice = ref('')
  let contextNoticeTimer: ReturnType<typeof setTimeout> | undefined
  const compressionByConversation = new Map<string, ConversationCompression>()
  let compression = emptyConversationCompression()

  function currentAssistant(): ChatMessage | undefined {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.role === 'assistant') return message
    }
    return undefined
  }

  function clearContextNoticeTimer(): void {
    if (contextNoticeTimer !== undefined) {
      clearTimeout(contextNoticeTimer)
      contextNoticeTimer = undefined
    }
  }

  function setContextNotice(message: string, status: ContextCompressionStatus): void {
    clearContextNoticeTimer()
    contextCompressionStatus.value = status
    contextCompressionNotice.value = message
    if (status !== 'compressing' && message) {
      contextNoticeTimer = setTimeout(() => {
        contextCompressionNotice.value = ''
        contextCompressionStatus.value = 'idle'
        contextNoticeTimer = undefined
      }, 4_000)
    }
  }

  function conversationTurns(): AiChatTurn[] {
    const summaryTurns: AiChatTurn[] = compression.summary ? [{ role: 'assistant', content: `[上下文摘要]\n${compression.summary}` }] : []
    return [
      ...summaryTurns,
      ...messages.value
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
      ...messages.value
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

  function applyCompressedContext(result: AiContextCompressionResult): void {
    const streaming = messages.value.find((message) => message.role === 'assistant' && message.status === 'streaming')
    const completed = messages.value.filter((message) => message !== streaming && message.status !== 'error')
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
    contextStats.value = result.stats
  }

  function persistConversationCompression(): void {
    if (!currentConversationId.value) return
    compressionByConversation.set(currentConversationId.value, compression)
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

  async function refreshContextStats(): Promise<void> {
    if (!window.guEarth?.ai) return
    try {
      contextStats.value = await window.guEarth.ai.getContextStats(contextEntries())
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
      const assistant = currentAssistant()
      if (assistant && assistant.status === 'streaming') {
        assistant.status = 'error'
        assistant.error = '模型响应超时，请重试'
      }
      isStreaming.value = false
    }, STREAM_IDLE_TIMEOUT_MS)
  }

  function handleEvent(event: AiChatEvent): void {
    if (event.type === 'context-stats') {
      if (event.sessionId === activeSessionId) contextStats.value = event.stats
      return
    }
    if (event.type === 'context-compression-start') {
      if (event.sessionId === activeSessionId) setContextNotice('正在压缩上下文...', 'compressing')
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
        setContextNotice(`已压缩上下文 ${formatContextTokens(event.afterTokens)}`, 'idle')
      }
      return
    }
    if (event.type === 'context-compression-error') {
      if (event.sessionId === activeSessionId) setContextNotice('无法压缩上下文', 'error')
      return
    }
    if (event.type === 'model-retry') {
      if (event.sessionId === activeSessionId) modelRetryNotice.value = `模型请求失败（${event.reason}），正在自动重试 ${event.attempt}/${event.maxRetries}…`
      return
    }
    if (event.sessionId !== activeSessionId) return
    if (isStreaming.value) armIdleWatchdog()
    if (event.type === 'reasoning-delta' || event.type === 'text-delta') {
      modelRetryNotice.value = ''
      const assistant = currentAssistant()
      if (!assistant || assistant.status !== 'streaming') return
      const last = assistant.parts[assistant.parts.length - 1]
      if (event.type === 'reasoning-delta') {
        let part = last && last.kind === 'reasoning' ? last : undefined
        if (!part) {
          part = { kind: 'reasoning', id: `${assistant.id}-r${assistant.parts.length}`, text: '', ms: 0, startedAt: Date.now() }
          assistant.parts.push(part)
        }
        part.text += event.text
        part.ms = Date.now() - part.startedAt
      } else if (last && last.kind === 'text') {
        assistant.content += event.text
        last.text += event.text
      } else {
        assistant.content += event.text
        assistant.parts.push({ kind: 'text', text: event.text })
      }
      return
    }
    if (event.type === 'tool-start') {
      const assistant = currentAssistant()
      if (!assistant || assistant.status !== 'streaming') return
      assistant.parts.push({ kind: 'tool', step: { callId: event.callId, name: event.name, args: (event.args ?? {}) as Record<string, unknown>, status: 'running', summary: '', result: '' } })
      return
    }
    if (event.type === 'tool-end') {
      const assistant = currentAssistant()
      const step = assistant?.parts.find((part): part is ToolPart => part.kind === 'tool' && part.step.callId === event.callId)?.step
      if (step) {
        step.status = event.ok ? 'ok' : 'error'
        step.summary = event.summary
        step.result = event.result
        step.references = event.references
      }
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
      const assistant = currentAssistant()
      if (assistant && assistant.status === 'streaming') assistant.status = 'done'
      modelRetryNotice.value = ''
      clearIdleWatchdog()
      isStreaming.value = false
      void persistConversation()
      return
    }
    if (event.type === 'error') {
      const assistant = currentAssistant()
      modelRetryNotice.value = ''
      if (assistant && assistant.status === 'streaming') {
        assistant.status = 'error'
        assistant.error = event.message
        for (const part of assistant.parts) {
          if (part.kind === 'tool' && part.step.name === 'web_search' && part.step.status === 'running') {
            part.step.status = 'error'
            part.step.summary = event.message
            part.step.result = JSON.stringify({ error: event.message })
          }
        }
      }
      clearIdleWatchdog()
      isStreaming.value = false
      void persistConversation()
    }
  }

  function bindEventListener(): void {
    if (eventListenerBound || typeof window === 'undefined' || !window.guEarth?.ai) return
    eventListenerBound = true
    window.guEarth.ai.onEvent(handleEvent)
  }

  async function hydrate(): Promise<void> {
    bindEventListener()
    if (hydrated.value || !window.guEarth?.ai) return
    try {
      settings.value = await window.guEarth.ai.getSettings()
      hydrated.value = true
    } catch {
      settings.value = defaultAiSettings()
    }
    try {
      conversations.value = await window.guEarth.ai.chatHistory.list()
    } catch {
      conversations.value = []
    }
  }

  function conversationSnapshot(): StoredAiConversation | null {
    if (!currentConversationId.value) return null
    const firstUser = messages.value.find((message) => message.role === 'user')
    if (!firstUser) return null
    const existing = conversations.value.find((item) => item.id === currentConversationId.value)
    const now = Date.now()
    const snapshotted = messages.value.flatMap((message): StoredAiMessage[] => {
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
      id: currentConversationId.value,
      title: firstUser.content.slice(0, 30),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages: snapshotted,
      ...(storedCompression ? { compression: storedCompression } : {})
    }
  }

  async function persistConversation(): Promise<void> {
    if (!window.guEarth?.ai) return
    const conversation = conversationSnapshot()
    if (!conversation) return
    try {
      conversations.value = await window.guEarth.ai.chatHistory.save(conversation)
    } catch (error) {
      console.warn('[ai] 会话保存失败', error)
    }
  }

  function registerTool(tool: RendererTool): void {
    rendererTools.set(tool.definition.name, tool)
  }

  function toolDefinitions(): AiToolDefinition[] {
    return [...rendererTools.values()].map((tool) => tool.definition)
  }

  async function saveSettings(next: AiSettings): Promise<void> {
    settings.value = await window.guEarth.ai.updateSettings(next)
    void refreshContextStats()
  }

  function setSkipDeleteConversationConfirm(value: boolean): void {
    const next = JSON.parse(JSON.stringify(settings.value)) as AiSettings
    next.skipDeleteConversationConfirm = value
    void saveSettings(next)
  }

  async function setMemoryEnabled(value: boolean): Promise<void> {
    const next = JSON.parse(JSON.stringify(settings.value)) as AiSettings
    next.memoryEnabled = value
    await saveSettings(next)
  }

  async function setSocraticEnabled(value: boolean): Promise<void> {
    const next = JSON.parse(JSON.stringify(settings.value)) as AiSettings
    next.socraticEnabled = value
    await saveSettings(next)
  }

  function activeModelReady(): boolean {
    const provider = settings.value.providers.find((item) => item.id === settings.value.activeProviderId)
    return Boolean(provider?.models.some((model) => model.id === settings.value.activeModelId))
  }

  function activeModelVisionEnabled(): boolean {
    const provider = settings.value.providers.find((item) => item.id === settings.value.activeProviderId)
    return provider?.models.find((item) => item.id === settings.value.activeModelId)?.vision === true
  }

  async function send(text: string): Promise<void> {
    const question = text.trim()
    if (!question || isStreaming.value) return
    modelRetryNotice.value = ''
    await hydrate()
    messageSeq += 1
    messages.value.push({ id: `m${messageSeq}`, role: 'user', content: question, parts: [], status: 'done', error: '' })
    messageSeq += 1
    messages.value.push({ id: `m${messageSeq}`, role: 'assistant', content: '', parts: [], status: 'streaming', error: '' })
    if (!currentConversationId.value) currentConversationId.value = crypto.randomUUID()
    void refreshContextStats()
    void persistConversation()
    if (!activeModelReady()) {
      const assistant = currentAssistant()
      if (assistant) {
        assistant.status = 'error'
        assistant.error = '尚未配置 AI 模型：点击右上角设置，添加供应商与模型并保存 API Key'
      }
      void persistConversation()
      return
    }
    sessionSeq += 1
    activeSessionId = `s${sessionSeq}`
    const sessionId = activeSessionId
    isStreaming.value = true
    armIdleWatchdog()
    const turns = conversationTurns()
    try {
      await window.guEarth.ai.chat(sessionId, turns, toolDefinitions())
    } catch (error) {
      const assistant = currentAssistant()
      if (assistant && assistant.status === 'streaming') {
        assistant.status = 'error'
        assistant.error = stripIpcErrorPrefix(error instanceof Error ? error.message : 'AI 请求失败')
      }
      clearIdleWatchdog()
      isStreaming.value = false
      void persistConversation()
    }
  }

  async function resendFrom(messageId: string, content?: string): Promise<void> {
    if (isStreaming.value) return
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index < 0) return
    const anchor = messages.value[index]
    if (anchor.role !== 'user') return
    const text = (content ?? anchor.content).trim()
    if (!text) return
    messages.value = messages.value.slice(0, index)
    await send(text)
  }

  async function regenerate(messageId: string): Promise<void> {
    if (isStreaming.value) return
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index < 0 || messages.value[index].role !== 'assistant') return
    let userIndex = -1
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (messages.value[cursor].role === 'user') {
        userIndex = cursor
        break
      }
    }
    if (userIndex < 0) return
    const question = messages.value[userIndex]
    const text = question.content.trim()
    if (!text) return
    messages.value = messages.value.slice(0, userIndex)
    await send(text)
  }

  async function retryLast(): Promise<void> {
    if (isStreaming.value) return
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.role === 'assistant' && message.status === 'error') {
        const question = messages.value[index - 1]
        if (!question || question.role !== 'user') return
        await regenerate(message.id)
        return
      }
    }
  }

  async function compressContext(): Promise<void> {
    if (isStreaming.value || !window.guEarth?.ai) return
    setContextNotice('正在压缩上下文...', 'compressing')
    try {
      const result = await window.guEarth.ai.compressContext(contextEntries())
      applyCompressedContext(result)
      setContextNotice(`已压缩上下文 ${formatContextTokens(result.afterTokens)}`, 'idle')
    } catch {
      setContextNotice('无法压缩上下文', 'error')
    }
  }

  async function stop(): Promise<void> {
    if (!activeSessionId) return
    await window.guEarth.ai.stop(activeSessionId)
  }

  function newConversation(): void {
    if (isStreaming.value) return
    currentConversationId.value = ''
    messages.value = []
    resetContextCompression()
    contextStats.value = emptyContextStats(contextStats.value.contextWindow)
    setContextNotice('', 'idle')
  }

  function openConversation(id: string): void {
    if (isStreaming.value) return
    const conversation = conversations.value.find((item) => item.id === id)
    if (!conversation || conversation.id === currentConversationId.value) return
    currentConversationId.value = id
    messages.value = JSON.parse(JSON.stringify(conversation.messages)) as ChatMessage[]
    restoreConversationCompression(conversation)
    void refreshContextStats()
  }

  async function deleteConversation(id: string): Promise<void> {
    compressionByConversation.delete(id)
    if (currentConversationId.value === id) {
      currentConversationId.value = ''
      messages.value = []
      resetContextCompression()
      contextStats.value = emptyContextStats(contextStats.value.contextWindow)
    }
    if (!window.guEarth?.ai) return
    try {
      conversations.value = await window.guEarth.ai.chatHistory.delete(id)
    } catch {
      return
    }
  }

  function setPanelOpen(value: boolean): void {
    isPanelOpen.value = value
    if (value) {
      void hydrate()
      void refreshContextStats()
    }
  }

  function setSettingsOpen(value: boolean): void {
    isSettingsOpen.value = value
  }

  async function setActiveModel(providerId: string, modelId: string): Promise<void> {
    const next = JSON.parse(JSON.stringify(settings.value)) as AiSettings
    const provider = next.providers.find((item) => item.id === providerId)
    if (!provider?.models.some((model) => model.id === modelId)) return
    next.activeProviderId = providerId
    next.activeModelId = modelId
    await saveSettings(next)
  }

  return {
    settings, messages, conversations, currentConversationId, isStreaming, isPanelOpen, isSettingsOpen, hydrated, contextStats, contextCompressionStatus, contextCompressionNotice, modelRetryNotice,
    hydrate, registerTool, saveSettings, setSkipDeleteConversationConfirm, setMemoryEnabled, setSocraticEnabled, setActiveModel, send, stop, resendFrom, regenerate, retryLast, compressContext, newConversation, openConversation, deleteConversation, persistConversation, setPanelOpen, setSettingsOpen,
    activeModelVisionEnabled
  }
})
