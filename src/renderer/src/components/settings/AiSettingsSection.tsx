import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import {
  EyeIcon,
  LightbulbIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  ZapIcon
} from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  NumberInput,
  Pagination,
  PasswordInput,
  Segmented,
  Select,
  Spinner,
  Switch,
  Tag,
  Tooltip,
  useConfirm,
  useToast
} from '@renderer/components/ui'
import type {
  AiModelConfig,
  AiModelImportRow,
  AiProviderConfig,
  AiSearchProviderConfig,
  AiSettings,
  AiThinkingLevel,
  ProviderCredentialStatus
} from '../../../../preload'
import { useAiStore } from '@renderer/stores/ai'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { ipcErrorMessage } from '@renderer/lib/ipcError'
import {
  isAiDraftDirty,
  normalizeActiveChoice,
  parseActiveChoice,
  type AiDraftModel,
  type AiDraftProvider,
  type AiPersistedState
} from '@renderer/lib/aiSettingsDraft'
import SearchProviderSettings from '../SearchProviderSettings'
import MemorySettings from '../MemorySettings'
import styles from './AiSettingsSection.module.css'

export interface AiSettingsSectionHandle {
  isDirty: () => boolean
  saveDrafts: () => Promise<boolean>
  discardDrafts: () => void
}

export interface AiSettingsSectionProps {
  active: boolean
  onRequestClose: () => void
  onDirtyChange?: (dirty: boolean) => void
  ref?: Ref<AiSettingsSectionHandle>
}

interface ImportRowDraft extends AiModelImportRow {
  key: string
  selected: boolean
}

const MODEL_PAGE_SIZE = 10

const THINKING_LEVEL_OPTIONS: { value: AiThinkingLevel; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

const PROTOCOL_OPTIONS: { value: AiProviderConfig['protocol']; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' }
]

const EMPTY_MODEL_DRAFT: AiModelConfig = {
  id: '',
  label: '',
  contextWindow: 128000,
  streaming: true,
  vision: false,
  thinking: false,
  thinkingLevel: 'medium',
  enabled: true
}

function thinkingLevelLabel(level: AiThinkingLevel): string {
  return THINKING_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? '中'
}

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

function toProviderDraft(provider: AiProviderConfig): AiDraftProvider {
  return {
    ...provider,
    key: makeKey(),
    models: provider.models.map((model) => ({ ...model, key: makeKey() }))
  }
}

function credentialId(providerId: string): string {
  return `ai-${providerId}`
}

function createDraftSignature(
  providers: AiDraftProvider[],
  activeChoice: string,
  searchProviders: AiSearchProviderConfig[],
  activeSearchProviderId: string
): string {
  return JSON.stringify([
    providers.map((provider) => ({ ...provider, models: provider.models.map((model) => ({ ...model })) })),
    activeChoice,
    searchProviders.map((provider) => ({ ...provider })),
    activeSearchProviderId
  ])
}

export function AiSettingsSection({
  active,
  onRequestClose,
  onDirtyChange,
  ref
}: AiSettingsSectionProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const storeSettings = useAiStore((state) => state.settings)
  const storeHydrated = useAiStore((state) => state.hydrated)
  const hydrate = useAiStore((state) => state.hydrate)
  const saveSettings = useAiStore((state) => state.saveSettings)
  const setSocraticEnabled = useAiStore((state) => state.setSocraticEnabled)
  const closeSettingsWindow = useSettingsWindowStore((state) => state.close)

  const [draftProviders, setDraftProviders] = useState<AiDraftProvider[]>([])
  const [activeChoice, setActiveChoice] = useState('')
  const [credentialStatuses, setCredentialStatuses] = useState<Record<string, ProviderCredentialStatus>>({})
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [draftSearchProviders, setDraftSearchProviders] = useState<AiSearchProviderConfig[]>([])
  const [activeSearchProviderId, setActiveSearchProviderId] = useState('')
  const [socraticBusy, setSocraticBusy] = useState(false)
  const [settingsReading, setSettingsReading] = useState(true)
  const [settingsReadFailed, setSettingsReadFailed] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importConfirmLoading, setImportConfirmLoading] = useState(false)
  const [importRows, setImportRows] = useState<ImportRowDraft[]>([])
  const [importPage, setImportPage] = useState(1)
  const [importPageSize, setImportPageSize] = useState(20)
  const [importProviderId, setImportProviderId] = useState('')
  const [importMatching, setImportMatching] = useState(false)
  const [modelGroupCompat, setModelGroupCompat] = useState(false)
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [modelEditorKey, setModelEditorKey] = useState('')
  const [modelEditorTitle, setModelEditorTitle] = useState('模型详情')
  const [modelSearch, setModelSearch] = useState('')
  const [modelPage, setModelPage] = useState(1)
  const [testingModelKey, setTestingModelKey] = useState('')
  const [modelDraft, setModelDraft] = useState<AiModelConfig>(EMPTY_MODEL_DRAFT)

  const importRequestTokenRef = useRef(0)
  const latestDraftsRef = useRef({
    providers: draftProviders,
    activeChoice,
    searchProviders: draftSearchProviders,
    activeSearchProviderId
  })
  latestDraftsRef.current = {
    providers: draftProviders,
    activeChoice,
    searchProviders: draftSearchProviders,
    activeSearchProviderId
  }

  const selectedProvider = useMemo(
    () => draftProviders.find((provider) => provider.id === selectedProviderId),
    [draftProviders, selectedProviderId]
  )

  const baseUrlPlaceholder =
    (selectedProvider?.protocol ?? 'openai') === 'anthropic'
      ? 'https://api.anthropic.com'
      : 'https://api.deepseek.com 或 https://api.openai.com'

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    const models = selectedProvider?.models ?? []
    if (!query) return models
    return models.filter(
      (model) => model.label.toLowerCase().includes(query) || model.id.toLowerCase().includes(query)
    )
  }, [modelSearch, selectedProvider])

  const pagedModels = useMemo(
    () => filteredModels.slice((modelPage - 1) * MODEL_PAGE_SIZE, modelPage * MODEL_PAGE_SIZE),
    [filteredModels, modelPage]
  )

  const settingsLocked = settingsReading || settingsReadFailed

  const persistedState = useMemo<AiPersistedState>(
    () => ({
      providers: storeSettings.providers,
      activeProviderId: storeSettings.activeProviderId,
      activeModelId: storeSettings.activeModelId,
      searchProviders: storeSettings.searchProviders,
      activeSearchProviderId: storeSettings.activeSearchProviderId
    }),
    [storeSettings]
  )

  const dirty = useMemo(() => {
    if (settingsReading || settingsReadFailed) return false
    return isAiDraftDirty(
      {
        providers: draftProviders,
        activeChoice,
        searchProviders: draftSearchProviders,
        activeSearchProviderId
      },
      persistedState
    )
  }, [activeChoice, activeSearchProviderId, draftProviders, draftSearchProviders, persistedState, settingsReadFailed, settingsReading])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const refreshCredentialStatuses = useCallback(async (providers: AiDraftProvider[]): Promise<void> => {
    const entries: [string, ProviderCredentialStatus][] = []
    for (const provider of providers) {
      try {
        entries.push([provider.id, await window.guEarth.settings.hasProviderApiKey(credentialId(provider.id))])
      } catch {
        entries.push([provider.id, { configured: false, updatedAt: null }])
      }
    }
    setCredentialStatuses(Object.fromEntries(entries))
  }, [])

  const syncDraftsFromStore = useCallback((): AiDraftProvider[] => {
    const settings = useAiStore.getState().settings
    const nextProviders = settings.providers.map(toProviderDraft)
    setDraftProviders(nextProviders)
    setDraftSearchProviders(settings.searchProviders.map((provider) => ({ ...provider })))
    setActiveSearchProviderId(settings.activeSearchProviderId)
    setActiveChoice(
      settings.activeProviderId && settings.activeModelId
        ? `${settings.activeProviderId}:${settings.activeModelId}`
        : ''
    )
    setSelectedProviderId((current) =>
      nextProviders.some((provider) => provider.id === current)
        ? current
        : settings.activeProviderId || nextProviders[0]?.id || ''
    )
    return nextProviders
  }, [])

  useEffect(() => {
    let cancelled = false
    setApiKeyDraft('')
    void (async () => {
      try {
        await hydrate()
        if (cancelled) return
        const failed = !useAiStore.getState().hydrated
        setSettingsReadFailed(failed)
        if (failed) return
        const providers = syncDraftsFromStore()
        setApiKeyDraft('')
        void refreshCredentialStatuses(providers)
      } catch {
        if (!cancelled) setSettingsReadFailed(true)
      } finally {
        if (!cancelled) setSettingsReading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate, refreshCredentialStatuses, syncDraftsFromStore])

  useEffect(() => {
    setApiKeyDraft('')
    setModelSearch('')
    setModelPage(1)
    setModelEditorOpen(false)
  }, [selectedProviderId])

  useEffect(() => {
    setModelPage(1)
  }, [modelSearch])

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredModels.length / MODEL_PAGE_SIZE))
    if (modelPage > lastPage) setModelPage(lastPage)
  }, [filteredModels.length, modelPage])

  const updateSelectedProvider = useCallback(
    (updater: (provider: AiDraftProvider) => AiDraftProvider) => {
      setDraftProviders((previous) =>
        previous.map((provider) => (provider.id === selectedProviderId ? updater(provider) : provider))
      )
    },
    [selectedProviderId]
  )

  const addProvider = useCallback(() => {
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
    setDraftProviders((previous) => [
      ...previous,
      {
        key: makeKey(),
        id,
        name: `服务商 ${previous.length + 1}`,
        protocol: 'openai',
        baseUrl: '',
        models: []
      }
    ])
    setSelectedProviderId(id)
  }, [])

  const removeProvider = useCallback(
    (providerId: string) => {
      const provider = draftProviders.find((item) => item.id === providerId)
      if (!provider) return
      confirm({
        title: '删除服务商？',
        content: provider.models.length
          ? `将同时删除其下的 ${provider.models.length} 个模型。`
          : '该服务商将从列表中移除。',
        okText: '删除',
        cancelText: '取消',
        danger: true,
        onOk: () => {
          setDraftProviders((previous) => {
            const next = previous.filter((item) => item.id !== providerId)
            setSelectedProviderId((current) => (current === providerId ? next[0]?.id ?? '' : current))
            return next
          })
          setActiveChoice((current) => (current.startsWith(`${providerId}:`) ? '' : current))
          setModelEditorOpen(false)
        }
      })
    },
    [confirm, draftProviders]
  )

  const addModel = useCallback(() => {
    if (!selectedProvider) return
    setModelEditorKey('')
    setModelEditorTitle('添加模型')
    setModelDraft({ ...EMPTY_MODEL_DRAFT })
    setModelEditorOpen(true)
  }, [selectedProvider])

  const editModel = useCallback((model: AiDraftModel) => {
    setModelEditorKey(model.key)
    setModelEditorTitle('模型详情')
    setModelDraft({
      id: model.id,
      label: model.label,
      contextWindow: model.contextWindow,
      streaming: model.streaming,
      vision: model.vision,
      thinking: model.thinking,
      thinkingLevel: model.thinkingLevel,
      enabled: model.enabled
    })
    setModelEditorOpen(true)
  }, [])

  const saveModel = useCallback(() => {
    if (!selectedProvider) return
    const id = modelDraft.id.trim()
    if (!id) {
      toast.warning('请填写模型代号')
      return
    }
    if (selectedProvider.models.some((model) => model.key !== modelEditorKey && model.id.trim() === id)) {
      toast.warning('模型代号已存在')
      return
    }
    if (!Number.isFinite(modelDraft.contextWindow) || modelDraft.contextWindow < 4096) {
      toast.warning('上下文窗口不能小于 4096')
      return
    }
    const next: AiModelConfig = {
      id,
      label: modelDraft.label.trim() || id,
      contextWindow: modelDraft.contextWindow,
      streaming: modelDraft.streaming,
      vision: modelDraft.vision,
      thinking: modelDraft.thinking,
      thinkingLevel: modelDraft.thinkingLevel,
      enabled: modelDraft.enabled
    }
    if (modelEditorKey) {
      const existing = selectedProvider.models.find((item) => item.key === modelEditorKey)
      if (!existing) return
      const previousId = existing.id
      const providerId = selectedProvider.id
      updateSelectedProvider((provider) => ({
        ...provider,
        models: provider.models.map((item) => (item.key === modelEditorKey ? { ...item, ...next } : item))
      }))
      if (previousId !== id) {
        setActiveChoice((current) => (current === `${providerId}:${previousId}` ? `${providerId}:${id}` : current))
      }
    } else {
      if (selectedProvider.models.length >= 256) {
        toast.warning('最多保存 256 个模型')
        return
      }
      updateSelectedProvider((provider) => ({
        ...provider,
        models: [...provider.models, { key: makeKey(), ...next }]
      }))
    }
    setModelEditorOpen(false)
    toast.success('模型已保存')
  }, [modelDraft, modelEditorKey, selectedProvider, toast, updateSelectedProvider])

  const removeModel = useCallback(
    (modelKey: string) => {
      if (!selectedProvider) return
      const model = selectedProvider.models.find((item) => item.key === modelKey)
      if (!model) return
      const providerId = selectedProvider.id
      confirm({
        title: '删除模型？',
        content: `将删除“${model.label || model.id}”。`,
        okText: '删除',
        cancelText: '取消',
        danger: true,
        onOk: () => {
          setDraftProviders((previous) =>
            previous.map((provider) =>
              provider.id === providerId
                ? { ...provider, models: provider.models.filter((item) => item.key !== modelKey) }
                : provider
            )
          )
          setActiveChoice((current) => (current === `${providerId}:${model.id}` ? '' : current))
          setModelEditorOpen((open) => (modelEditorKey === modelKey ? false : open))
        }
      })
    },
    [confirm, modelEditorKey, selectedProvider]
  )

  const toggleModel = useCallback(
    (model: AiDraftModel, checked: boolean) => {
      if (!selectedProvider) return
      const providerId = selectedProvider.id
      updateSelectedProvider((provider) => ({
        ...provider,
        models: provider.models.map((item) => (item.key === model.key ? { ...item, enabled: checked } : item))
      }))
      if (!checked) {
        setActiveChoice((current) => (current === `${providerId}:${model.id}` ? '' : current))
      }
    },
    [selectedProvider, updateSelectedProvider]
  )

  const testModel = useCallback(
    async (model: AiDraftModel): Promise<void> => {
      if (!selectedProvider || testingModelKey) return
      if (!selectedProvider.baseUrl.trim()) {
        toast.warning('请先填写接口地址')
        return
      }
      if (!credentialStatuses[selectedProvider.id]?.configured) {
        toast.warning('请先保存 API Key')
        return
      }
      setTestingModelKey(model.key)
      try {
        const result = await window.guEarth.ai.testModel({
          id: selectedProvider.id,
          name: selectedProvider.name,
          protocol: selectedProvider.protocol,
          baseUrl: selectedProvider.baseUrl,
          modelId: model.id
        })
        toast.success(`响应正常，${result.latencyMs} ms`)
      } catch (error) {
        toast.error(ipcErrorMessage(error, '响应测试失败'))
      } finally {
        setTestingModelKey('')
      }
    },
    [credentialStatuses, selectedProvider, testingModelKey, toast]
  )

  const importProvider = useMemo(
    () => draftProviders.find((provider) => provider.id === importProviderId),
    [draftProviders, importProviderId]
  )
  const importFailedCount = useMemo(() => importRows.filter((row) => !row.matched).length, [importRows])
  const importMatchedCount = useMemo(() => importRows.filter((row) => row.matched).length, [importRows])
  const pagedImportRows = useMemo(
    () => importRows.slice((importPage - 1) * importPageSize, importPage * importPageSize),
    [importPage, importPageSize, importRows]
  )

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(importRows.length / importPageSize))
    if (importPage > lastPage) setImportPage(lastPage)
  }, [importPage, importPageSize, importRows.length])

  const canImport = useCallback(
    (provider: AiDraftProvider | undefined): boolean =>
      Boolean(provider && provider.baseUrl.trim() && credentialStatuses[provider.id]?.configured && !settingsLocked),
    [credentialStatuses, settingsLocked]
  )

  const applyImportRows = useCallback((rows: AiModelImportRow[]): void => {
    setImportPage(1)
    setImportRows(
      [...rows]
        .sort((a, b) => Number(a.matched) - Number(b.matched) || a.id.localeCompare(b.id))
        .map((row) => ({ ...row, key: makeKey(), selected: row.matched && !row.existing }))
    )
  }, [])

  const invalidateImportSession = useCallback((): void => {
    importRequestTokenRef.current += 1
    setImportLoading(false)
    setImportMatching(false)
  }, [])

  const cancelImport = useCallback((): void => {
    setImportOpen(false)
    invalidateImportSession()
  }, [invalidateImportSession])

  const openImport = useCallback(async (): Promise<void> => {
    if (!selectedProvider) return
    if (!selectedProvider.baseUrl.trim()) {
      toast.warning('请先填写接口地址')
      return
    }
    if (!credentialStatuses[selectedProvider.id]?.configured) {
      toast.warning('请先保存 API Key')
      return
    }
    const token = ++importRequestTokenRef.current
    setImportProviderId(selectedProvider.id)
    setImportRows([])
    setImportPage(1)
    setImportOpen(true)
    setImportLoading(true)
    setImportMatching(false)
    try {
      const result = await window.guEarth.ai.importModels({
        id: selectedProvider.id,
        name: selectedProvider.name,
        protocol: selectedProvider.protocol,
        baseUrl: selectedProvider.baseUrl,
        models: selectedProvider.models.map(({ key: _key, ...model }) => model),
        modelGroupCompat
      })
      if (token !== importRequestTokenRef.current) return
      applyImportRows(result.models)
      toast.success(`已获取 ${result.models.length} 个模型`)
    } catch (error) {
      if (token !== importRequestTokenRef.current) return
      setImportOpen(false)
      toast.error(ipcErrorMessage(error, '模型导入失败'))
    } finally {
      if (token === importRequestTokenRef.current) setImportLoading(false)
    }
  }, [applyImportRows, credentialStatuses, modelGroupCompat, selectedProvider, toast])

  const refreshImportMatches = useCallback(
    async (next = modelGroupCompat): Promise<void> => {
      if (!importProvider || importLoading || importMatching) return
      const previous = modelGroupCompat
      setModelGroupCompat(next)
      if (!importRows.length) return
      const token = ++importRequestTokenRef.current
      setImportMatching(true)
      try {
        const result = await window.guEarth.ai.importModels({
          id: importProvider.id,
          name: importProvider.name,
          protocol: importProvider.protocol,
          baseUrl: importProvider.baseUrl,
          models: importProvider.models.map(({ key: _key, ...model }) => model),
          ids: importRows.map((row) => row.id),
          modelGroupCompat: next
        })
        if (token !== importRequestTokenRef.current) return
        applyImportRows(result.models)
      } catch (error) {
        if (token !== importRequestTokenRef.current) return
        setModelGroupCompat(previous)
        toast.error(ipcErrorMessage(error, '模型匹配失败'))
      } finally {
        if (token === importRequestTokenRef.current) setImportMatching(false)
      }
    },
    [applyImportRows, importLoading, importMatching, importProvider, importRows, modelGroupCompat, toast]
  )

  const updateImportRow = useCallback((key: string, patch: Partial<ImportRowDraft>, revalidate = false): void => {
    setImportRows((previous) =>
      previous.map((row) => {
        if (row.key !== key) return row
        const next: ImportRowDraft = { ...row, ...patch }
        if (revalidate) {
          next.matched = Boolean(next.id.trim() && next.contextWindow >= 4096)
          if (next.matched) next.failureReason = undefined
        }
        return next
      })
    )
  }, [])

  const deleteImportRow = useCallback((key: string): void => {
    setImportRows((previous) => previous.filter((row) => row.key !== key))
  }, [])

  const confirmImport = useCallback((): void => {
    if (!importProvider) return
    const invalid = importRows.find((row) => row.selected && (!row.id.trim() || row.contextWindow < 4096))
    if (invalid) {
      toast.warning('请先修正选中的模型')
      return
    }
    const ids = new Set(importProvider.models.map((model) => model.id.trim()))
    const seenSelected = new Set<string>()
    for (const row of importRows) {
      if (!row.selected) continue
      const id = row.id.trim()
      if (seenSelected.has(id)) {
        toast.warning(`选中的模型中存在重复 ID：${id}`)
        return
      }
      seenSelected.add(id)
    }
    const rows: ImportRowDraft[] = []
    for (const row of importRows) {
      if (!row.selected) continue
      const id = row.id.trim()
      if (ids.has(id)) continue
      ids.add(id)
      rows.push(row)
    }
    if (!rows.length) {
      toast.info('没有可加入的模型')
      return
    }
    if (importProvider.models.length + rows.length > 256) {
      toast.warning(`最多保存 256 个模型，还可加入 ${Math.max(0, 256 - importProvider.models.length)} 个`)
      return
    }
    const targetProviderId = importProvider.id
    confirm({
      title: '确认导入模型？',
      content: `将加入 ${rows.length} 个模型，已有模型不会覆盖。`,
      okText: '确认导入',
      cancelText: '取消',
      onOk: async () => {
        setImportConfirmLoading(true)
        try {
          const addedModels: AiDraftModel[] = rows.map((row) => ({
            key: makeKey(),
            id: row.id.trim(),
            label: row.label.trim() || row.id.trim(),
            contextWindow: row.contextWindow,
            streaming: row.streaming,
            vision: row.vision,
            thinking: row.thinking,
            thinkingLevel: row.thinkingLevel,
            enabled: true
          }))
          setDraftProviders((previous) =>
            previous.map((provider) =>
              provider.id === targetProviderId
                ? { ...provider, models: [...provider.models, ...addedModels] }
                : provider
            )
          )
          setImportOpen(false)
          invalidateImportSession()
          toast.success(`已加入 ${rows.length} 个模型`)
        } finally {
          setImportConfirmLoading(false)
        }
      }
    })
  }, [confirm, importProvider, importRows, invalidateImportSession, toast])

  const saveApiKey = useCallback(async (): Promise<void> => {
    const key = apiKeyDraft.trim()
    if (!selectedProvider || !key) return
    const providerId = selectedProvider.id
    try {
      const status = await window.guEarth.settings.setProviderApiKey(credentialId(providerId), key)
      setCredentialStatuses((previous) => ({ ...previous, [providerId]: status }))
      setApiKeyDraft('')
      toast.success('API Key 已保存')
    } catch (error) {
      toast.error(error instanceof Error ? '密钥保存失败：系统安全存储不可用' : '密钥保存失败')
    }
  }, [apiKeyDraft, selectedProvider, toast])

  const clearApiKey = useCallback(async (): Promise<void> => {
    if (!selectedProvider) return
    const providerId = selectedProvider.id
    try {
      const status = await window.guEarth.settings.clearProviderApiKey(credentialId(providerId))
      setCredentialStatuses((previous) => ({ ...previous, [providerId]: status }))
      toast.success('API Key 已清除')
    } catch {
      toast.error('API Key 清除失败')
    }
  }, [selectedProvider, toast])

  const toggleSocratic = useCallback(
    async (value: boolean): Promise<void> => {
      if (socraticBusy || settingsLocked) return
      setSocraticBusy(true)
      try {
        await setSocraticEnabled(value)
      } catch {
        toast.error('设置保存失败，请重试')
      } finally {
        setSocraticBusy(false)
      }
    },
    [setSocraticEnabled, settingsLocked, socraticBusy, toast]
  )

  const validate = useCallback((providers: AiDraftProvider[]): string => {
    for (const provider of providers) {
      if (!provider.name.trim()) return '供应商名称不能为空'
      if (!provider.baseUrl.trim()) return `「${provider.name}」的接口地址不能为空`
      for (const model of provider.models) {
        if (!model.id.trim()) return `「${provider.name}」下存在未填写 ID 的模型`
      }
    }
    return ''
  }, [])

  const saveDrafts = useCallback(async (): Promise<boolean> => {
    if (settingsReading) return false
    if (settingsReadFailed) {
      toast.error('AI 设置读取失败，无法保存')
      return false
    }
    const currentDrafts = latestDraftsRef.current
    const problem = validate(currentDrafts.providers)
    if (problem) {
      toast.warning(problem)
      return false
    }
    const currentStoreSettings = useAiStore.getState().settings
    const { providerId: activeProviderId, modelId: activeModelId } = parseActiveChoice(currentDrafts.activeChoice)
    const next: AiSettings = {
      providers: currentDrafts.providers.map((provider) => ({
        id: provider.id,
        name: provider.name.trim(),
        protocol: provider.protocol,
        baseUrl: provider.baseUrl.trim(),
        models: provider.models
          .filter((model) => model.id.trim())
          .map((model) => ({
            id: model.id.trim(),
            label: model.label.trim() || model.id.trim(),
            contextWindow: model.contextWindow,
            streaming: model.streaming,
            vision: model.vision,
            thinking: model.thinking,
            thinkingLevel: model.thinkingLevel,
            enabled: model.enabled
          }))
      })),
      activeProviderId,
      activeModelId,
      searchProviders: currentDrafts.searchProviders.map((provider) => ({ ...provider })),
      activeSearchProviderId: currentDrafts.activeSearchProviderId,
      skipDeleteConversationConfirm: currentStoreSettings.skipDeleteConversationConfirm,
      memoryEnabled: currentStoreSettings.memoryEnabled,
      socraticEnabled: currentStoreSettings.socraticEnabled
    }
    const submittedSignature = createDraftSignature(
      currentDrafts.providers,
      currentDrafts.activeChoice,
      currentDrafts.searchProviders,
      currentDrafts.activeSearchProviderId
    )
    try {
      await saveSettings(next)
      const latest = latestDraftsRef.current
      const editedDuringSave =
        createDraftSignature(
          latest.providers,
          latest.activeChoice,
          latest.searchProviders,
          latest.activeSearchProviderId
        ) !== submittedSignature
      if (!editedDuringSave) syncDraftsFromStore()
      toast.success(editedDuringSave ? '此前的改动已保存，新的改动尚未保存' : 'AI 设置已保存')
      return true
    } catch {
      toast.error('设置保存失败')
      return false
    }
  }, [saveSettings, settingsReadFailed, settingsReading, syncDraftsFromStore, toast, validate])

  const discardDrafts = useCallback((): void => {
    syncDraftsFromStore()
  }, [syncDraftsFromStore])

  const handleSave = useCallback(async (): Promise<void> => {
    const saved = await saveDrafts()
    if (!saved) return
    const latest = latestDraftsRef.current
    const currentSettings = useAiStore.getState().settings
    const stillDirty = isAiDraftDirty(latest, {
      providers: currentSettings.providers,
      activeProviderId: currentSettings.activeProviderId,
      activeModelId: currentSettings.activeModelId,
      searchProviders: currentSettings.searchProviders,
      activeSearchProviderId: currentSettings.activeSearchProviderId
    })
    if (!stillDirty) closeSettingsWindow()
  }, [closeSettingsWindow, saveDrafts])

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => dirty,
      saveDrafts,
      discardDrafts
    }),
    [dirty, discardDrafts, saveDrafts]
  )

  const defaultModelOptions = useMemo(
    () =>
      draftProviders
        .filter((provider) => provider.models.some((model) => model.enabled))
        .map((provider) => ({
          label: provider.name,
          options: provider.models
            .filter((model) => model.enabled)
            .map((model) => ({
              value: `${provider.id}:${model.id}`,
              label: model.label || model.id
            }))
        })),
    [draftProviders]
  )

  const handleModelRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, model: AiDraftModel): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      editModel(model)
    }
  }

  return (
    <section className={styles.settingsSection} data-settings-section="" aria-label="AI 设置">
      <div className={styles.sectionHeading}>
        <h3 className={styles.sectionTitle}>AI</h3>
        {dirty && (
          <Tag tone="warning" className={styles.unsavedTag}>
            未保存
          </Tag>
        )}
      </div>

      {settingsReadFailed && (
        <Alert
          className={styles.readFailureAlert}
          type="error"
          showIcon
          title="AI 设置读取失败，请重启应用后重试"
        />
      )}

      <section className={styles.settingsBlock}>
        <div className={styles.blockHeading}>默认模型</div>
        <Select
          value={activeChoice || undefined}
          className={styles.fullSelect}
          placeholder="选择服务商与模型"
          allowClear
          options={defaultModelOptions}
          aria-label="选择默认模型"
          onChange={(value) => setActiveChoice(normalizeActiveChoice(value))}
        />
      </section>

      <section className={styles.settingsBlock} data-guide-target="ai-provider-settings">
        <div className={styles.blockHeading}>AI 服务商</div>
        <div className={styles.providerColumns}>
          <div className={styles.providerRail}>
            {draftProviders.map((provider) => (
              <div
                key={provider.id}
                className={
                  provider.id === selectedProviderId
                    ? `${styles.providerItem} ${styles.providerItemSelected}`
                    : styles.providerItem
                }
                onClick={() => setSelectedProviderId(provider.id)}
              >
                <span className={styles.providerItemName}>{provider.name}</span>
                {credentialStatuses[provider.id]?.configured && (
                  <Tag tone="success" className={styles.providerItemTag}>
                    密钥
                  </Tag>
                )}
              </div>
            ))}
            <Button variant="dashed" block icon={<PlusIcon className="size-3.5" />} onClick={addProvider}>
              添加服务商
            </Button>
          </div>

          {selectedProvider ? (
            <div className={styles.providerEditor}>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>名称</label>
                <Input
                  value={selectedProvider.name}
                  placeholder="例如 DeepSeek / 通义千问 / Claude"
                  onChange={(event) => {
                    const value = event.target.value
                    updateSelectedProvider((provider) => ({ ...provider, name: value }))
                  }}
                />
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>协议</label>
                <Segmented<AiProviderConfig['protocol']>
                  value={selectedProvider.protocol}
                  options={PROTOCOL_OPTIONS}
                  aria-label="接口协议"
                  onChange={(protocol) => {
                    updateSelectedProvider((provider) => ({ ...provider, protocol }))
                  }}
                />
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>接口地址</label>
                <Input
                  value={selectedProvider.baseUrl}
                  placeholder={baseUrlPlaceholder}
                  onChange={(event) => {
                    const baseUrl = event.target.value
                    updateSelectedProvider((provider) => ({ ...provider, baseUrl }))
                  }}
                />
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>API Key</label>
                <div className={styles.keyRow}>
                  <PasswordInput
                    value={apiKeyDraft}
                    placeholder="输入 API Key"
                    onChange={(event) => setApiKeyDraft(event.target.value)}
                  />
                  <Button
                    variant="primary"
                    disabled={!apiKeyDraft.trim()}
                    icon={<SaveIcon className="size-3.5" />}
                    onClick={() => void saveApiKey()}
                  >
                    保存
                  </Button>
                  <Button
                    disabled={!credentialStatuses[selectedProvider.id]?.configured}
                    icon={<Trash2Icon className="size-3.5" />}
                    onClick={() => void clearApiKey()}
                  >
                    清除
                  </Button>
                </div>
              </div>

              <div className={styles.modelsHeading}>
                <span>模型（{selectedProvider.models.length}）</span>
              </div>
              <div className={styles.modelsToolbar}>
                <Input
                  value={modelSearch}
                  className={styles.modelSearch}
                  placeholder="搜索模型"
                  allowClear
                  prefix={<SearchIcon className="size-3.5" />}
                  onChange={(event) => setModelSearch(event.target.value)}
                />
                <div className={styles.modelsActions}>
                  <Button
                    disabled={!canImport(selectedProvider)}
                    loading={importLoading && importProviderId === selectedProvider.id}
                    icon={<RefreshCwIcon className="size-3.5" />}
                    onClick={() => void openImport()}
                  >
                    刷新模型
                  </Button>
                  <Button icon={<PlusIcon className="size-3.5" />} onClick={addModel}>
                    添加模型
                  </Button>
                </div>
              </div>
              {selectedProvider.models.length === 0 ? (
                <div className={styles.modelsEmpty}>尚未添加模型。</div>
              ) : filteredModels.length === 0 ? (
                <div className={styles.modelsEmpty}>没有匹配的模型。</div>
              ) : (
                <div className={styles.modelList}>
                  {pagedModels.map((model) => (
                    <div
                      key={model.key}
                      tabIndex={0}
                      aria-label={`${model.label || model.id}，打开设置`}
                      className={
                        model.enabled
                          ? styles.modelListRow
                          : `${styles.modelListRow} ${styles.modelListRowDisabled}`
                      }
                      onClick={() => editModel(model)}
                      onKeyDown={(event) => handleModelRowKeyDown(event, model)}
                    >
                      <div className={styles.modelText}>
                        <div className={styles.modelName}>{model.label || model.id}</div>
                        {model.label && model.label !== model.id && (
                          <div className={styles.modelCode}>{model.id}</div>
                        )}
                      </div>
                      <div className={styles.modelActions} onClick={(event) => event.stopPropagation()}>
                        <Tooltip title={model.enabled ? '停用' : '启用'}>
                          <span className="inline-flex">
                            <Switch
                              checked={model.enabled}
                              size="sm"
                              aria-label={model.enabled ? '停用模型' : '启用模型'}
                              onChange={(checked) => toggleModel(model, checked)}
                            />
                          </span>
                        </Tooltip>
                        <Tooltip title="测试连接">
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={testingModelKey === model.key}
                            disabled={Boolean(testingModelKey) && testingModelKey !== model.key}
                            aria-label="测试连接"
                            icon={<ZapIcon className="size-3.5" />}
                            onClick={() => void testModel(model)}
                          />
                        </Tooltip>
                        <Tooltip title="设置">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="模型设置"
                            icon={<SettingsIcon className="size-3.5" />}
                            onClick={() => editModel(model)}
                          />
                        </Tooltip>
                        <Tooltip title="删除">
                          <Button
                            variant="ghost"
                            size="sm"
                            danger
                            aria-label="删除模型"
                            icon={<Trash2Icon className="size-3.5" />}
                            onClick={() => removeModel(model.key)}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filteredModels.length > MODEL_PAGE_SIZE && (
                <Pagination
                  current={modelPage}
                  className={styles.modelPagination}
                  total={filteredModels.length}
                  pageSize={MODEL_PAGE_SIZE}
                  onChange={(page) => setModelPage(page)}
                />
              )}

              <div className={styles.providerDanger}>
                <Button danger variant="ghost" onClick={() => removeProvider(selectedProvider.id)}>
                  删除该服务商
                </Button>
              </div>
            </div>
          ) : (
            <div className={`${styles.providerEditor} ${styles.providerEditorEmpty}`}>
              先在左侧添加一个服务商。
            </div>
          )}
        </div>
      </section>

      <Modal
        open={modelEditorOpen}
        title={modelEditorTitle}
        width={560}
        zIndex={1360}
        okText="保存"
        cancelText="取消"
        onOk={saveModel}
        onCancel={() => setModelEditorOpen(false)}
      >
        <div className={styles.modelEditor}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>模型代号</label>
            <Input
              value={modelDraft.id}
              placeholder="如 deepseek-chat"
              onChange={(event) => {
                const id = event.target.value
                setModelDraft((previous) => ({ ...previous, id }))
              }}
            />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>名称</label>
            <Input
              value={modelDraft.label}
              placeholder="可选"
              onChange={(event) => {
                const label = event.target.value
                setModelDraft((previous) => ({ ...previous, label }))
              }}
            />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>最大上下文长度</label>
            <NumberInput
              value={modelDraft.contextWindow}
              className={styles.modelContextInput}
              min={4096}
              max={2000000}
              step={32000}
              aria-label="最大上下文长度"
              onChange={(value) =>
                setModelDraft((previous) => ({
                  ...previous,
                  contextWindow: typeof value === 'number' ? value : 4096
                }))
              }
            />
          </div>
          <div className={styles.modelSwitches}>
            <span className={styles.modelField}>
              <label>流式输出</label>
              <Switch
                checked={modelDraft.streaming}
                size="sm"
                aria-label="流式输出"
                onChange={(streaming) => setModelDraft((previous) => ({ ...previous, streaming }))}
              />
            </span>
            <span className={styles.modelField}>
              <Tooltip title="支持识别图片和截图">
                <label className={styles.visionLabel}>图像识别</label>
              </Tooltip>
              <Switch
                checked={modelDraft.vision}
                size="sm"
                aria-label="图像识别"
                onChange={(vision) => setModelDraft((previous) => ({ ...previous, vision }))}
              />
            </span>
            <span className={styles.modelField}>
              <label>深度思考</label>
              <Switch
                checked={modelDraft.thinking}
                size="sm"
                aria-label="深度思考"
                onChange={(thinking) => setModelDraft((previous) => ({ ...previous, thinking }))}
              />
            </span>
            <span className={styles.modelField}>
              <label>思考深度</label>
              <Select
                value={modelDraft.thinkingLevel}
                disabled={!modelDraft.thinking}
                size="sm"
                className={styles.levelSelect}
                options={THINKING_LEVEL_OPTIONS}
                aria-label="思考深度"
                onChange={(thinkingLevel) => {
                  if (thinkingLevel) setModelDraft((previous) => ({ ...previous, thinkingLevel }))
                }}
              />
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        title="导入模型"
        width={960}
        zIndex={1360}
        confirmLoading={importConfirmLoading}
        okDisabled={importLoading || importMatching}
        okText="确认导入"
        cancelText="取消"
        onOk={confirmImport}
        onCancel={cancelImport}
      >
        <div className={styles.importSummary}>
          <Alert
            className="min-w-0 flex-1"
            type="neutral"
            showIcon
            title={
              importMatching
                ? '正在重新匹配…'
                : `匹配成功 ${importMatchedCount} 个，未匹配 ${importFailedCount} 个`
            }
          />
          <Tooltip title="按“/”后的名称自动匹配模型信息">
            <span className={styles.importOption}>
              <span>模型组兼容</span>
              <Switch
                checked={modelGroupCompat}
                size="sm"
                loading={importMatching}
                disabled={importLoading || importMatching}
                aria-label="模型组兼容"
                onChange={(checked) => void refreshImportMatches(checked)}
              />
              <Button
                variant="link"
                size="sm"
                disabled={importLoading || importMatching}
                onClick={() => void refreshImportMatches()}
              >
                重新匹配
              </Button>
            </span>
          </Tooltip>
        </div>
        <Spinner spinning={importLoading || importMatching} className={styles.importTableWrap}>
          <div className={styles.importTableScroll}>
            <table className={styles.importTable}>
              <thead>
                <tr>
                  <th style={{ width: 64 }}>导入</th>
                  <th style={{ width: 220 }}>模型 ID</th>
                  <th style={{ width: 180 }}>名称</th>
                  <th style={{ width: 132 }}>上下文</th>
                  <th>能力</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {pagedImportRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.importTableEmpty}>
                      {importLoading ? '正在获取模型列表…' : '暂无可导入模型'}
                    </td>
                  </tr>
                ) : (
                  pagedImportRows.map((record) => (
                    <tr key={record.key} className={record.matched ? undefined : styles.importRowFailed}>
                      <td>
                        <Checkbox
                          checked={record.selected}
                          disabled={record.existing}
                          aria-label={`导入 ${record.id}`}
                          onChange={(checked) => updateImportRow(record.key, { selected: checked })}
                        />
                      </td>
                      <td>
                        <Input
                          size="sm"
                          value={record.id}
                          aria-label="模型 ID"
                          onChange={(event) => updateImportRow(record.key, { id: event.target.value }, true)}
                        />
                      </td>
                      <td>
                        <Input
                          size="sm"
                          value={record.label}
                          aria-label="模型名称"
                          onChange={(event) => updateImportRow(record.key, { label: event.target.value })}
                        />
                      </td>
                      <td>
                        <NumberInput
                          size="sm"
                          min={4096}
                          max={2000000}
                          value={record.contextWindow}
                          aria-label="上下文窗口"
                          onChange={(value) =>
                            updateImportRow(
                              record.key,
                              { contextWindow: typeof value === 'number' ? value : 4096 },
                              true
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={styles.importCapabilities}>
                            {record.vision && (
                              <Tooltip title="支持视觉输入">
                                <span className="inline-flex" aria-label="支持视觉输入">
                                  <EyeIcon className="size-3.5" />
                                </span>
                              </Tooltip>
                            )}
                            {record.thinking && (
                              <Tooltip title={`支持思考，等级：${thinkingLevelLabel(record.thinkingLevel)}`}>
                                <span className="inline-flex" aria-label="支持思考">
                                  <LightbulbIcon className="size-3.5" />
                                </span>
                              </Tooltip>
                            )}
                          </span>
                          {record.existing && <span className={styles.importNote}>已有</span>}
                          {!record.matched && (
                            <span className={styles.importFailure}>{record.failureReason || '需检查'}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          danger
                          aria-label="删除导入项"
                          icon={<Trash2Icon className="size-3.5" />}
                          onClick={() => deleteImportRow(record.key)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {importRows.length > 0 && (
            <Pagination
              current={importPage}
              total={importRows.length}
              pageSize={importPageSize}
              pageSizeOptions={[20, 50, 100]}
              showSizeChanger
              showQuickJumper
              showTotal
              className="mt-3"
              onChange={(page, size) => {
                setImportPage(page)
                setImportPageSize(size)
              }}
            />
          )}
        </Spinner>
      </Modal>

      <section className={styles.settingsBlock}>
        <div className={styles.blockHeading}>联网搜索</div>
        <SearchProviderSettings
          providers={draftSearchProviders}
          activeProviderId={activeSearchProviderId}
          onActiveProviderIdChange={setActiveSearchProviderId}
        />
      </section>

      <section className={styles.settingsBlock}>
        <div className={styles.blockHeading}>记忆</div>
        <MemorySettings active={active} />
      </section>

      <section className={styles.settingsBlock}>
        <div className={styles.blockHeading}>教学风格</div>
        <div className={styles.teachingToggle}>
          <div className={styles.teachingToggleText}>
            <div className={styles.teachingToggleTitle}>苏格拉底引导模式</div>
            <p className={styles.teachingToggleDesc}>以提问启发思考，不直接给出答案</p>
          </div>
          <Switch
            checked={storeHydrated ? storeSettings.socraticEnabled : storeSettings.socraticEnabled}
            loading={socraticBusy}
            disabled={settingsLocked}
            aria-label="苏格拉底模式开关"
            onChange={(checked) => void toggleSocratic(checked)}
          />
        </div>
      </section>

      <div className={styles.aiFooter}>
        <Button onClick={onRequestClose}>取消</Button>
        <Button variant="primary" disabled={settingsLocked} onClick={() => void handleSave()}>
          保存设置
        </Button>
      </div>
    </section>
  )
}

export default AiSettingsSection
