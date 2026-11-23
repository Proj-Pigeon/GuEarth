import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import {
  ArrowUpOutlined,
  BorderOutlined,
  CloseOutlined,
  CompassOutlined,
  CompressOutlined,
  DeleteOutlined,
  HistoryOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  UpOutlined
} from '@ant-design/icons'
import { Button, Checkbox, Drawer, Dropdown, Input, Modal, Tooltip, type MenuProps } from 'antd'
import { useAiStore } from '@renderer/stores/ai'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import type { AiModelConfig, AiProviderConfig, StoredAiConversationSummary } from '../../../preload'
import ContextMeter from './ContextMeter'
import EoqMessages from './eoq/EoqMessages'
import EoqRuntimeProvider from './eoq/EoqRuntimeProvider'
import styles from './EoqAssistant.module.css'

interface AgentCommand {
  name: string
  label: string
  icon: typeof CompressOutlined
  run: () => void | Promise<void>
}

const SUGGESTIONS = [
  { label: '找典型流水侵蚀地貌', description: '讲解成因并带我去看', prompt: '找典型流水侵蚀地貌并讲解成因' },
  { label: '珠穆朗玛峰在哪', description: '定位地名并飞行', prompt: '帮我找珠穆朗玛峰在哪' },
  { label: '黄土高原海拔多高', description: '查询地形高程', prompt: '黄土高原的平均海拔是多少？' },
  { label: '带我去马里亚纳海沟', description: '看看地球最深处', prompt: '带我去马里亚纳海沟看看' },
  { label: '帮我标记秦岭位置', description: '在地球上添加标记', prompt: '帮我标记秦岭的位置' },
  { label: '珠峰和乔戈里峰谁高', description: '对比两座高峰高程', prompt: '珠穆朗玛峰和乔戈里峰哪个更高？' },
  { label: '七彩丹霞怎么形成的', description: '地貌成因解读', prompt: '张掖七彩丹霞是怎么形成的？' },
  { label: '截取当前视角画面', description: '保存地球截图', prompt: '帮我截取当前视角的画面' }
] as const

const ROTATE_INTERVAL_MS = 4000

function modelKey(provider: AiProviderConfig, model: AiModelConfig): string {
  return `${provider.id}:${model.id}`
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

export function EoqAssistant() {
  const messages = useAiStore((state) => state.messages)
  const conversations = useAiStore((state) => state.conversations)
  const currentConversationId = useAiStore((state) => state.currentConversationId)
  const isStreaming = useAiStore((state) => state.isStreaming)
  const isPanelOpen = useAiStore((state) => state.isPanelOpen)
  const settings = useAiStore((state) => state.settings)
  const contextStats = useAiStore((state) => state.contextStats)
  const contextCompressionStatus = useAiStore((state) => state.contextCompressionStatus)
  const contextCompressionNotice = useAiStore((state) => state.contextCompressionNotice)
  const setPanelOpen = useAiStore((state) => state.setPanelOpen)
  const newConversation = useAiStore((state) => state.newConversation)
  const openConversation = useAiStore((state) => state.openConversation)
  const deleteConversation = useAiStore((state) => state.deleteConversation)
  const setSkipDeleteConversationConfirm = useAiStore((state) => state.setSkipDeleteConversationConfirm)
  const setActiveModel = useAiStore((state) => state.setActiveModel)
  const compressContext = useAiStore((state) => state.compressContext)
  const send = useAiStore((state) => state.send)
  const stop = useAiStore((state) => state.stop)

  const openSettings = useSettingsWindowStore((state) => state.open)

  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StoredAiConversationSummary | null>(null)
  const [deleteNoAsk, setDeleteNoAsk] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  )
  const [drawerWidth, setDrawerWidth] = useState(() =>
    Math.min(420, Math.floor((typeof window === 'undefined' ? 1280 : window.innerWidth) / 3))
  )
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [rotatePaused, setRotatePaused] = useState(false)

  const resizingRef = useRef(false)
  const drawerWidthRef = useRef(drawerWidth)
  drawerWidthRef.current = drawerWidth
  const rotatePausedRef = useRef(rotatePaused)
  rotatePausedRef.current = rotatePaused

  const drawerMaxWidth = Math.max(0, Math.floor(viewportWidth / 3))
  const drawerMinWidth = Math.min(320, drawerMaxWidth)

  const clampDrawerWidth = useCallback(
    (width: number, maxWidth = drawerMaxWidth): number => {
      const minWidth = Math.min(320, maxWidth)
      return Math.min(maxWidth, Math.max(minWidth, Math.round(width)))
    },
    [drawerMaxWidth]
  )

  const persistDrawerWidth = useCallback((width: number) => {
    try {
      window.localStorage.setItem('guearth.eoq-drawer-width', String(width))
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem('guearth.eoq-drawer-width'))
      if (Number.isFinite(stored) && stored > 0) {
        const maxWidth = Math.max(0, Math.floor(window.innerWidth / 3))
        setDrawerWidth(clampDrawerWidth(stored, maxWidth))
      }
    } catch {
      return
    }
  }, [clampDrawerWidth])

  useEffect(() => {
    const handleViewportResize = (): void => {
      const nextViewport = window.innerWidth
      setViewportWidth(nextViewport)
      const maxWidth = Math.max(0, Math.floor(nextViewport / 3))
      setDrawerWidth((current) => clampDrawerWidth(current, maxWidth))
    }
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [clampDrawerWidth])

  const stopDrawerResize = useCallback(() => {
    if (!resizingRef.current) return
    resizingRef.current = false
    document.body.style.userSelect = ''
    persistDrawerWidth(drawerWidthRef.current)
  }, [persistDrawerWidth])

  useEffect(() => {
    const handleDrawerResize = (event: PointerEvent): void => {
      if (!resizingRef.current) return
      const maxWidth = Math.max(0, Math.floor(window.innerWidth / 3))
      setDrawerWidth(clampDrawerWidth(window.innerWidth - event.clientX, maxWidth))
    }
    window.addEventListener('pointermove', handleDrawerResize)
    window.addEventListener('pointerup', stopDrawerResize)
    window.addEventListener('pointercancel', stopDrawerResize)
    return () => {
      stopDrawerResize()
      window.removeEventListener('pointermove', handleDrawerResize)
      window.removeEventListener('pointerup', stopDrawerResize)
      window.removeEventListener('pointercancel', stopDrawerResize)
    }
  }, [clampDrawerWidth, stopDrawerResize])

  const startDrawerResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    resizingRef.current = true
    document.body.style.userSelect = 'none'
    event.preventDefault()
  }, [])

  const handleResizeKeydown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return
      }
      const step = event.shiftKey ? 80 : 20
      let nextWidth = drawerWidthRef.current
      if (event.key === 'ArrowLeft') nextWidth = clampDrawerWidth(drawerWidthRef.current + step)
      if (event.key === 'ArrowRight') nextWidth = clampDrawerWidth(drawerWidthRef.current - step)
      if (event.key === 'Home') nextWidth = drawerMinWidth
      if (event.key === 'End') nextWidth = drawerMaxWidth
      setDrawerWidth(nextWidth)
      persistDrawerWidth(nextWidth)
      event.preventDefault()
    },
    [clampDrawerWidth, drawerMaxWidth, drawerMinWidth, persistDrawerWidth]
  )

  const modelProviders = useMemo(
    () =>
      settings.providers
        .map((provider) => ({ ...provider, models: provider.models.filter((model) => model.enabled) }))
        .filter((provider) => provider.models.length > 0),
    [settings.providers]
  )

  const activeProvider = useMemo(
    () => settings.providers.find((provider) => provider.id === settings.activeProviderId),
    [settings.activeProviderId, settings.providers]
  )

  const activeModel = useMemo(
    () => activeProvider?.models.find((model) => model.id === settings.activeModelId && model.enabled),
    [activeProvider, settings.activeModelId]
  )

  const activeModelLabel = activeModel?.label || activeModel?.id || '选择模型'

  const agentCommands = useMemo<AgentCommand[]>(
    () => [
      { name: '/new', label: '新建会话', icon: PlusOutlined, run: () => newConversation() },
      { name: '/resume', label: '历史会话', icon: HistoryOutlined, run: () => setHistoryOpen(true) },
      { name: '/compact', label: '精简对话', icon: CompressOutlined, run: () => compressContext() },
      { name: '/settings', label: '设置', icon: SettingOutlined, run: () => openSettings('ai') }
    ],
    [compressContext, newConversation, openSettings]
  )

  const commandQuery = useMemo(() => {
    const value = draft.trimStart()
    if (!value.startsWith('/')) return ''
    return value.slice(1).split(/\s/)[0].toLowerCase()
  }, [draft])

  const filteredCommands = useMemo(
    () => agentCommands.filter((command) => !commandQuery || command.name.slice(1).startsWith(commandQuery)),
    [agentCommands, commandQuery]
  )

  const activeCommand = filteredCommands[activeCommandIndex] ?? filteredCommands[0]

  const submit = useCallback(
    (value?: string) => {
      const text = (typeof value === 'string' ? value : draft).trim()
      if (!text || isStreaming) return
      setDraft('')
      setCommandMenuOpen(false)
      void send(text)
    },
    [draft, isStreaming, send]
  )

  const selectCommand = useCallback((command: AgentCommand) => {
    setDraft('')
    setCommandMenuOpen(false)
    setActiveCommandIndex(0)
    void command.run()
  }, [])

  const runCommandOrSubmit = useCallback(
    (value?: string) => {
      const text = (typeof value === 'string' && value.trim() ? value : draft).trim()
      const command = text.match(/^\/([^\s]+)(?:\s+.*)?$/)?.[1].toLowerCase()
      if (command) {
        const matched = agentCommands.find((item) => item.name.slice(1) === command)
        if (matched) {
          selectCommand(matched)
          return
        }
      }
      setCommandMenuOpen(false)
      submit(text)
    },
    [agentCommands, draft, selectCommand, submit]
  )

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value)
      setActiveCommandIndex(0)
      const trimmed = value.trimStart()
      const query = trimmed.startsWith('/') ? trimmed.slice(1).split(/\s/)[0].toLowerCase() : ''
      const matches = agentCommands.filter((command) => !query || command.name.slice(1).startsWith(query))
      setCommandMenuOpen(trimmed.startsWith('/') && !isStreaming && matches.length > 0)
    },
    [agentCommands, isStreaming]
  )

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (commandMenuOpen && filteredCommands.length > 0) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const offset = event.key === 'ArrowDown' ? 1 : -1
          setActiveCommandIndex((prev) => (prev + offset + filteredCommands.length) % filteredCommands.length)
          event.preventDefault()
          return
        }
        if (event.key === 'Tab' && !event.shiftKey && activeCommand) {
          handleDraftChange(activeCommand.name)
          event.preventDefault()
          return
        }
        if (event.key === 'Enter' && !event.shiftKey && activeCommand) {
          event.preventDefault()
          selectCommand(activeCommand)
          return
        }
        if (event.key === 'Escape') {
          setCommandMenuOpen(false)
          event.preventDefault()
          return
        }
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        runCommandOrSubmit(draft)
      }
    },
    [
      activeCommand,
      commandMenuOpen,
      draft,
      filteredCommands.length,
      handleDraftChange,
      runCommandOrSubmit,
      selectCommand
    ]
  )

  useEffect(() => {
    if (!isPanelOpen || messages.length > 0) return
    let timer: number | undefined
    const syncTimer = (): void => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
      if (document.hidden) return
      timer = window.setInterval(() => {
        if (rotatePausedRef.current) return
        setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length)
      }, ROTATE_INTERVAL_MS)
    }
    syncTimer()
    document.addEventListener('visibilitychange', syncTimer)
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', syncTimer)
    }
  }, [isPanelOpen, messages.length])

  const stepSuggestion = useCallback((delta: number) => {
    setSuggestionIndex((prev) => (prev + delta + SUGGESTIONS.length) % SUGGESTIONS.length)
  }, [])

  const currentSuggestion = SUGGESTIONS[suggestionIndex]

  const handleModelSelect = useCallback<NonNullable<MenuProps['onClick']>>(
    (info) => {
      const choice = String(info.key)
      const separatorIndex = choice.indexOf(':')
      if (separatorIndex < 0) return
      setModelMenuOpen(false)
      void setActiveModel(choice.slice(0, separatorIndex), choice.slice(separatorIndex + 1))
    },
    [setActiveModel]
  )

  const handleHistoryMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(
    (info) => {
      setHistoryOpen(false)
      void openConversation(String(info.key))
    },
    [openConversation]
  )

  const handleDeleteConversation = useCallback(
    (event: MouseEvent, conversation: StoredAiConversationSummary) => {
      event.stopPropagation()
      setHistoryOpen(false)
      if (settings.skipDeleteConversationConfirm) {
        void deleteConversation(conversation.id)
        return
      }
      setDeleteTarget(conversation)
      setDeleteNoAsk(false)
      setDeleteConfirmOpen(true)
    },
    [deleteConversation, settings.skipDeleteConversationConfirm]
  )

  const confirmDeleteConversation = useCallback(() => {
    const target = deleteTarget
    setDeleteConfirmOpen(false)
    setDeleteTarget(null)
    if (!target) return
    if (deleteNoAsk) setSkipDeleteConversationConfirm(true)
    void deleteConversation(target.id)
  }, [deleteConversation, deleteNoAsk, deleteTarget, setSkipDeleteConversationConfirm])

  const historyMenuItems = useMemo<MenuProps['items']>(() => {
    if (conversations.length === 0) {
      return [
        {
          key: 'history-empty',
          disabled: true,
          className: styles.historyEmpty,
          label: '暂无历史会话'
        }
      ]
    }
    return conversations.map((conversation) => ({
      key: conversation.id,
      className:
        conversation.id === currentConversationId
          ? `${styles.historyItem} ${styles.historyItemActive}`
          : styles.historyItem,
      label: (
        <div className={styles.historyItemBody}>
          <span className={styles.historyItemTitle} title={conversation.title}>
            {conversation.title}
          </span>
          <span className={styles.historyItemTime}>{formatConversationTime(conversation.updatedAt)}</span>
          <Tooltip title="删除会话">
            <Button
              type="text"
              size="small"
              danger
              className={styles.historyDelete}
              aria-label={`删除会话 ${conversation.title}`}
              icon={<DeleteOutlined />}
              onClick={(event) => handleDeleteConversation(event, conversation)}
            />
          </Tooltip>
        </div>
      )
    }))
  }, [conversations, currentConversationId, handleDeleteConversation])

  const modelMenuItems = useMemo<MenuProps['items']>(() => {
    if (modelProviders.length === 0) {
      return [
        {
          key: 'model-empty',
          disabled: true,
          label: '请先在设置中添加或启用模型'
        }
      ]
    }
    return modelProviders.map((provider) => ({
      type: 'group' as const,
      key: provider.id,
      label: provider.name,
      children: provider.models.map((model) => ({
        key: modelKey(provider, model),
        label: (
          <span className={styles.modelMenuItem}>
            <span className={styles.modelMenuName}>{model.label || model.id}</span>
            {model.label && model.label !== model.id && (
              <span className={styles.modelMenuId}>{model.id}</span>
            )}
          </span>
        )
      }))
    }))
  }, [modelProviders])

  return (
    <>
      <Drawer
        open={isPanelOpen}
        placement="right"
        size={drawerWidth}
        mask={false}
        closable={false}
        rootClassName="eoq-drawer"
        styles={{
          body: {
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '12px',
            position: 'relative'
          }
        }}
        title={
          <div className={styles.panelTitle}>
            <h2 className={styles.panelHeading}>EOQ 智能助手</h2>
            <div className={styles.titleActions}>
              {messages.length > 0 && (
                <Tooltip title="新建会话">
                  <Button
                    type="text"
                    aria-label="新建会话"
                    disabled={isStreaming}
                    icon={<PlusOutlined />}
                    onClick={() => newConversation()}
                  />
                </Tooltip>
              )}
              <Dropdown
                open={historyOpen}
                trigger={['click']}
                placement="bottomRight"
                styles={{ root: { width: '300px' } }}
                menu={{
                  className: styles.historyMenu,
                  items: historyMenuItems,
                  onClick: handleHistoryMenuClick
                }}
                onOpenChange={setHistoryOpen}
              >
                <Button
                  type="text"
                  aria-label="历史会话"
                  aria-haspopup="menu"
                  aria-expanded={historyOpen}
                  icon={<HistoryOutlined />}
                />
              </Dropdown>
              <Tooltip title="设置">
                <Button
                  type="text"
                  aria-label="设置"
                  icon={<SettingOutlined />}
                  onClick={() => openSettings('ai')}
                />
              </Tooltip>
              <Button
                type="text"
                aria-label="关闭助手"
                icon={<CloseOutlined />}
                onClick={() => setPanelOpen(false)}
              />
            </div>
          </div>
        }
        onClose={() => setPanelOpen(false)}
      >
        <div
          className={styles.drawerResizeHandle}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="调整助手宽度"
          aria-valuemin={drawerMinWidth}
          aria-valuemax={drawerMaxWidth}
          aria-valuenow={drawerWidth}
          onPointerDown={startDrawerResize}
          onKeyDown={handleResizeKeydown}
        />

        <EoqRuntimeProvider>
          <ThreadPrimitive.Root className={styles.threadRoot}>
            {messages.length === 0 ? (
              <ThreadPrimitive.Empty>
                <div className={styles.emptyState}>
                  <CompassOutlined className={styles.emptyIcon} />
                  <p className={styles.emptyText}>我是地理教学助手，我可以帮你找地方、看地貌、讲成因。</p>
                  <div
                    className={styles.suggestionCarousel}
                    onMouseEnter={() => setRotatePaused(true)}
                    onMouseLeave={() => setRotatePaused(false)}
                  >
                    <Button
                      type="text"
                      shape="circle"
                      size="small"
                      className={styles.suggestionArrow}
                      aria-label="上一个建议"
                      icon={<LeftOutlined />}
                      onClick={() => stepSuggestion(-1)}
                    />
                    <button
                      key={suggestionIndex}
                      type="button"
                      className={styles.suggestionCard}
                      onClick={() => submit(currentSuggestion.prompt)}
                    >
                      <span className={styles.suggestionLabel}>{currentSuggestion.label}</span>
                      <span className={styles.suggestionDesc}>{currentSuggestion.description}</span>
                    </button>
                    <Button
                      type="text"
                      shape="circle"
                      size="small"
                      className={styles.suggestionArrow}
                      aria-label="下一个建议"
                      icon={<RightOutlined />}
                      onClick={() => stepSuggestion(1)}
                    />
                  </div>
                </div>
              </ThreadPrimitive.Empty>
            ) : (
              <EoqMessages onSubmitPrompt={submit} />
            )}
          </ThreadPrimitive.Root>
        </EoqRuntimeProvider>

        <div className={styles.composerTools}>
          <ContextMeter
            stats={contextStats}
            status={contextCompressionStatus}
            notice={contextCompressionNotice}
            disabled={isStreaming}
            onCompress={() => void compressContext()}
          />
          <Dropdown
            open={modelMenuOpen}
            trigger={['click']}
            placement="topRight"
            menu={{
              className: styles.modelMenu,
              selectable: true,
              selectedKeys: [`${settings.activeProviderId}:${settings.activeModelId}`],
              items: modelMenuItems,
              onClick: handleModelSelect
            }}
            onOpenChange={setModelMenuOpen}
          >
            <Button
              className={styles.modelPicker}
              type="text"
              disabled={isStreaming}
              aria-label="选择模型"
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
            >
              <span className={styles.modelPickerLabel}>{activeModelLabel}</span>
              <UpOutlined />
            </Button>
          </Dropdown>
        </div>

        <div className={styles.composerWrap}>
          {commandMenuOpen && filteredCommands.length > 0 && (
            <div className={styles.commandPopover} role="listbox" aria-label="快捷指令">
              {filteredCommands.map((command, index) => {
                const IconComponent = command.icon
                return (
                  <button
                    key={command.name}
                    type="button"
                    role="option"
                    aria-selected={index === activeCommandIndex}
                    className={
                      index === activeCommandIndex
                        ? `${styles.commandOption} ${styles.commandOptionActive}`
                        : styles.commandOption
                    }
                    onMouseEnter={() => setActiveCommandIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectCommand(command)}
                  >
                    <span className={styles.commandOptionIcon}>
                      <IconComponent />
                    </span>
                    <span className={styles.commandOptionName}>{command.name}</span>
                    <span className={styles.commandOptionLabel}>{command.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <form
            className={styles.composerForm}
            onSubmit={(event) => {
              event.preventDefault()
              if (isStreaming) {
                void stop()
              } else {
                runCommandOrSubmit(draft)
              }
            }}
          >
            <Input.TextArea
              value={draft}
              variant="borderless"
              className={styles.composerInput}
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder="问一问地球，例如：帮我找典型的流水侵蚀地貌"
              aria-label="输入问题"
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            {isStreaming ? (
              <Tooltip title="停止生成">
                <Button
                  type="primary"
                  danger
                  shape="circle"
                  size="small"
                  className={styles.composerActionBtn}
                  aria-label="停止生成"
                  icon={<BorderOutlined />}
                  onClick={() => void stop()}
                />
              </Tooltip>
            ) : (
              <Tooltip title="发送">
                <Button
                  type="primary"
                  shape="circle"
                  size="small"
                  htmlType="submit"
                  disabled={!draft.trim()}
                  className={styles.composerActionBtn}
                  aria-label="发送"
                  icon={<ArrowUpOutlined />}
                />
              </Tooltip>
            )}
          </form>
        </div>

        <p className={styles.aiDisclaimer} title="内容由 AI 生成，请注意甄别">
          内容由 AI 生成，请注意甄别
        </p>
      </Drawer>

      <Modal
        open={deleteConfirmOpen}
        title="删除会话"
        width={400}
        okText="删除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onOk={confirmDeleteConversation}
        onCancel={() => setDeleteConfirmOpen(false)}
      >
        <p className={styles.deleteConfirmText}>删除后「{deleteTarget?.title}」将无法恢复。</p>
        <Checkbox checked={deleteNoAsk} onChange={(event) => setDeleteNoAsk(event.target.checked)}>
          不再提示
        </Checkbox>
      </Modal>
    </>
  )
}

export default EoqAssistant
