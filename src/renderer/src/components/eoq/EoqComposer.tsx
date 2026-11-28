import { AuiIf, ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { DropdownMenu } from '@renderer/components/ui'
import type { DropdownMenuEntry } from '@renderer/components/ui'
import { cn } from '@renderer/lib/utils'
import { useAiStore } from '@renderer/stores/ai'
import { ArrowUpIcon, ChevronUpIcon, SquareIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { AiModelConfig, AiProviderConfig } from '../../../../preload'
import ContextMeter from '../ContextMeter'
import EoqIconButton from './EoqIconButton'

import styles from '../EoqAssistant.module.css'

export interface EoqSlashCommand {
  name: string
  label: string
  icon: LucideIcon
  run: () => void | Promise<void>
}

export interface EoqComposerProps {
  commands: readonly EoqSlashCommand[]
}

function modelKey(provider: AiProviderConfig, model: AiModelConfig): string {
  return `${provider.id}:${model.id}`
}

export function EoqComposer({ commands }: EoqComposerProps) {
  const aui = useAui()
  const composerText = useAuiState(state => state.composer.text)
  const isRunning = useAuiState(state => state.thread.isRunning)

  const settings = useAiStore(state => state.settings)
  const contextStats = useAiStore(state => state.contextStats)
  const contextCompressionStatus = useAiStore(state => state.contextCompressionStatus)
  const contextCompressionNotice = useAiStore(state => state.contextCompressionNotice)
  const setActiveModel = useAiStore(state => state.setActiveModel)
  const compressContext = useAiStore(state => state.compressContext)

  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [commandDismissed, setCommandDismissed] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const trimmedStart = composerText.trimStart()
  const commandQuery = trimmedStart.startsWith('/')
    ? trimmedStart.slice(1).split(/\s/)[0].toLowerCase()
    : ''

  const filteredCommands = useMemo(
    () =>
      commands.filter(command => !commandQuery || command.name.slice(1).startsWith(commandQuery)),
    [commands, commandQuery]
  )

  const commandMenuOpen =
    trimmedStart.startsWith('/') && !isRunning && !commandDismissed && filteredCommands.length > 0

  const safeActiveIndex =
    filteredCommands.length > 0 ? activeCommandIndex % filteredCommands.length : 0
  const activeCommand = filteredCommands[safeActiveIndex] ?? filteredCommands[0]

  useEffect(() => {
    setActiveCommandIndex(0)
    setCommandDismissed(false)
  }, [composerText])

  const selectCommand = useCallback(
    (command: EoqSlashCommand) => {
      aui.composer().setText('')
      setCommandDismissed(true)
      setActiveCommandIndex(0)
      void command.run()
    },
    [aui]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return
      }
      if (!commandMenuOpen || filteredCommands.length === 0) {
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const offset = event.key === 'ArrowDown' ? 1 : -1
        setActiveCommandIndex(
          prev => (prev + offset + filteredCommands.length) % filteredCommands.length
        )
        event.preventDefault()
        return
      }
      if (event.key === 'Tab' && !event.shiftKey && activeCommand) {
        aui.composer().setText(activeCommand.name)
        event.preventDefault()
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && activeCommand) {
        event.preventDefault()
        selectCommand(activeCommand)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setCommandDismissed(true)
      }
    },
    [activeCommand, aui, commandMenuOpen, filteredCommands.length, selectCommand]
  )

  const modelProviders = useMemo(
    () =>
      settings.providers
        .map(provider => ({ ...provider, models: provider.models.filter(model => model.enabled) }))
        .filter(provider => provider.models.length > 0),
    [settings.providers]
  )

  const activeProvider = useMemo(
    () => settings.providers.find(provider => provider.id === settings.activeProviderId),
    [settings.activeProviderId, settings.providers]
  )

  const activeModel = useMemo(
    () =>
      activeProvider?.models.find(model => model.id === settings.activeModelId && model.enabled),
    [activeProvider, settings.activeModelId]
  )

  const activeModelLabel = activeModel?.label || activeModel?.id || '选择模型'

  const handleModelSelect = useCallback(
    (choice: string) => {
      const separatorIndex = choice.indexOf(':')
      if (separatorIndex === -1) {
        return
      }
      setModelMenuOpen(false)
      void setActiveModel(choice.slice(0, separatorIndex), choice.slice(separatorIndex + 1))
    },
    [setActiveModel]
  )

  const modelMenuItems = useMemo<DropdownMenuEntry[]>(() => {
    if (modelProviders.length === 0) {
      return [
        {
          key: 'model-empty',
          disabled: true,
          label: '请先在设置中添加或启用模型'
        }
      ]
    }
    return modelProviders.map(provider => ({
      type: 'group' as const,
      key: provider.id,
      label: provider.name,
      children: provider.models.map(model => ({
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
    <div className='relative flex flex-col'>
      {commandMenuOpen && (
        <div
          role='listbox'
          aria-label='快捷指令'
          className='animate-eoq-fade-up border-hairline bg-popover absolute inset-x-0 bottom-[calc(100%+8px)] z-20 rounded-xl border p-1 shadow-[var(--shadow-popup)] motion-reduce:animate-none'
        >
          {filteredCommands.map((command, index) => {
            const IconComponent = command.icon
            const active = index === safeActiveIndex
            return (
              <button
                key={command.name}
                type='button'
                role='option'
                aria-selected={active}
                onMouseEnter={() => setActiveCommandIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectCommand(command)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] leading-[22px] transition-colors duration-100',
                  active
                    ? 'bg-active-fill text-ink'
                    : 'text-ink-secondary hover:bg-hover-fill hover:text-ink'
                )}
              >
                <IconComponent
                  className={cn('size-3.5 shrink-0', active ? 'text-ink' : 'text-ink-tertiary')}
                />
                <span
                  className={cn('w-20 shrink-0 font-mono text-[12px]', active && 'font-semibold')}
                >
                  {command.name}
                </span>
                <span className='text-ink-tertiary min-w-0 flex-1 truncate text-[12px]'>
                  {command.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <ComposerPrimitive.Root className='flex w-full flex-col'>
        <div
          onClick={event => {
            if (event.target === event.currentTarget) {
              inputRef.current?.focus()
            }
          }}
          className='border-border-strong bg-elevated hover:border-ink/25 focus-within:border-ring focus-within:ring-ring/12 flex cursor-text flex-col gap-2 rounded-2xl border px-3 pt-2.5 pb-2 transition-[border-color,box-shadow] duration-200 focus-within:ring-2 motion-reduce:transition-none'
        >
          <ComposerPrimitive.Input
            ref={inputRef}
            minRows={1}
            maxRows={5}
            placeholder='问一问地球，例如：帮我找典型的流水侵蚀地貌'
            aria-label='输入问题'
            enterKeyHint='send'
            cancelOnEscape={false}
            onKeyDown={handleKeyDown}
            className='text-foreground placeholder:text-muted-foreground w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[22px] shadow-none ring-0 outline-none focus:border-0 focus:ring-0 focus:outline-none focus-visible:outline-none'
          />

          <div className='flex items-center justify-between gap-2 pt-0.5'>
            <div className='flex min-w-0 flex-1 items-center gap-1'>
              <ContextMeter
                stats={contextStats}
                status={contextCompressionStatus}
                notice={contextCompressionNotice}
                disabled={isRunning}
                onCompress={() => void compressContext()}
              />
              <DropdownMenu
                open={modelMenuOpen}
                onOpenChange={setModelMenuOpen}
                placement='topLeft'
                menuClassName={styles.modelMenu}
                selectedKeys={[`${settings.activeProviderId}:${settings.activeModelId}`]}
                items={modelMenuItems}
                onSelect={handleModelSelect}
              >
                <button
                  type='button'
                  disabled={isRunning}
                  aria-label='选择模型'
                  aria-haspopup='menu'
                  aria-expanded={modelMenuOpen}
                  className='text-ink-secondary hover:bg-hover-fill hover:text-ink focus-visible:ring-ring/30 inline-flex h-7 max-w-[168px] min-w-0 cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent px-2 text-[12px] leading-5 transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
                >
                  <span className='truncate'>{activeModelLabel}</span>
                  <ChevronUpIcon
                    className={cn(
                      'size-3.5 shrink-0 opacity-60 transition-transform duration-200 motion-reduce:transition-none',
                      modelMenuOpen && 'rotate-180'
                    )}
                  />
                </button>
              </DropdownMenu>
            </div>

            <div className='flex shrink-0 items-center'>
              <AuiIf condition={state => !state.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <EoqIconButton
                    type='submit'
                    variant='primary'
                    size='md'
                    tooltip='发送'
                    aria-label='发送'
                    disabled={!composerText.trim()}
                  >
                    <ArrowUpIcon className='size-4' />
                  </EoqIconButton>
                </ComposerPrimitive.Send>
              </AuiIf>
              <AuiIf condition={state => state.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <EoqIconButton
                    type='button'
                    variant='ink'
                    size='md'
                    tooltip='停止生成'
                    aria-label='停止生成'
                  >
                    <SquareIcon className='size-3 fill-current' />
                  </EoqIconButton>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  )
}

export default EoqComposer
