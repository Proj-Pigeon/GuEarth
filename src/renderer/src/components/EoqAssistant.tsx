import { ThreadPrimitive } from '@assistant-ui/react'
import { Button, Checkbox, Drawer, DropdownMenu, Modal, Tooltip } from '@renderer/components/ui'
import type { DropdownMenuEntry } from '@renderer/components/ui'
import { useAiStore } from '@renderer/stores/ai'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { HistoryIcon, Minimize2Icon, PlusIcon, SettingsIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'

import type { StoredAiConversationSummary } from '../../../preload'
import EoqComposer from './eoq/EoqComposer'
import type { EoqSlashCommand } from './eoq/EoqComposer'
import EoqIconButton from './eoq/EoqIconButton'
import EoqMessages from './eoq/EoqMessages'
import EoqRuntimeProvider from './eoq/EoqRuntimeProvider'
import EoqWelcome from './eoq/EoqWelcome'

import styles from './EoqAssistant.module.css'

function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) {
    return time
  }
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${time}`
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

export function EoqAssistant() {
  const messages = useAiStore(state => state.messages)
  const conversations = useAiStore(state => state.conversations)
  const currentConversationId = useAiStore(state => state.currentConversationId)
  const isStreaming = useAiStore(state => state.isStreaming)
  const isPanelOpen = useAiStore(state => state.isPanelOpen)
  const settings = useAiStore(state => state.settings)
  const setPanelOpen = useAiStore(state => state.setPanelOpen)
  const newConversation = useAiStore(state => state.newConversation)
  const openConversation = useAiStore(state => state.openConversation)
  const deleteConversation = useAiStore(state => state.deleteConversation)
  const setSkipDeleteConversationConfirm = useAiStore(
    state => state.setSkipDeleteConversationConfirm
  )
  const compressContext = useAiStore(state => state.compressContext)
  const send = useAiStore(state => state.send)

  const openSettings = useSettingsWindowStore(state => state.open)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StoredAiConversationSummary | null>(null)
  const [deleteNoAsk, setDeleteNoAsk] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  )
  const [drawerWidth, setDrawerWidth] = useState(() =>
    Math.min(420, Math.floor((typeof window === 'undefined' ? 1280 : window.innerWidth) / 3))
  )

  const resizingRef = useRef(false)
  const drawerWidthRef = useRef(drawerWidth)
  drawerWidthRef.current = drawerWidth

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
      // Best effort, so the failure is ignored.
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
      // Best effort, so the failure is ignored.
    }
  }, [clampDrawerWidth])

  useEffect(() => {
    const handleViewportResize = (): void => {
      const nextViewport = window.innerWidth
      setViewportWidth(nextViewport)
      const maxWidth = Math.max(0, Math.floor(nextViewport / 3))
      setDrawerWidth(current => clampDrawerWidth(current, maxWidth))
    }
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [clampDrawerWidth])

  const stopDrawerResize = useCallback(() => {
    if (!resizingRef.current) {
      return
    }
    resizingRef.current = false
    document.body.style.userSelect = ''
    persistDrawerWidth(drawerWidthRef.current)
  }, [persistDrawerWidth])

  useEffect(() => {
    const handleDrawerResize = (event: PointerEvent): void => {
      if (!resizingRef.current) {
        return
      }
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
    if (event.button !== 0) {
      return
    }
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
      if (event.key === 'ArrowLeft') {
        nextWidth = clampDrawerWidth(drawerWidthRef.current + step)
      }
      if (event.key === 'ArrowRight') {
        nextWidth = clampDrawerWidth(drawerWidthRef.current - step)
      }
      if (event.key === 'Home') {
        nextWidth = drawerMinWidth
      }
      if (event.key === 'End') {
        nextWidth = drawerMaxWidth
      }
      setDrawerWidth(nextWidth)
      persistDrawerWidth(nextWidth)
      event.preventDefault()
    },
    [clampDrawerWidth, drawerMaxWidth, drawerMinWidth, persistDrawerWidth]
  )

  const agentCommands = useMemo<EoqSlashCommand[]>(
    () => [
      { name: '/new', label: '新建会话', icon: PlusIcon, run: () => newConversation() },
      { name: '/resume', label: '历史会话', icon: HistoryIcon, run: () => setHistoryOpen(true) },
      { name: '/compact', label: '精简对话', icon: Minimize2Icon, run: () => compressContext() },
      { name: '/settings', label: '设置', icon: SettingsIcon, run: () => openSettings('ai') }
    ],
    [compressContext, newConversation, openSettings]
  )

  const handleInterceptSend = useCallback(
    (text: string): boolean => {
      const command = /^\/([^\s]+)(?:\s+.*)?$/.exec(text.trim())?.[1].toLowerCase()
      if (!command) {
        return false
      }
      const matched = agentCommands.find(item => item.name.slice(1) === command)
      if (!matched) {
        return false
      }
      void matched.run()
      return true
    },
    [agentCommands]
  )

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      const text = prompt.trim()
      if (!text || isStreaming) {
        return
      }
      void send(text)
    },
    [isStreaming, send]
  )

  const handleHistorySelect = useCallback(
    (key: string) => {
      setHistoryOpen(false)
      void openConversation(key)
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
    if (!target) {
      return
    }
    if (deleteNoAsk) {
      setSkipDeleteConversationConfirm(true)
    }
    void deleteConversation(target.id)
  }, [deleteConversation, deleteNoAsk, deleteTarget, setSkipDeleteConversationConfirm])

  const historyMenuItems = useMemo<DropdownMenuEntry[]>(() => {
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
    return conversations.map(conversation => ({
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
          <span className={styles.historyItemTime}>
            {formatConversationTime(conversation.updatedAt)}
          </span>
          <Tooltip title='删除会话'>
            <Button
              variant='ghost'
              size='sm'
              danger
              className={styles.historyDelete}
              aria-label={`删除会话 ${conversation.title}`}
              icon={<Trash2Icon className='size-3.5' />}
              onClick={event => handleDeleteConversation(event, conversation)}
            />
          </Tooltip>
        </div>
      )
    }))
  }, [conversations, currentConversationId, handleDeleteConversation])

  return (
    <>
      <Drawer
        open={isPanelOpen}
        placement='right'
        size={drawerWidth}
        className='eoq-drawer'
        bodyStyle={{
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 16px 10px',
          gap: '8px',
          position: 'relative',
          overflow: 'hidden'
        }}
        title={
          <div className={styles.panelTitle}>
            <h2 className={styles.panelHeading}>EOQ 助手</h2>
            <div className={styles.titleActions}>
              {messages.length > 0 && (
                <EoqIconButton
                  tooltip='新建会话'
                  tooltipPlacement='bottom'
                  size='md'
                  disabled={isStreaming}
                  onClick={() => newConversation()}
                >
                  <PlusIcon className='size-4' />
                </EoqIconButton>
              )}
              <DropdownMenu
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                placement='bottomRight'
                popupClassName='w-[300px]'
                menuClassName={styles.historyMenu}
                items={historyMenuItems}
                onSelect={handleHistorySelect}
              >
                <span className='inline-flex'>
                  <EoqIconButton
                    tooltip='历史会话'
                    tooltipPlacement='bottom'
                    size='md'
                    aria-haspopup='menu'
                    aria-expanded={historyOpen}
                  >
                    <HistoryIcon className='size-4' />
                  </EoqIconButton>
                </span>
              </DropdownMenu>
              <EoqIconButton
                tooltip='设置'
                tooltipPlacement='bottom'
                size='md'
                onClick={() => openSettings('ai')}
              >
                <SettingsIcon className='size-4' />
              </EoqIconButton>
              <EoqIconButton
                tooltip='关闭助手'
                tooltipPlacement='bottom'
                size='md'
                onClick={() => setPanelOpen(false)}
              >
                <XIcon className='size-4' />
              </EoqIconButton>
            </div>
          </div>
        }
        onClose={() => setPanelOpen(false)}
      >
        <div
          className={styles.drawerResizeHandle}
          role='separator'
          tabIndex={0}
          aria-orientation='vertical'
          aria-label='调整助手宽度'
          aria-valuemin={drawerMinWidth}
          aria-valuemax={drawerMaxWidth}
          aria-valuenow={drawerWidth}
          onPointerDown={startDrawerResize}
          onKeyDown={handleResizeKeydown}
        />

        <EoqRuntimeProvider onInterceptSend={handleInterceptSend}>
          <ThreadPrimitive.Root className='flex min-h-0 flex-1 flex-col gap-2'>
            {messages.length === 0 ? (
              <ThreadPrimitive.Empty>
                <EoqWelcome onSelectPrompt={handleSubmitPrompt} />
              </ThreadPrimitive.Empty>
            ) : (
              <EoqMessages onSubmitPrompt={handleSubmitPrompt} />
            )}
            <EoqComposer commands={agentCommands} />
          </ThreadPrimitive.Root>
        </EoqRuntimeProvider>

        <p className={styles.aiDisclaimer} title='内容由 AI 生成，请注意甄别'>
          内容由 AI 生成，请注意甄别
        </p>
      </Drawer>

      <Modal
        open={deleteConfirmOpen}
        title='删除会话'
        width={400}
        okText='删除'
        okDanger
        cancelText='取消'
        onOk={confirmDeleteConversation}
        onCancel={() => setDeleteConfirmOpen(false)}
      >
        <p className={styles.deleteConfirmText}>删除后「{deleteTarget?.title}」将无法恢复。</p>
        <Checkbox checked={deleteNoAsk} onChange={checked => setDeleteNoAsk(checked)}>
          不再提示
        </Checkbox>
      </Modal>
    </>
  )
}

export default EoqAssistant
