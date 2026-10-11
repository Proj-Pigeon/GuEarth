<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Bubble, Sender, Suggestion } from 'ant-design-x-vue'
import { Modal } from 'ant-design-vue'
import type { VNode } from 'vue'
import { CloseCircleOutlined, CloseOutlined, CompassOutlined, CompressOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SettingOutlined, UpOutlined } from '@ant-design/icons-vue'
import { useAiStore, toolLabel, type ChatMessage, type ReasoningPart, type ToolStep } from '@renderer/stores/ai'
import type { AiModelConfig, AiProviderConfig, StoredAiConversationSummary } from '../../../preload'
import ContextMeter from './ContextMeter.vue'
import StreamingMarkdown from './StreamingMarkdown.vue'
import WebSearchStep from './WebSearchStep.vue'

const store = useAiStore()
const { messages, conversations, currentConversationId, isStreaming, isPanelOpen, isSettingsOpen, settings, contextStats, contextCompressionStatus, contextCompressionNotice, modelRetryNotice } = storeToRefs(store)

const draft = ref('')
const listRef = ref<HTMLDivElement>()
let scrollFrame: number | undefined
let scrollQueued = false
const historyOpen = ref(false)
const deleteConfirmOpen = ref(false)
const deleteTarget = ref<StoredAiConversationSummary | null>(null)
const deleteNoAsk = ref(false)
const modelMenuOpen = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const drawerWidth = ref(Math.min(420, Math.floor(viewportWidth.value / 3)))
const isResizingDrawer = ref(false)

const drawerMaxWidth = computed(() => Math.max(0, Math.floor(viewportWidth.value / 3)))
const drawerMinWidth = computed(() => Math.min(320, drawerMaxWidth.value))
const modelProviders = computed(() => settings.value.providers.filter((provider) => provider.models.length > 0))
const activeProvider = computed(() => settings.value.providers.find((provider) => provider.id === settings.value.activeProviderId))
const activeModel = computed(() => activeProvider.value?.models.find((model) => model.id === settings.value.activeModelId))
const activeModelLabel = computed(() => activeModel.value?.label || activeModel.value?.id || '选择模型')

interface AgentCommand {
  name: string
  label: string
  icon: typeof CompressOutlined
  run: () => void | Promise<void>
}

interface AgentSuggestionItem {
  value: string
  label: VNode
}

const commandMenuOpen = ref(false)
const activeCommandIndex = ref(0)
const agentCommands: AgentCommand[] = [
  { name: '/new', label: '新建会话', icon: PlusOutlined, run: () => store.newConversation() },
  { name: '/resume', label: '历史会话', icon: HistoryOutlined, run: () => { historyOpen.value = true } },
  { name: '/compact', label: '压缩上下文', icon: CompressOutlined, run: () => store.compressContext() },
  { name: '/settings', label: 'AI 设置', icon: SettingOutlined, run: () => store.setSettingsOpen(true) }
]
const commandQuery = computed(() => {
  const value = draft.value.trimStart()
  if (!value.startsWith('/')) return ''
  return value.slice(1).split(/\s/)[0].toLowerCase()
})
const filteredCommands = computed(() => agentCommands.filter((command) => !commandQuery.value || command.name.slice(1).startsWith(commandQuery.value)))
const commandItems = computed<AgentSuggestionItem[]>(() => filteredCommands.value.map((command, index) => ({
  value: command.name,
  label: h('div', { class: ['eoq-command-option', { 'eoq-command-option-active': index === activeCommandIndex.value }] }, [
    h('span', { class: 'eoq-command-option-icon' }, h(command.icon)),
    h('span', { class: 'eoq-command-option-name' }, command.name),
    h('span', { class: 'eoq-command-option-label' }, command.label)
  ])
})))
const activeCommand = computed(() => filteredCommands.value[activeCommandIndex.value] ?? filteredCommands.value[0])

function moveActiveCommand(offset: number): void {
  const total = filteredCommands.value.length
  if (total === 0) return
  activeCommandIndex.value = (activeCommandIndex.value + offset + total) % total
}

function updateCommandMenu(): void {
  commandMenuOpen.value = draft.value.trimStart().startsWith('/') && !isStreaming.value && filteredCommands.value.length > 0
}

function selectCommand(command: AgentCommand): void {
  draft.value = ''
  commandMenuOpen.value = false
  void command.run()
}

function handleDraftChange(value: string, onTrigger?: (info?: unknown | false) => void): void {
  draft.value = value
  activeCommandIndex.value = 0
  updateCommandMenu()
  if (commandMenuOpen.value) onTrigger?.()
  else onTrigger?.(false)
}

function completeCommand(onTrigger?: (info?: unknown | false) => void): boolean {
  const command = activeCommand.value
  if (!command) return false
  draft.value = command.name
  activeCommandIndex.value = 0
  updateCommandMenu()
  if (commandMenuOpen.value) onTrigger?.()
  else onTrigger?.(false)
  return true
}

function handleSuggestionKeyDown(event: KeyboardEvent, onTrigger?: (info?: unknown | false) => void): void {
  if (commandMenuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      moveActiveCommand(event.key === 'ArrowDown' ? 1 : -1)
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && completeCommand(onTrigger)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const command = activeCommand.value
      if (command) selectCommand(command)
      return
    }
    if (event.key === 'Escape') {
      commandMenuOpen.value = false
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    event.stopImmediatePropagation()
    runCommandOrSubmit(draft.value)
    return
  }
}

function runCommandOrSubmit(value: string | undefined): void {
  const text = (typeof value === 'string' && value.trim() ? value : draft.value).trim()
  const command = text.match(/^\/([^\s]+)(?:\s+.*)?$/)?.[1].toLowerCase()
  if (command) {
    const matched = agentCommands.find((item) => item.name.slice(1) === command)
    if (matched) {
      selectCommand(matched)
      return
    }
  }
  commandMenuOpen.value = false
  submit(text)
}

function clampDrawerWidth(width: number): number {
  return Math.min(drawerMaxWidth.value, Math.max(drawerMinWidth.value, Math.round(width)))
}

function readDrawerWidth(): void {
  try {
    const stored = Number(window.localStorage.getItem('guearth.eoq-drawer-width'))
    if (Number.isFinite(stored) && stored > 0) drawerWidth.value = clampDrawerWidth(stored)
  } catch {
    drawerWidth.value = clampDrawerWidth(drawerWidth.value)
  }
}

function persistDrawerWidth(): void {
  try {
    window.localStorage.setItem('guearth.eoq-drawer-width', String(drawerWidth.value))
  } catch {
    return
  }
}

function handleViewportResize(): void {
  viewportWidth.value = window.innerWidth
  drawerWidth.value = clampDrawerWidth(drawerWidth.value)
}

function stopDrawerResize(): void {
  if (!isResizingDrawer.value) return
  isResizingDrawer.value = false
  window.removeEventListener('pointermove', handleDrawerResize)
  window.removeEventListener('pointerup', stopDrawerResize)
  window.removeEventListener('pointercancel', stopDrawerResize)
  document.body.style.userSelect = ''
  persistDrawerWidth()
}

function handleDrawerResize(event: PointerEvent): void {
  if (!isResizingDrawer.value) return
  drawerWidth.value = clampDrawerWidth(window.innerWidth - event.clientX)
}

function startDrawerResize(event: PointerEvent): void {
  if (event.button !== 0) return
  isResizingDrawer.value = true
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handleDrawerResize)
  window.addEventListener('pointerup', stopDrawerResize)
  window.addEventListener('pointercancel', stopDrawerResize)
  event.preventDefault()
}

function handleResizeKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
  const step = event.shiftKey ? 80 : 20
  if (event.key === 'ArrowLeft') drawerWidth.value = clampDrawerWidth(drawerWidth.value + step)
  if (event.key === 'ArrowRight') drawerWidth.value = clampDrawerWidth(drawerWidth.value - step)
  if (event.key === 'Home') drawerWidth.value = drawerMinWidth.value
  if (event.key === 'End') drawerWidth.value = drawerMaxWidth.value
  persistDrawerWidth()
  event.preventDefault()
}

function modelKey(provider: AiProviderConfig, model: AiModelConfig): string {
  return `${provider.id}:${model.id}`
}

async function handleModelSelect(info: { key: string | number }): Promise<void> {
  const choice = String(info.key)
  const separatorIndex = choice.indexOf(':')
  if (separatorIndex < 0) return
  modelMenuOpen.value = false
  await store.setActiveModel(choice.slice(0, separatorIndex), choice.slice(separatorIndex + 1))
}

function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return time
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${time}`
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

function handleHistoryMenuClick(info: { key: string | number }): void {
  historyOpen.value = false
  store.openConversation(String(info.key))
}

function handleDeleteConversation(event: Event, conversation: StoredAiConversationSummary): void {
  event.stopPropagation()
  historyOpen.value = false
  if (store.settings.skipDeleteConversationConfirm) {
    void store.deleteConversation(conversation.id)
    return
  }
  deleteTarget.value = conversation
  deleteNoAsk.value = false
  deleteConfirmOpen.value = true
}

function confirmDeleteConversation(): void {
  const target = deleteTarget.value
  deleteConfirmOpen.value = false
  deleteTarget.value = null
  if (!target) return
  if (deleteNoAsk.value) store.setSkipDeleteConversationConfirm(true)
  void store.deleteConversation(target.id)
}

const suggestions = [
  { label: '找典型流水侵蚀地貌', description: '讲解成因并带我去看', prompt: '找典型流水侵蚀地貌并讲解成因' },
  { label: '珠穆朗玛峰在哪', description: '定位地名并飞行', prompt: '帮我找珠穆朗玛峰在哪' },
  { label: '黄土高原海拔多高', description: '查询地形高程', prompt: '黄土高原的平均海拔是多少？' },
  { label: '带我去马里亚纳海沟', description: '看看地球最深处', prompt: '带我去马里亚纳海沟看看' },
  { label: '帮我标记秦岭位置', description: '在地球上添加标记', prompt: '帮我标记秦岭的位置' },
  { label: '珠峰和乔戈里峰谁高', description: '对比两座高峰高程', prompt: '珠穆朗玛峰和乔戈里峰哪个更高？' },
  { label: '七彩丹霞怎么形成的', description: '地貌成因解读', prompt: '张掖七彩丹霞是怎么形成的？' },
  { label: '截取当前视角画面', description: '保存地球截图', prompt: '帮我截取当前视角的画面' }
]

const ROTATE_INTERVAL_MS = 4000

const suggestionIndex = ref(0)
const rotatePaused = ref(false)
let rotateTimer: number | undefined
const currentSuggestion = computed(() => suggestions[suggestionIndex.value])

function startRotate(): void {
  stopRotate()
  if (!isPanelOpen.value || messages.value.length || document.hidden) return
  rotateTimer = window.setInterval(() => {
    if (rotatePaused.value) return
    suggestionIndex.value = (suggestionIndex.value + 1) % suggestions.length
  }, ROTATE_INTERVAL_MS)
}

watch([isPanelOpen, () => messages.value.length], startRotate, { immediate: true })

function stopRotate(): void {
  if (rotateTimer === undefined) return
  window.clearInterval(rotateTimer)
  rotateTimer = undefined
}

function stepSuggestion(delta: number): void {
  suggestionIndex.value = (suggestionIndex.value + delta + suggestions.length) % suggestions.length
  startRotate()
}

function submitCurrentSuggestion(): void {
  submit(currentSuggestion.value.prompt)
}

onMounted(() => {
  readDrawerWidth()
  window.addEventListener('resize', handleViewportResize)
  document.addEventListener('visibilitychange', startRotate)
})
onUnmounted(() => {
  stopRotate()
  stopDrawerResize()
  if (scrollFrame !== undefined) {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = undefined
  }
  window.removeEventListener('resize', handleViewportResize)
  document.removeEventListener('visibilitychange', startRotate)
})

function reasoningDurationText(part: ReasoningPart): string {
  const seconds = part.ms / 1000
  return seconds < 1 ? '已思考 <1s' : `已思考 ${Math.round(seconds)}s`
}

const reasonTouched = reactive(new Set<string>())
const reasonOpen = reactive(new Set<string>())
const openTools = reactive(new Set<string>())

function isReasoningLive(message: ChatMessage, part: ReasoningPart): boolean {
  return message.status === 'streaming' && message.parts[message.parts.length - 1] === part
}

function reasoningActive(message: ChatMessage, part: ReasoningPart): string[] {
  if (reasonTouched.has(part.id)) return reasonOpen.has(part.id) ? ['reasoning'] : []
  return isReasoningLive(message, part) ? ['reasoning'] : []
}

function toggleReasoning(part: ReasoningPart, keys: string | string[]): void {
  reasonTouched.add(part.id)
  if ((Array.isArray(keys) ? keys : [keys]).includes('reasoning')) reasonOpen.add(part.id)
  else reasonOpen.delete(part.id)
}

function onToolChange(step: ToolStep, keys: string | string[]): void {
  const open = Array.isArray(keys) ? keys : keys ? [keys] : []
  if (open.includes(step.callId)) openTools.add(step.callId)
  else openTools.delete(step.callId)
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

function submit(value: string | undefined): void {
  const text = (typeof value === 'string' && value.trim() ? value : draft.value).trim()
  if (!text || isStreaming.value) return
  draft.value = ''
  void store.send(text)
}

function handleCancel(): void {
  void store.stop()
}

const editingId = ref('')
const editingDraft = ref('')

function discardsFollowing(messageId: string): boolean {
  const index = messages.value.findIndex((message) => message.id === messageId)
  return index >= 0 && index < messages.value.length - 1
}

async function startEdit(message: ChatMessage): Promise<void> {
  editingId.value = message.id
  editingDraft.value = message.content
  await nextTick()
  document.querySelector<HTMLTextAreaElement>('.eoq-drawer .edit-box textarea')?.focus()
}

function cancelEdit(): void {
  editingId.value = ''
  editingDraft.value = ''
}

function confirmEdit(message: ChatMessage): void {
  const text = editingDraft.value.trim()
  if (!text) return
  if (!discardsFollowing(message.id)) {
    cancelEdit()
    void store.resendFrom(message.id, text)
    return
  }
  Modal.confirm({
    title: '重新发送编辑后的提问？',
    content: '此提问之后的对话内容将被丢弃。',
    okText: '发送',
    cancelText: '取消',
    onOk: () => {
      cancelEdit()
      void store.resendFrom(message.id, text)
    }
  })
}

function handleEditKeydown(event: KeyboardEvent, message: ChatMessage): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    confirmEdit(message)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

function handleRegenerate(message: ChatMessage): void {
  if (!discardsFollowing(message.id)) {
    void store.regenerate(message.id)
    return
  }
  Modal.confirm({
    title: '重新生成此回复？',
    content: '此回复之后的对话内容将被丢弃。',
    okText: '重新生成',
    cancelText: '取消',
    onOk: () => void store.regenerate(message.id)
  })
}

function scheduleAssistantScroll(): void {
  if (scrollQueued) return
  scrollQueued = true
  void nextTick(() => {
    scrollQueued = false
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
      if (!listRef.value) return
      const element = listRef.value.querySelector<HTMLElement>('.assistant-block:last-child .reasoning-text')
      if (element) element.scrollTop = element.scrollHeight
    })
  })
}

watch(
  () => {
    const message = messages.value[messages.value.length - 1]
    if (!message) return ''
    const part = message.parts[message.parts.length - 1]
    const partKey = !part
      ? ''
      : part.kind === 'reasoning'
        ? `r${part.text.length}`
        : part.kind === 'text'
          ? `t${part.text.length}`
          : `o${part.step.status}:${part.step.result.length}`
    return `${message.id}:${message.status}:${message.content.length}:${partKey}`
  },
  scheduleAssistantScroll
)

watch(
  () => messages.value.length,
  (length) => {
    if (length === 0) {
      reasonTouched.clear()
      reasonOpen.clear()
      openTools.clear()
    }
  }
)

watch(currentConversationId, () => {
  reasonTouched.clear()
  reasonOpen.clear()
  openTools.clear()
})
</script>

<template>
  <a-drawer
    :open="isPanelOpen"
    placement="right"
    :width="drawerWidth"
    :mask="false"
    :closable="false"
    class="eoq-drawer"
    :body-style="{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', position: 'relative' }"
    @close="store.setPanelOpen(false)"
  >
    <template #title>
      <div class="panel-title">
        <h2>EOQ 智能助手</h2>
        <div class="title-actions">
          <a-tooltip v-if="messages.length > 0" title="新建会话">
            <a-button type="text" aria-label="新建会话" :disabled="isStreaming" @click="store.newConversation()"><PlusOutlined /></a-button>
          </a-tooltip>
          <a-dropdown v-model:open="historyOpen" :trigger="['click']" placement="bottomRight" :overlay-style="{ width: '300px' }">
            <a-button type="text" aria-label="历史会话" aria-haspopup="menu" :aria-expanded="historyOpen"><HistoryOutlined /></a-button>
            <template #overlay>
              <a-menu class="history-menu" @click="handleHistoryMenuClick">
                <a-menu-item v-if="conversations.length === 0" key="history-empty" disabled class="history-empty">暂无历史会话</a-menu-item>
                <a-menu-item v-for="conversation in conversations" :key="conversation.id" class="history-item" :class="{ 'history-item-active': conversation.id === currentConversationId }">
                  <div class="history-item-body">
                    <span class="history-item-title" :title="conversation.title">{{ conversation.title }}</span>
                    <span class="history-item-time">{{ formatConversationTime(conversation.updatedAt) }}</span>
                    <a-tooltip title="删除会话">
                      <a-button type="text" size="small" danger class="history-delete" :aria-label="`删除会话 ${conversation.title}`" @click="handleDeleteConversation($event, conversation)"><DeleteOutlined /></a-button>
                    </a-tooltip>
                  </div>
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-tooltip title="AI 设置">
            <a-button type="text" aria-label="AI 设置" @click="store.setSettingsOpen(true)"><SettingOutlined /></a-button>
          </a-tooltip>
          <a-button type="text" aria-label="关闭助手" @click="store.setPanelOpen(false)"><CloseOutlined /></a-button>
        </div>
      </div>
    </template>

    <div
      class="drawer-resize-handle"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="调整助手宽度"
      :aria-valuemin="drawerMinWidth"
      :aria-valuemax="drawerMaxWidth"
      :aria-valuenow="drawerWidth"
      @pointerdown="startDrawerResize"
      @keydown="handleResizeKeydown"
    />

    <div v-if="messages.length === 0" class="empty-state">
      <CompassOutlined class="empty-icon" />
      <p class="empty-text">我是地理教学助手，我可以帮你找地方、看地貌、讲成因。</p>
      <div class="suggestion-carousel" @mouseenter="rotatePaused = true" @mouseleave="rotatePaused = false">
        <a-button type="text" shape="circle" size="small" class="suggestion-arrow" aria-label="上一个建议" @click="stepSuggestion(-1)"><LeftOutlined /></a-button>
        <Transition name="suggestion-fade" mode="out-in">
          <button :key="suggestionIndex" type="button" class="suggestion-card" @click="submitCurrentSuggestion">
            <span class="suggestion-label">{{ currentSuggestion.label }}</span>
            <span class="suggestion-desc">{{ currentSuggestion.description }}</span>
          </button>
        </Transition>
        <a-button type="text" shape="circle" size="small" class="suggestion-arrow" aria-label="下一个建议" @click="stepSuggestion(1)"><RightOutlined /></a-button>
      </div>
    </div>

    <div v-else ref="listRef" class="chat-list">
      <template v-for="message in messages" :key="message.id">
        <div v-if="message.role === 'user'" class="user-row">
          <div v-if="editingId === message.id" class="edit-box">
            <a-textarea
              v-model:value="editingDraft"
              :auto-size="{ minRows: 2, maxRows: 8 }"
              aria-label="编辑提问"
              @keydown="handleEditKeydown($event, message)"
            />
            <div class="edit-actions">
              <a-button size="small" @click="cancelEdit">取消</a-button>
              <a-button type="primary" size="small" :disabled="!editingDraft.trim()" @click="confirmEdit(message)">发送</a-button>
            </div>
          </div>
          <template v-else>
            <Bubble placement="end" :content="message.content" />
            <div v-if="!isStreaming" class="message-actions">
              <a-button type="text" size="small" class="action-btn" aria-label="编辑提问" @click="startEdit(message)"><EditOutlined />编辑</a-button>
            </div>
          </template>
        </div>
        <div v-else class="assistant-block">
          <template v-for="(part, index) in message.parts" :key="`${message.id}-${index}`">
            <a-collapse
              v-if="part.kind === 'reasoning'"
              ghost
              class="reasoning-collapse"
              :active-key="reasoningActive(message, part)"
              @change="toggleReasoning(part, $event)"
            >
              <a-collapse-panel key="reasoning">
                <template #header>
                  <span v-if="isReasoningLive(message, part)" class="shimmer-text">正在深度思考</span>
                  <span v-else class="collapsed-title">{{ reasoningDurationText(part) }}</span>
                </template>
                <div class="reasoning-text">{{ part.text }}</div>
              </a-collapse-panel>
            </a-collapse>
            <StreamingMarkdown v-else-if="part.kind === 'text'" :text="part.text" :streaming="message.status === 'streaming'" @rendered="scheduleAssistantScroll" />
            <WebSearchStep
              v-else-if="part.step.name === 'web_search'"
              :step="part.step"
              :busy="isStreaming"
              :open="openTools.has(part.step.callId)"
              @toggle="onToolChange(part.step, $event)"
              @retry="submit(`请重新联网搜索：${$event}`)"
            />
            <a-collapse
              v-else
              ghost
              class="tool-collapse"
              :active-key="openTools.has(part.step.callId) ? [part.step.callId] : []"
              @change="onToolChange(part.step, $event)"
            >
              <a-collapse-panel :key="part.step.callId">
                <template #header>
                  <span v-if="part.step.status === 'running'" class="shimmer-text">{{ toolLabel(part.step.name, true) }}</span>
                  <span v-else-if="part.step.status === 'ok'" class="tool-header">
                    <span class="tool-name">{{ toolLabel(part.step.name) }}</span>
                    <span v-if="part.step.summary" class="tool-summary" :title="part.step.summary">{{ part.step.summary }}</span>
                  </span>
                  <span v-else class="tool-header">
                    <CloseCircleOutlined class="tool-icon-error" />
                    <span class="tool-name">{{ toolLabel(part.step.name) }}</span>
                    <span v-if="part.step.summary" class="tool-summary tool-summary-error" :title="part.step.summary">{{ part.step.summary }}</span>
                  </span>
                </template>
                <div class="tool-io">
                  <div class="tool-io-label">输入</div>
                  <pre class="tool-io-body">{{ prettyInput(part.step) }}</pre>
                  <div class="tool-io-label">输出</div>
                  <pre class="tool-io-body">{{ prettyOutput(part.step) }}</pre>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </template>
          <span v-if="message.status === 'streaming' && message.parts.length === 0" class="shimmer-text pending-line">思考中…</span>
          <a-alert v-if="message.status === 'streaming' && modelRetryNotice" type="warning" show-icon :message="modelRetryNotice" class="retry-notice" />
          <a-alert v-if="message.status === 'error'" type="error" show-icon :message="message.error" class="answer-error">
            <template #action>
              <a-button type="text" size="small" :disabled="isStreaming" @click="void store.retryLast()"><ReloadOutlined />重试</a-button>
            </template>
          </a-alert>
          <div v-if="!isStreaming && message.status === 'done'" class="message-actions">
            <a-button type="text" size="small" class="action-btn" aria-label="重新生成" @click="handleRegenerate(message)"><ReloadOutlined />重新生成</a-button>
          </div>
        </div>
      </template>
    </div>

    <div class="composer-tools">
      <ContextMeter
        :stats="contextStats"
        :status="contextCompressionStatus"
        :notice="contextCompressionNotice"
        :disabled="isStreaming"
        @compress="void store.compressContext()"
      />
      <a-dropdown v-model:open="modelMenuOpen" :trigger="['click']" placement="topRight">
        <a-button class="model-picker" type="text" :disabled="isStreaming" aria-label="选择模型" aria-haspopup="menu" :aria-expanded="modelMenuOpen">
          <span class="model-picker-label">{{ activeModelLabel }}</span>
          <UpOutlined />
        </a-button>
        <template #overlay>
          <a-menu class="model-menu" selectable :selected-keys="[`${settings.activeProviderId}:${settings.activeModelId}`]" @click="handleModelSelect">
            <a-menu-item-group v-for="provider in modelProviders" :key="provider.id" :title="provider.name">
              <a-menu-item v-for="model in provider.models" :key="modelKey(provider, model)">
                <span class="model-menu-item"><span class="model-menu-name">{{ model.label || model.id }}</span><span v-if="model.label && model.label !== model.id" class="model-menu-id">{{ model.id }}</span></span>
              </a-menu-item>
            </a-menu-item-group>
            <a-menu-item v-if="modelProviders.length === 0" key="model-empty" disabled>请先在 AI 设置中添加模型</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <Suggestion
      :open="commandMenuOpen"
      :items="commandItems"
      :block="true"
      root-class-name="eoq-command-suggestion"
      @open-change="commandMenuOpen = $event"
      @select="(value) => selectCommand(agentCommands.find((command) => command.name === value) ?? agentCommands[0])"
    >
      <template #default="suggestion">
        <Sender
          v-model:value="draft"
          :loading="isStreaming"
          placeholder="问一问地球，例如：帮我找典型的流水侵蚀地貌"
          :submit-type="false"
          @submit="runCommandOrSubmit"
          @change="handleDraftChange($event, suggestion?.onTrigger)"
          @keydown="handleSuggestionKeyDown($event, suggestion?.onTrigger)"
          @cancel="handleCancel"
        />
      </template>
    </Suggestion>
    <p class="ai-disclaimer" title="内容由 AI 生成，咕咕地球不为其生成的内容负责，请谨慎甄别">内容由 AI 生成，咕咕地球不为其生成的内容负责，请谨慎甄别</p>
  </a-drawer>

  <a-modal
    v-model:open="deleteConfirmOpen"
    title="删除会话"
    :width="400"
    ok-text="删除"
    :ok-button-props="{ danger: true }"
    cancel-text="取消"
    @ok="confirmDeleteConversation"
  >
    <p class="delete-confirm-text">删除后「{{ deleteTarget?.title }}」将无法恢复。</p>
    <a-checkbox v-model:checked="deleteNoAsk">不再提示</a-checkbox>
  </a-modal>
</template>

<style scoped>
.panel-title{display:flex;align-items:center;justify-content:space-between;width:100%}
.drawer-resize-handle{position:absolute;top:0;bottom:0;left:0;z-index:10;width:10px;cursor:ew-resize;touch-action:none}
.drawer-resize-handle::after{position:absolute;top:50%;left:4px;width:2px;height:48px;border-radius:2px;background:rgba(5,5,5,.12);content:'';transform:translateY(-50%);transition:background .2s ease,height .2s ease}
.drawer-resize-handle:hover::after,.drawer-resize-handle:focus-visible::after{height:64px;background:#1677ff}
.drawer-resize-handle:focus-visible{outline:2px solid #1677ff;outline-offset:-2px}
h2{margin:0;color:rgba(0,0,0,.88);font-size:20px;font-weight:600;line-height:28px}
.title-actions{display:flex;align-items:center;gap:4px}
.history-menu{max-height:320px;overflow-y:auto}
.history-item :deep(.ant-dropdown-menu-title-content){display:flex;align-items:center;width:100%}
.history-item-active{background:rgba(0,0,0,.04)}
.history-item-body{flex:1;min-width:0;display:flex;align-items:center;gap:4px}
.history-item-title{flex:1;min-width:0;color:rgba(0,0,0,.88);font-size:14px;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.history-item-time{flex-shrink:0;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.history-delete{flex-shrink:0;height:24px}
.history-empty{color:rgba(0,0,0,.45)}
.delete-confirm-text{margin:0 0 12px;color:rgba(0,0,0,.65);font-size:14px;line-height:22px}
.empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 8px}
.empty-icon{font-size:38px;color:rgba(0,0,0,.25)}
.empty-text{margin:0;color:rgba(0,0,0,.65);font-size:14px;line-height:22px;text-align:center}
.suggestion-carousel{display:flex;align-items:center;gap:2px;width:100%;max-width:340px}
.suggestion-arrow{flex-shrink:0;color:rgba(0,0,0,.45)}
.suggestion-card{flex:1;min-width:0;display:flex;align-items:baseline;justify-content:center;gap:8px;padding:9px 12px;background:#fff;border:1px solid rgba(5,5,5,.12);border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;overflow:hidden;transition:border-color .2s ease,box-shadow .2s ease}
.suggestion-card:hover{border-color:#1677ff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.suggestion-label{flex-shrink:0;color:rgba(0,0,0,.88);font-size:14px;font-weight:600;line-height:22px}
.suggestion-desc{min-width:0;overflow:hidden;text-overflow:ellipsis;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.suggestion-fade-enter-active,.suggestion-fade-leave-active{transition:opacity .2s ease}
.suggestion-fade-enter-from,.suggestion-fade-leave-to{opacity:0}
.empty-hint{margin:0 0 8px;color:rgba(0,0,0,.45);font-size:12px;line-height:20px;text-align:center}
.chat-list{flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto;padding-right:4px}
.assistant-block{display:flex;flex-direction:column;gap:8px;min-width:0}
.user-row{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}
.edit-box{display:flex;flex-direction:column;gap:8px;width:100%}
.edit-actions{display:flex;justify-content:flex-end;gap:8px}
.message-actions{display:flex;opacity:0;transition:opacity .2s ease}
.user-row:hover .message-actions,.user-row:focus-within .message-actions,.assistant-block:hover .message-actions,.assistant-block:focus-within .message-actions{opacity:1}
.action-btn{color:rgba(0,0,0,.45);font-size:12px;padding-inline:4px}
.action-btn:hover{color:#1677ff}
.reasoning-collapse,.tool-collapse{margin:-4px 0}
.reasoning-collapse :deep(.ant-collapse-header),.tool-collapse :deep(.ant-collapse-header){padding:4px 0;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.reasoning-collapse :deep(.ant-collapse-content-box),.tool-collapse :deep(.ant-collapse-content-box){padding:4px 0 8px}
.tool-collapse :deep(.ant-collapse-header-text){flex:1;min-width:0;overflow:hidden}
.collapsed-title{color:rgba(0,0,0,.45)}
.reasoning-text{color:rgba(0,0,0,.45);font-size:12px;line-height:20px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto}
.tool-header{display:flex;align-items:center;gap:6px;min-width:0}
.tool-name{flex-shrink:0;white-space:nowrap}
.tool-icon-error{flex-shrink:0;color:#ff4d4f}
.tool-summary{min-width:0;color:rgba(0,0,0,.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tool-summary-error{color:#ff4d4f}
.tool-io{display:flex;flex-direction:column;gap:2px}
.tool-io-label{color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.tool-io-body{margin:0 0 8px;padding:8px;background:#f5f5f5;border-radius:4px;color:rgba(0,0,0,.65);font-family:ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto}
.tool-io-body:last-child{margin-bottom:0}
.answer-text{color:rgba(0,0,0,.88);font-size:14px;line-height:22px;word-break:break-word;min-width:0}
.answer-text :deep(p){margin:0 0 8px}
.answer-text :deep(p:last-child){margin-bottom:0}
.answer-text :deep(h1),.answer-text :deep(h2),.answer-text :deep(h3),.answer-text :deep(h4),.answer-text :deep(h5),.answer-text :deep(h6){margin:16px 0 8px;color:rgba(0,0,0,.88);font-weight:600;line-height:24px}
.answer-text :deep(h1){font-size:16px}
.answer-text :deep(h2),.answer-text :deep(h3),.answer-text :deep(h4),.answer-text :deep(h5),.answer-text :deep(h6){font-size:14px}
.answer-text :deep(ul),.answer-text :deep(ol){margin:0 0 8px;padding-left:20px}
.answer-text :deep(li){margin:2px 0}
.answer-text :deep(li>ul),.answer-text :deep(li>ol){margin-bottom:0}
.answer-text :deep(blockquote){margin:0 0 8px;padding:4px 12px;border-left:3px solid rgba(5,5,5,.06);color:rgba(0,0,0,.65)}
.answer-text :deep(blockquote p:last-child){margin-bottom:0}
.answer-text :deep(code){padding:2px 4px;background:rgba(0,0,0,.06);border-radius:4px;font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;line-height:20px}
.answer-text :deep(pre){margin:0 0 8px;padding:12px;background:#f5f5f5;border-radius:6px;overflow-x:auto}
.answer-text :deep(pre code){padding:0;background:none;border-radius:0}
.answer-text :deep(table){display:block;width:max-content;max-width:100%;margin:0 0 8px;overflow-x:auto;border-collapse:collapse}
.answer-text :deep(th),.answer-text :deep(td){padding:4px 8px;border:1px solid rgba(5,5,5,.06)}
.answer-text :deep(th){font-weight:600}
.answer-text :deep(a){color:#1677ff}
.answer-text :deep(hr){margin:12px 0;border:0;border-top:1px solid rgba(5,5,5,.06)}
.answer-text :deep(img){max-width:100%;border-radius:6px}
.pending-line{margin:2px 0}
.ai-disclaimer{margin:-6px 4px 0;color:rgba(0,0,0,.45);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.composer-tools{display:flex;align-items:center;gap:8px;min-width:0}
.composer-tools :deep(.context-meter){flex:1;width:auto}
.model-picker{display:flex;align-items:center;gap:4px;flex:0 1 auto;min-width:0;max-width:48%;padding-inline:4px;color:rgba(0,0,0,.65)}
.model-picker:hover{color:#1677ff}
.model-picker-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.model-menu{min-width:248px;max-width:min(360px,calc(100vw - 48px));max-height:360px;overflow-y:auto}
.model-menu-item{display:flex;align-items:baseline;gap:8px;min-width:0}
.model-menu-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.model-menu-id{min-width:0;overflow:hidden;color:rgba(0,0,0,.45);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.answer-error{margin-top:4px}
.retry-notice{margin-top:4px}
.shimmer-text{
  display:inline-block;
  font-size:12px;
  line-height:20px;
  background:linear-gradient(90deg,rgba(0,0,0,.25) 25%,rgba(0,0,0,.65) 47%,rgba(255,255,255,.95) 50%,rgba(0,0,0,.65) 53%,rgba(0,0,0,.25) 75%);
  background-size:200% 100%;
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
  animation:eoq-shimmer 3s linear infinite;
}
@keyframes eoq-shimmer{
  0%{background-position:200% 0}
  100%{background-position:-200% 0}
}
@media (prefers-reduced-motion:reduce){
  .shimmer-text{animation:none;background:none;-webkit-background-clip:border-box;background-clip:border-box;color:rgba(0,0,0,.45)}
  .suggestion-fade-enter-active,.suggestion-fade-leave-active{transition:none}
  .message-actions{transition:none}
}
</style>

<style>
.eoq-command-suggestion .ant-cascader-menu-item{padding:0}
.eoq-command-suggestion .ant-cascader-menu-item-content{min-width:0}
.ant-cascader-dropdown.eoq-command-suggestion .ant-cascader-menu .ant-cascader-menu-item-active,
.ant-cascader-dropdown.eoq-command-suggestion .ant-cascader-menu .ant-cascader-menu-item-active:hover{background-color:transparent;font-weight:400}
.eoq-command-option{display:flex;align-items:center;gap:8px;width:100%;padding:5px 12px;font-size:13px;line-height:22px}
.eoq-command-option:hover{background-color:rgba(0,0,0,.04)}
.eoq-command-option-icon{display:flex;flex-shrink:0;color:rgba(0,0,0,.45);font-size:14px}
.eoq-command-option-name{flex-shrink:0;width:80px;color:rgba(0,0,0,.88)}
.eoq-command-option-label{flex:1;min-width:0;color:rgba(0,0,0,.45);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eoq-command-option-active,.eoq-command-option-active:hover{background-color:#e6f4ff}
.eoq-command-option-active .eoq-command-option-name{color:#1677ff;font-weight:600}
</style>
