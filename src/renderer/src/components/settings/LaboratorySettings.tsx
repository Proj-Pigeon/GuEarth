import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  PasswordInput,
  Select,
  Spinner,
  Tag,
  Tooltip,
  useToast
} from '@renderer/components/ui'
import { useOnlineDataStore } from '@renderer/stores/onlineData'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { normalizeQWeatherHost, validateQWeatherApiKey } from '../../../../common/onlineData'
import type { LaboratoryProvider, LaboratoryProviderInput } from '../../../../common/onlineData'

import styles from './LaboratorySettings.module.css'

export interface LaboratorySettingsProps {
  active: boolean
  onBusyChange?: (busy: boolean) => void
}

interface ProviderDraftState {
  category: 'weather'
  provider: 'qweather'
  apiHost: string
  apiKey: string
}

const INITIAL_DRAFT: ProviderDraftState = {
  category: 'weather',
  provider: 'qweather',
  apiHost: '',
  apiKey: ''
}

const CATEGORY_OPTIONS = [{ value: 'weather' as const, label: '天气信息' }]
const PROVIDER_OPTIONS = [{ value: 'qweather' as const, label: '和风天气' }]

export function LaboratorySettings({ active, onBusyChange }: LaboratorySettingsProps) {
  const toast = useToast()
  const snapshot = useOnlineDataStore(state => state.snapshot)

  const [providers, setProviders] = useState<LaboratoryProvider[]>([])
  const [loaded, setLoaded] = useState(false)
  const [operation, setOperation] = useState<'load' | 'save' | 'remove' | null>(null)
  const [loadError, setLoadError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProviderDraftState>(INITIAL_DRAFT)
  const [hostError, setHostError] = useState('')
  const [keyError, setKeyError] = useState('')

  const busy = operation !== null
  const provider = providers.find(item => item.provider === 'qweather')
  const providerIssue = provider?.configured ? snapshot?.typhoonError || '' : '配置异常，请重新填写'
  const keyRequired = !editing || !provider?.configured
  const actionsDisabled = busy || editorOpen || removeOpen

  const loadedRef = useRef(loaded)
  loadedRef.current = loaded
  const actionsDisabledRef = useRef(actionsDisabled)
  actionsDisabledRef.current = actionsDisabled
  const busyRef = useRef(busy)
  busyRef.current = busy
  const onBusyChangeRef = useRef(onBusyChange)
  onBusyChangeRef.current = onBusyChange

  const clearDraft = useCallback(() => {
    setDraft(INITIAL_DRAFT)
    setHostError('')
    setKeyError('')
    setOperationError('')
  }, [])

  const loadProviders = useCallback(async (): Promise<void> => {
    if (actionsDisabledRef.current) {
      return
    }
    setOperation('load')
    setLoadError('')
    try {
      const result = await window.guEarth.laboratory.listProviders()
      setProviders(result)
      setLoaded(true)
    } catch {
      setLoadError('加载失败，请重试')
    } finally {
      setOperation(null)
    }
  }, [])

  const closeDialogs = useCallback(() => {
    if (busyRef.current) {
      return
    }
    setEditorOpen(false)
    setRemoveOpen(false)
    clearDraft()
  }, [clearDraft])

  useEffect(() => {
    if (active && !loadedRef.current) {
      void loadProviders()
    }
    if (!active) {
      closeDialogs()
    }
  }, [active, loadProviders, closeDialogs])

  useEffect(() => {
    onBusyChangeRef.current?.(operation === 'save' || operation === 'remove')
  }, [operation])

  useEffect(
    () => () => {
      onBusyChangeRef.current?.(false)
    },
    []
  )

  function openEditor(edit: boolean): void {
    if (actionsDisabled || !loaded || (edit ? !provider : Boolean(provider))) {
      return
    }
    clearDraft()
    setEditing(edit)
    setDraft({
      ...INITIAL_DRAFT,
      apiHost: edit ? (provider?.apiHost ?? '') : ''
    })
    setEditorOpen(true)
  }

  async function saveProvider(): Promise<void> {
    if (busy || !editorOpen || (!editing && provider)) {
      return
    }
    let nextHostError = ''
    let nextKeyError = ''
    const rawKey = draft.apiKey.trim()
    let apiKey = ''
    if (rawKey) {
      try {
        apiKey = validateQWeatherApiKey(rawKey)
      } catch (error) {
        nextKeyError = error instanceof Error ? error.message : '请输入有效的 API Key'
      }
    } else {
      nextKeyError = keyRequired ? '请输入 API Key' : ''
    }
    let apiHost = ''
    try {
      apiHost = normalizeQWeatherHost(draft.apiHost)
    } catch (error) {
      nextHostError = error instanceof Error ? error.message : '请输入有效的和风天气 API Host'
    }
    setHostError(nextHostError)
    setKeyError(nextKeyError)
    if (nextHostError || nextKeyError) {
      return
    }
    const input: LaboratoryProviderInput = {
      category: draft.category,
      provider: draft.provider,
      apiHost
    }
    if (apiKey) {
      input.apiKey = apiKey
    }
    setOperation('save')
    setOperationError('')
    try {
      const nextProviders = await window.guEarth.laboratory.saveProvider(input)
      setProviders(nextProviders)
      setEditorOpen(false)
      clearDraft()
      toast.success('已保存')
    } catch {
      setOperationError('保存失败，请重试')
    } finally {
      setOperation(null)
    }
  }

  function confirmRemove(): void {
    if (actionsDisabled || !provider) {
      return
    }
    setOperationError('')
    setRemoveOpen(true)
  }

  async function removeProvider(): Promise<void> {
    if (busy || !removeOpen || !provider) {
      return
    }
    setOperation('remove')
    setOperationError('')
    try {
      const nextProviders = await window.guEarth.laboratory.removeProvider('qweather')
      setProviders(nextProviders)
      setRemoveOpen(false)
      clearDraft()
      toast.success('已移除')
    } catch {
      setOperationError('移除失败，请重试')
    } finally {
      setOperation(null)
    }
  }

  return (
    <section className={styles.settingsSection} data-settings-section='' aria-label='实验室设置'>
      <h3 className={styles.sectionTitle}>实验室</h3>

      <section className={styles.settingsBlock} aria-label='数据源'>
        <h4 className={styles.blockHeading}>数据源</h4>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>天气数据源</span>
            <Tooltip title='添加数据源'>
              <Button
                variant='ghost'
                size='sm'
                disabled={actionsDisabled || !loaded || Boolean(loadError) || Boolean(provider)}
                aria-label='添加数据源'
                icon={<PlusIcon className='size-4' />}
                onClick={() => openEditor(false)}
              />
            </Tooltip>
          </div>
          <div className={styles.cardBody}>
            {operation === 'load' ? (
              <div className={styles.loadingSpace}>
                <Spinner size='sm' />
                <span className='text-ink-tertiary text-[12px]'>加载中…</span>
              </div>
            ) : loadError ? (
              <Alert
                type='error'
                showIcon
                title={loadError}
                action={
                  <Button size='sm' disabled={actionsDisabled} onClick={() => void loadProviders()}>
                    重试
                  </Button>
                }
              />
            ) : provider ? (
              <div className={styles.providerRow}>
                <div className={styles.providerInfo}>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-ink text-[14px] font-semibold'>和风天气</span>
                    <Tag>天气信息</Tag>
                    <Tooltip title={providerIssue || '配置正常'}>
                      <span
                        className='inline-flex items-center gap-1.5 text-[12px]'
                        aria-label={providerIssue || '配置正常'}
                      >
                        <span
                          className={
                            providerIssue
                              ? 'bg-destructive size-2 rounded-full'
                              : 'bg-success size-2 rounded-full'
                          }
                        />
                        {providerIssue && <span className='text-destructive'>{providerIssue}</span>}
                      </span>
                    </Tooltip>
                  </div>
                  <p className={styles.providerHost}>API Host：{provider.apiHost}</p>
                </div>
                <div className={styles.providerActions}>
                  <Tooltip title='编辑'>
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={actionsDisabled}
                      aria-label='编辑数据源'
                      icon={<PencilIcon className='size-3.5' />}
                      onClick={() => openEditor(true)}
                    />
                  </Tooltip>
                  <Tooltip title='删除'>
                    <Button
                      variant='ghost'
                      size='sm'
                      danger
                      disabled={actionsDisabled}
                      aria-label='删除数据源'
                      icon={<Trash2Icon className='size-3.5' />}
                      onClick={confirmRemove}
                    />
                  </Tooltip>
                </div>
              </div>
            ) : loaded ? (
              <Empty description='暂未添加数据源' />
            ) : null}
          </div>
        </div>
      </section>

      <Modal
        open={editorOpen}
        title={editing ? '编辑数据源' : '添加数据源'}
        width={480}
        zIndex={1360}
        okText={operationError ? '重试' : '保存'}
        cancelText='取消'
        confirmLoading={operation === 'save'}
        okDisabled={busy}
        closable={!busy}
        keyboard={!busy}
        maskClosable={false}
        onOk={() => void saveProvider()}
        onCancel={closeDialogs}
      >
        <div className='flex flex-col gap-3.5'>
          <div className={styles.formField}>
            <label className={styles.formLabel}>类型 *</label>
            <Select
              value={draft.category}
              disabled={busy}
              options={CATEGORY_OPTIONS}
              aria-label='数据源类型'
              onChange={value => {
                if (value) {
                  setDraft(prev => ({ ...prev, category: value }))
                }
              }}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>平台 *</label>
            <Select
              value={draft.provider}
              disabled={busy}
              options={PROVIDER_OPTIONS}
              aria-label='数据源平台'
              onChange={value => {
                if (value) {
                  setDraft(prev => ({ ...prev, provider: value }))
                }
              }}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>API Host *</label>
            <Input
              value={draft.apiHost}
              disabled={busy}
              status={hostError ? 'error' : undefined}
              placeholder='如 xxx.qweatherapi.com'
              autoComplete='off'
              onChange={event => {
                setDraft(prev => ({ ...prev, apiHost: event.target.value }))
                setHostError('')
              }}
              onPressEnter={() => void saveProvider()}
            />
            {hostError && <div className={styles.fieldError}>{hostError}</div>}
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>API Key{keyRequired ? ' *' : ''}</label>
            <PasswordInput
              value={draft.apiKey}
              disabled={busy}
              status={keyError ? 'error' : undefined}
              placeholder={keyRequired ? '输入 API Key' : '留空则保持不变'}
              autoComplete='new-password'
              onChange={event => {
                setDraft(prev => ({ ...prev, apiKey: event.target.value }))
                setKeyError('')
              }}
              onPressEnter={() => void saveProvider()}
            />
            {keyError && <div className={styles.fieldError}>{keyError}</div>}
          </div>
          {operationError && (
            <Alert className={styles.formError} type='error' showIcon title={operationError} />
          )}
        </div>
      </Modal>

      <Modal
        open={removeOpen}
        title='移除和风天气？'
        width={440}
        zIndex={1360}
        okText={operationError ? '重试' : '移除'}
        cancelText='取消'
        confirmLoading={operation === 'remove'}
        okDanger
        okDisabled={busy}
        closable={!busy}
        keyboard={!busy}
        maskClosable={false}
        onOk={() => void removeProvider()}
        onCancel={closeDialogs}
      >
        <p className='text-ink-secondary m-0 text-[14px] leading-6'>
          移除后将不再使用该数据源获取实时天气数据。
        </p>
        {operationError && (
          <Alert className={styles.formError} type='error' showIcon title={operationError} />
        )}
      </Modal>
    </section>
  )
}

export default LaboratorySettings
