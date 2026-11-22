import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useOnlineDataStore } from '@renderer/stores/onlineData'
import {
  Alert,
  App as AntdApp,
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  normalizeQWeatherHost,
  validateQWeatherApiKey,
  type LaboratoryProvider,
  type LaboratoryProviderInput
} from '../../../../common/onlineData'

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
  const { message } = AntdApp.useApp()
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
  const providerIssue = !provider?.configured
    ? '配置异常，请重新填写'
    : snapshot?.typhoonError || ''
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
    if (actionsDisabledRef.current) return
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
    if (busyRef.current) return
    setEditorOpen(false)
    setRemoveOpen(false)
    clearDraft()
  }, [clearDraft])

  useEffect(() => {
    if (active && !loadedRef.current) void loadProviders()
    if (!active) closeDialogs()
  }, [active, loadProviders, closeDialogs])

  useEffect(() => {
    onBusyChangeRef.current?.(operation === 'save' || operation === 'remove')
  }, [operation])

  useEffect(() => {
    return () => {
      onBusyChangeRef.current?.(false)
    }
  }, [])

  function openEditor(edit: boolean): void {
    if (actionsDisabled || !loaded || (edit ? !provider : Boolean(provider))) return
    clearDraft()
    setEditing(edit)
    setDraft({
      ...INITIAL_DRAFT,
      apiHost: edit ? (provider?.apiHost ?? '') : ''
    })
    setEditorOpen(true)
  }

  async function saveProvider(): Promise<void> {
    if (busy || !editorOpen || (!editing && provider)) return
    let nextHostError = ''
    let nextKeyError = ''
    const rawKey = draft.apiKey.trim()
    let apiKey = ''
    if (!rawKey) {
      nextKeyError = keyRequired ? '请输入 API Key' : ''
    } else {
      try {
        apiKey = validateQWeatherApiKey(rawKey)
      } catch (error) {
        nextKeyError = error instanceof Error ? error.message : '请输入有效的 API Key'
      }
    }
    let apiHost = ''
    try {
      apiHost = normalizeQWeatherHost(draft.apiHost)
    } catch (error) {
      nextHostError = error instanceof Error ? error.message : '请输入有效的和风天气 API Host'
    }
    setHostError(nextHostError)
    setKeyError(nextKeyError)
    if (nextHostError || nextKeyError) return
    const input: LaboratoryProviderInput = {
      category: draft.category,
      provider: draft.provider,
      apiHost
    }
    if (apiKey) input.apiKey = apiKey
    setOperation('save')
    setOperationError('')
    try {
      const nextProviders = await window.guEarth.laboratory.saveProvider(input)
      setProviders(nextProviders)
      setEditorOpen(false)
      clearDraft()
      message.success('已保存')
    } catch {
      setOperationError('保存失败，请重试')
    } finally {
      setOperation(null)
    }
  }

  function confirmRemove(): void {
    if (actionsDisabled || !provider) return
    setOperationError('')
    setRemoveOpen(true)
  }

  async function removeProvider(): Promise<void> {
    if (busy || !removeOpen || !provider) return
    setOperation('remove')
    setOperationError('')
    try {
      const nextProviders = await window.guEarth.laboratory.removeProvider('qweather')
      setProviders(nextProviders)
      setRemoveOpen(false)
      clearDraft()
      message.success('已移除')
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
        <Card
          title='天气数据源'
          size='small'
          extra={
            <Tooltip title='添加数据源'>
              <Button
                type='text'
                disabled={actionsDisabled || !loaded || Boolean(loadError) || Boolean(provider)}
                aria-label='添加数据源'
                icon={<PlusOutlined />}
                onClick={() => openEditor(false)}
              />
            </Tooltip>
          }
        >
          {operation === 'load' ? (
            <Spin className={styles.loading} description='加载中…'>
              <div className={styles.loadingSpace} />
            </Spin>
          ) : loadError ? (
            <Alert
              type='error'
              showIcon
              title={loadError}
              action={
                <Button disabled={actionsDisabled} onClick={() => void loadProviders()}>
                  重试
                </Button>
              }
            />
          ) : provider ? (
            <div className={styles.providerRow}>
              <div className={styles.providerInfo}>
                <Space size={8} wrap>
                  <Typography.Text strong>和风天气</Typography.Text>
                  <Tag>天气信息</Tag>
                  <Tooltip title={providerIssue || '配置正常'}>
                    <Badge
                      status={providerIssue ? 'error' : 'success'}
                      text={providerIssue || undefined}
                      aria-label={providerIssue || '配置正常'}
                    />
                  </Tooltip>
                </Space>
                <p className={styles.providerHost}>API Host：{provider.apiHost}</p>
              </div>
              <div className={styles.providerActions}>
                <Tooltip title='编辑'>
                  <Button
                    type='text'
                    disabled={actionsDisabled}
                    aria-label='编辑数据源'
                    icon={<EditOutlined />}
                    onClick={() => openEditor(true)}
                  />
                </Tooltip>
                <Tooltip title='删除'>
                  <Button
                    type='text'
                    danger
                    disabled={actionsDisabled}
                    aria-label='删除数据源'
                    icon={<DeleteOutlined />}
                    onClick={confirmRemove}
                  />
                </Tooltip>
              </div>
            </div>
          ) : loaded ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='暂未添加数据源' />
          ) : null}
        </Card>
      </section>

      <Modal
        open={editorOpen}
        title={editing ? '编辑数据源' : '添加数据源'}
        width={480}
        okText={operationError ? '重试' : '保存'}
        cancelText='取消'
        confirmLoading={operation === 'save'}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        keyboard={!busy}
        mask={{ closable: false }}
        destroyOnHidden
        onOk={() => void saveProvider()}
        onCancel={closeDialogs}
      >
        <Form layout='vertical' disabled={busy}>
          <Form.Item label='类型' required>
            <Select
              value={draft.category}
              options={CATEGORY_OPTIONS}
              onChange={value => setDraft(prev => ({ ...prev, category: value }))}
            />
          </Form.Item>
          <Form.Item label='平台' required>
            <Select
              value={draft.provider}
              options={PROVIDER_OPTIONS}
              onChange={value => setDraft(prev => ({ ...prev, provider: value }))}
            />
          </Form.Item>
          <Form.Item
            label='API Host'
            required
            validateStatus={hostError ? 'error' : undefined}
            help={hostError || undefined}
          >
            <Input
              value={draft.apiHost}
              placeholder='如 xxx.qweatherapi.com'
              autoComplete='off'
              onChange={event => {
                setDraft(prev => ({ ...prev, apiHost: event.target.value }))
                setHostError('')
              }}
              onPressEnter={() => void saveProvider()}
            />
          </Form.Item>
          <Form.Item
            label='API Key'
            required={keyRequired}
            validateStatus={keyError ? 'error' : undefined}
            help={keyError || undefined}
          >
            <Input.Password
              value={draft.apiKey}
              placeholder={keyRequired ? '输入 API Key' : '留空则保持不变'}
              autoComplete='new-password'
              onChange={event => {
                setDraft(prev => ({ ...prev, apiKey: event.target.value }))
                setKeyError('')
              }}
              onPressEnter={() => void saveProvider()}
            />
          </Form.Item>
        </Form>
        {operationError && (
          <Alert className={styles.formError} type='error' showIcon title={operationError} />
        )}
      </Modal>

      <Modal
        open={removeOpen}
        title='移除和风天气？'
        width={480}
        okText={operationError ? '重试' : '移除'}
        cancelText='取消'
        confirmLoading={operation === 'remove'}
        okButtonProps={{ danger: true, disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        keyboard={!busy}
        mask={{ closable: false }}
        onOk={() => void removeProvider()}
        onCancel={closeDialogs}
      >
        <p>移除后将不再使用该数据源获取实时天气数据。</p>
        {operationError && (
          <Alert className={styles.formError} type='error' showIcon title={operationError} />
        )}
      </Modal>
    </section>
  )
}

export default LaboratorySettings
