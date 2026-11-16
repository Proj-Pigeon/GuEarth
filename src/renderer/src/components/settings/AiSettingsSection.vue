<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BulbOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SaveOutlined, SearchOutlined, SettingOutlined, SyncOutlined, ThunderboltOutlined } from '@ant-design/icons-vue'
import type { AiModelConfig, AiModelImportRow, AiProviderConfig, AiSearchProviderConfig, AiSettings, AiThinkingLevel, ProviderCredentialStatus } from '../../../../preload'
import { useAiStore } from '@renderer/stores/ai'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { ipcErrorMessage } from '@renderer/lib/ipcError'
import SearchProviderSettings from '../SearchProviderSettings.vue'
import MemorySettings from '../MemorySettings.vue'

interface ProviderDraft extends AiProviderConfig {
  key: string
  models: ModelDraft[]
}

interface ModelDraft extends AiModelConfig {
  key: string
}

const props = defineProps<{ active: boolean }>()

const store = useAiStore()
const settingsWindow = useSettingsWindowStore()

const draftProviders = ref<ProviderDraft[]>([])
const activeChoice = ref('')
const credentialStatuses = ref<Record<string, ProviderCredentialStatus>>({})
const selectedProviderId = ref('')
const apiKeyDraft = ref('')
const draftSearchProviders = ref<AiSearchProviderConfig[]>([])
const activeSearchProviderId = ref('')
const socraticBusy = ref(false)
const settingsReading = ref(true)
const settingsReadFailed = ref(false)
const importOpen = ref(false)
const importLoading = ref(false)
const importConfirmLoading = ref(false)
const importRows = ref<Array<AiModelImportRow & { key: string; selected: boolean }>>([])
const importProviderId = ref('')
const importMatching = ref(false)
const modelGroupCompat = ref(false)
const modelEditorOpen = ref(false)
const modelEditorKey = ref('')
const modelEditorTitle = ref('模型详情')
const modelSearch = ref('')
const modelPage = ref(1)
const testingModelKey = ref('')
const modelDraft = reactive<AiModelConfig>({
  id: '',
  label: '',
  contextWindow: 128000,
  streaming: true,
  vision: false,
  thinking: false,
  thinkingLevel: 'medium',
  enabled: true
})

const baseUrlPlaceholder = computed(() => (selectedProvider.value?.protocol ?? 'openai') === 'anthropic'
  ? 'https://api.anthropic.com'
  : 'https://api.deepseek.com 或 https://api.openai.com')

const selectedProvider = computed(() => draftProviders.value.find((provider) => provider.id === selectedProviderId.value))
const modelPageSize = 10
const filteredModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase()
  const models = selectedProvider.value?.models ?? []
  if (!query) return models
  return models.filter((model) => model.label.toLowerCase().includes(query) || model.id.toLowerCase().includes(query))
})
const pagedModels = computed(() => filteredModels.value.slice((modelPage.value - 1) * modelPageSize, modelPage.value * modelPageSize))

const settingsLocked = computed(() => settingsReading.value || settingsReadFailed.value)

const thinkingLevelOptions: { value: AiThinkingLevel; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

function thinkingLevelLabel(level: AiThinkingLevel): string {
  return thinkingLevelOptions.find((option) => option.value === level)?.label ?? '中'
}

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

function toProviderDraft(provider: AiProviderConfig): ProviderDraft {
  return {
    ...provider,
    key: makeKey(),
    models: provider.models.map((model) => ({ ...model, key: makeKey() }))
  }
}

function credentialId(providerId: string): string {
  return `ai-${providerId}`
}

async function refreshCredentialStatuses(): Promise<void> {
  const entries: [string, ProviderCredentialStatus][] = []
  for (const provider of draftProviders.value) {
    try {
      entries.push([provider.id, await window.guEarth.settings.hasProviderApiKey(credentialId(provider.id))])
    } catch {
      entries.push([provider.id, { configured: false, updatedAt: null }])
    }
  }
  credentialStatuses.value = Object.fromEntries(entries)
}

onMounted(async () => {
  try {
    apiKeyDraft.value = ''
    await store.hydrate()
    settingsReadFailed.value = !store.hydrated
    if (settingsReadFailed.value) return
    draftProviders.value = store.settings.providers.map(toProviderDraft)
    draftSearchProviders.value = store.settings.searchProviders.map((provider) => ({ ...provider }))
    activeSearchProviderId.value = store.settings.activeSearchProviderId
    activeChoice.value = store.settings.activeProviderId && store.settings.activeModelId
      ? `${store.settings.activeProviderId}:${store.settings.activeModelId}`
      : ''
    selectedProviderId.value = store.settings.activeProviderId || draftProviders.value[0]?.id || ''
    apiKeyDraft.value = ''
    void refreshCredentialStatuses()
  } catch {
    settingsReadFailed.value = true
  } finally {
    settingsReading.value = false
  }
})

watch(selectedProviderId, () => {
  apiKeyDraft.value = ''
  modelSearch.value = ''
  modelPage.value = 1
  modelEditorOpen.value = false
})

watch(modelSearch, () => {
  modelPage.value = 1
})

watch(filteredModels, () => {
  const lastPage = Math.max(1, Math.ceil(filteredModels.value.length / modelPageSize))
  if (modelPage.value > lastPage) modelPage.value = lastPage
})

function addProvider(): void {
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const provider: ProviderDraft = reactive({
    key: makeKey(),
    id,
    name: `供应商 ${draftProviders.value.length + 1}`,
    protocol: 'openai',
    baseUrl: '',
    models: []
  })
  draftProviders.value.push(provider)
  selectedProviderId.value = id
}

function removeProvider(providerId: string): void {
  const provider = draftProviders.value.find((item) => item.id === providerId)
  if (!provider) return
  Modal.confirm({
    title: '删除供应商？',
    content: provider.models.length ? `将同时删除其下的 ${provider.models.length} 个模型。` : '该供应商将从列表中移除。',
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => {
      draftProviders.value = draftProviders.value.filter((item) => item.id !== providerId)
      if (selectedProviderId.value === providerId) selectedProviderId.value = draftProviders.value[0]?.id ?? ''
      if (activeChoice.value.startsWith(`${providerId}:`)) activeChoice.value = ''
      modelEditorOpen.value = false
    }
  })
}

function addModel(): void {
  const provider = selectedProvider.value
  if (!provider) return
  modelEditorKey.value = ''
  modelEditorTitle.value = '添加模型'
  Object.assign(modelDraft, {
    id: '',
    label: '',
    contextWindow: 128000,
    streaming: true,
    vision: false,
    thinking: false,
    thinkingLevel: 'medium',
    enabled: true
  })
  modelEditorOpen.value = true
}

function editModel(model: ModelDraft): void {
  modelEditorKey.value = model.key
  modelEditorTitle.value = '模型详情'
  Object.assign(modelDraft, {
    id: model.id,
    label: model.label,
    contextWindow: model.contextWindow,
    streaming: model.streaming,
    vision: model.vision,
    thinking: model.thinking,
    thinkingLevel: model.thinkingLevel,
    enabled: model.enabled
  })
  modelEditorOpen.value = true
}

function saveModel(): void {
  const provider = selectedProvider.value
  if (!provider) return
  const id = modelDraft.id.trim()
  if (!id) {
    message.warning('请填写模型代号')
    return
  }
  if (provider.models.some((model) => model.key !== modelEditorKey.value && model.id.trim() === id)) {
    message.warning('模型代号已存在')
    return
  }
  if (!Number.isFinite(modelDraft.contextWindow) || modelDraft.contextWindow < 4096) {
    message.warning('上下文窗口不能小于 4096')
    return
  }
  const next = {
    id,
    label: modelDraft.label.trim() || id,
    contextWindow: modelDraft.contextWindow,
    streaming: modelDraft.streaming,
    vision: modelDraft.vision,
    thinking: modelDraft.thinking,
    thinkingLevel: modelDraft.thinkingLevel,
    enabled: modelDraft.enabled
  }
  if (modelEditorKey.value) {
    const model = provider.models.find((item) => item.key === modelEditorKey.value)
    if (!model) return
    const previousId = model.id
    Object.assign(model, next)
    if (activeChoice.value === `${provider.id}:${previousId}` && previousId !== id) {
      activeChoice.value = `${provider.id}:${id}`
    }
  } else {
    if (provider.models.length >= 256) {
      message.warning('最多保存 256 个模型')
      return
    }
    provider.models.push({ key: makeKey(), ...next })
  }
  modelEditorOpen.value = false
  message.success('模型已保存')
}

function removeModel(modelKey: string): void {
  const provider = selectedProvider.value
  if (!provider) return
  const model = provider.models.find((item) => item.key === modelKey)
  if (!model) return
  Modal.confirm({
    title: '删除模型？',
    content: `将删除“${model.label || model.id}”。`,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => {
      provider.models = provider.models.filter((item) => item.key !== modelKey)
      if (activeChoice.value === `${provider.id}:${model.id}`) activeChoice.value = ''
      if (modelEditorKey.value === modelKey) modelEditorOpen.value = false
    }
  })
}

function toggleModel(model: ModelDraft, value: string | number | boolean): void {
  model.enabled = value === true
  const provider = selectedProvider.value
  if (!model.enabled && provider && activeChoice.value === `${provider.id}:${model.id}`) activeChoice.value = ''
}

async function testModel(model: ModelDraft): Promise<void> {
  const provider = selectedProvider.value
  if (!provider || testingModelKey.value) return
  if (!provider.baseUrl.trim()) {
    message.warning('请先填写接口地址')
    return
  }
  if (!credentialStatuses.value[provider.id]?.configured) {
    message.warning('请先保存 API Key')
    return
  }
  testingModelKey.value = model.key
  try {
    const result = await window.guEarth.ai.testModel({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      modelId: model.id
    })
    message.success(`响应正常，${result.latencyMs} ms`)
  } catch (error) {
    message.error(ipcErrorMessage(error, '响应测试失败'))
  } finally {
    testingModelKey.value = ''
  }
}

function modelRowProps(model: ModelDraft): Record<string, unknown> {
  return {
    tabindex: 0,
    'aria-label': `${model.label || model.id}，打开设置`,
    style: { cursor: 'pointer' },
    onClick: () => editModel(model),
    onKeydown: (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        editModel(model)
      }
    }
  }
}

const importProvider = computed(() => draftProviders.value.find((provider) => provider.id === importProviderId.value))
const importFailedCount = computed(() => importRows.value.filter((row) => !row.matched).length)
const importMatchedCount = computed(() => importRows.value.filter((row) => row.matched).length)
const importSelectedCount = computed(() => importRows.value.filter((row) => row.selected).length)

function canImport(provider: ProviderDraft | undefined): boolean {
  return Boolean(provider && provider.baseUrl.trim() && credentialStatuses.value[provider.id]?.configured && !settingsLocked.value)
}

function applyImportRows(rows: AiModelImportRow[]): void {
  importRows.value = rows
    .sort((a, b) => Number(a.matched) - Number(b.matched) || a.id.localeCompare(b.id))
    .map((row) => ({ ...row, key: makeKey(), selected: row.matched && !row.existing }))
}

async function openImport(): Promise<void> {
  const provider = selectedProvider.value
  if (!provider) return
  if (!provider.baseUrl.trim()) {
    message.warning('请先填写接口地址')
    return
  }
  if (!credentialStatuses.value[provider.id]?.configured) {
    message.warning('请先保存 API Key')
    return
  }
  importProviderId.value = provider.id
  importRows.value = []
  importOpen.value = true
  importLoading.value = true
  try {
    const result = await window.guEarth.ai.importModels({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      models: provider.models.map(({ key: _key, ...model }) => model),
      modelGroupCompat: modelGroupCompat.value
    })
    if (importProviderId.value !== provider.id) return
    applyImportRows(result.models)
    message.success(`已获取 ${result.models.length} 个模型`)
  } catch (error) {
    importOpen.value = false
    message.error(ipcErrorMessage(error, '模型导入失败'))
  } finally {
    importLoading.value = false
  }
}

async function refreshImportMatches(next = modelGroupCompat.value): Promise<void> {
  const provider = importProvider.value
  if (!provider || importMatching.value) return
  const previous = modelGroupCompat.value
  modelGroupCompat.value = next
  if (!importRows.value.length) return
  importMatching.value = true
  try {
    const result = await window.guEarth.ai.importModels({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      models: provider.models.map(({ key: _key, ...model }) => model),
      ids: importRows.value.map((row) => row.id),
      modelGroupCompat: next
    })
    if (importProviderId.value !== provider.id) return
    applyImportRows(result.models)
  } catch (error) {
    modelGroupCompat.value = previous
    message.error(ipcErrorMessage(error, '模型匹配失败'))
  } finally {
    importMatching.value = false
  }
}

function updateImportRow(row: AiModelImportRow & { key: string; selected: boolean }): void {
  row.matched = Boolean(row.id.trim() && row.contextWindow >= 4096)
  if (row.matched) row.failureReason = undefined
}

function deleteImportRow(key: string): void {
  importRows.value = importRows.value.filter((row) => row.key !== key)
}

function confirmImport(): void {
  const provider = importProvider.value
  if (!provider) return
  const invalid = importRows.value.find((row) => row.selected && (!row.id.trim() || row.contextWindow < 4096))
  if (invalid) {
    message.warning('请先修正选中的模型')
    return
  }
  const ids = new Set(provider.models.map((model) => model.id))
  const rows = importRows.value.filter((row) => row.selected && !ids.has(row.id.trim()))
  if (!rows.length) {
    message.info('没有可加入的模型')
    return
  }
  if (provider.models.length + rows.length > 256) {
    message.warning(`最多保存 256 个模型，还可加入 ${Math.max(0, 256 - provider.models.length)} 个`)
    return
  }
  Modal.confirm({
    title: '确认导入模型？',
    content: `将加入 ${rows.length} 个模型，已有模型不会覆盖。`,
    okText: '确认导入',
    cancelText: '取消',
    onOk: async () => {
      importConfirmLoading.value = true
      try {
        provider.models.push(...rows.map((row) => ({
          key: makeKey(),
          id: row.id.trim(),
          label: row.label.trim() || row.id.trim(),
          contextWindow: row.contextWindow,
          streaming: row.streaming,
          vision: row.vision,
          thinking: row.thinking,
          thinkingLevel: row.thinkingLevel,
          enabled: true
        })))
        importOpen.value = false
        message.success(`已加入 ${rows.length} 个模型`)
      } finally {
        importConfirmLoading.value = false
      }
    }
  })
}

async function saveApiKey(): Promise<void> {
  const provider = selectedProvider.value
  const key = apiKeyDraft.value.trim()
  if (!provider || !key) return
  try {
    const status = await window.guEarth.settings.setProviderApiKey(credentialId(provider.id), key)
    credentialStatuses.value = { ...credentialStatuses.value, [provider.id]: status }
    apiKeyDraft.value = ''
    message.success('API Key 已保存')
  } catch (error) {
    message.error(error instanceof Error ? '密钥保存失败：系统安全存储不可用' : '密钥保存失败')
  }
}

async function clearApiKey(): Promise<void> {
  const provider = selectedProvider.value
  if (!provider) return
  try {
    const status = await window.guEarth.settings.clearProviderApiKey(credentialId(provider.id))
    credentialStatuses.value = { ...credentialStatuses.value, [provider.id]: status }
    message.success('API Key 已清除')
  } catch {
    message.error('API Key 清除失败')
  }
}

async function toggleSocratic(value: boolean): Promise<void> {
  if (socraticBusy.value || settingsLocked.value) return
  socraticBusy.value = true
  try {
    await store.setSocraticEnabled(value)
  } catch {
    message.error('设置保存失败，请重试')
  } finally {
    socraticBusy.value = false
  }
}

function validate(): string {
  for (const provider of draftProviders.value) {
    if (!provider.name.trim()) return '供应商名称不能为空'
    if (!provider.baseUrl.trim()) return `「${provider.name}」的接口地址不能为空`
    for (const model of provider.models) {
      if (!model.id.trim()) return `「${provider.name}」下存在未填写 ID 的模型`
    }
  }
  return ''
}

async function handleSave(): Promise<void> {
  if (settingsReading.value) return
  if (settingsReadFailed.value) {
    message.error('AI 设置读取失败，无法保存')
    return
  }
  const problem = validate()
  if (problem) {
    message.warning(problem)
    return
  }
  const choice = typeof activeChoice.value === 'string' ? activeChoice.value : ''
  const separatorIndex = choice.indexOf(':')
  const activeProviderId = separatorIndex >= 0 ? choice.slice(0, separatorIndex) : ''
  const activeModelId = separatorIndex >= 0 ? choice.slice(separatorIndex + 1) : ''
  const next: AiSettings = {
    providers: draftProviders.value.map((provider) => ({
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
    searchProviders: draftSearchProviders.value.map((provider) => ({ ...provider })),
    activeSearchProviderId: activeSearchProviderId.value,
    skipDeleteConversationConfirm: store.settings.skipDeleteConversationConfirm,
    memoryEnabled: store.settings.memoryEnabled,
    socraticEnabled: store.settings.socraticEnabled
  }
  try {
    await store.saveSettings(next)
    message.success('AI 设置已保存')
    settingsWindow.close()
  } catch {
    message.error('设置保存失败')
  }
}
</script>

<template>
  <section class="settings-section" aria-label="AI 设置">
    <h3 class="section-title">AI</h3>

    <a-alert
      v-if="settingsReadFailed"
      class="read-failure-alert"
      type="error"
      show-icon
      message="AI 设置读取失败"
      description="为避免默认配置覆盖已保存的供应商设置，本页的保存操作已禁用，请重启应用后重试。"
    />

    <section class="settings-block">
      <div class="block-heading">默认模型</div>
      <a-select
        v-model:value="activeChoice"
        class="full-select"
        placeholder="选择供应商与模型"
        allow-clear
      >
        <a-select-opt-group v-for="provider in draftProviders.filter((item) => item.models.some((model) => model.enabled))" :key="provider.id" :label="provider.name">
          <a-select-option v-for="model in provider.models.filter((item) => item.enabled)" :key="`${provider.id}:${model.id}`" :value="`${provider.id}:${model.id}`">
            {{ model.label || model.id }}
          </a-select-option>
        </a-select-opt-group>
      </a-select>
      <div class="default-hint">发送提问时将使用该模型。</div>
    </section>

    <section class="settings-block provider-layout" data-guide-target="ai-provider-settings">
      <div class="block-heading">LLM 供应商</div>
      <div class="provider-columns">
        <div class="provider-rail">
          <div
            v-for="provider in draftProviders"
            :key="provider.id"
            :class="['provider-item', { selected: provider.id === selectedProviderId }]"
            @click="selectedProviderId = provider.id"
          >
            <span class="provider-item-name">{{ provider.name }}</span>
            <a-tag v-if="credentialStatuses[provider.id]?.configured" color="green" class="provider-item-tag">密钥</a-tag>
          </div>
          <a-button type="dashed" block @click="addProvider"><PlusOutlined />添加供应商</a-button>
        </div>

        <div v-if="selectedProvider" class="provider-editor">
          <div class="field-row">
            <label class="field-label">名称</label>
            <a-input v-model:value="selectedProvider.name" placeholder="例如 DeepSeek / 通义千问 / Claude" />
          </div>
          <div class="field-row">
            <label class="field-label">协议</label>
            <a-radio-group v-model:value="selectedProvider.protocol">
              <a-radio-button value="openai">OpenAI 兼容</a-radio-button>
              <a-radio-button value="anthropic">Anthropic</a-radio-button>
            </a-radio-group>
          </div>
          <div class="field-row">
            <label class="field-label">接口地址</label>
            <a-input v-model:value="selectedProvider.baseUrl" :placeholder="baseUrlPlaceholder" />
          </div>
          <div class="field-row">
            <label class="field-label">API Key</label>
            <div class="key-row">
              <a-input-password v-model:value="apiKeyDraft" placeholder="sk-…（仅保存在本机安全存储）" />
              <a-button type="primary" :disabled="!apiKeyDraft.trim()" @click="saveApiKey"><SaveOutlined />保存</a-button>
              <a-button :disabled="!credentialStatuses[selectedProvider.id]?.configured" @click="clearApiKey"><DeleteOutlined />清除</a-button>
            </div>
          </div>

          <div class="models-heading">
            <span>模型（{{ selectedProvider.models.length }}）</span>
          </div>
          <div class="models-toolbar">
            <a-input v-model:value="modelSearch" class="model-search" placeholder="搜索模型" allow-clear>
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <div class="models-actions">
              <a-button :disabled="!canImport(selectedProvider)" :loading="importLoading && importProviderId === selectedProvider.id" @click="openImport"><SyncOutlined v-if="!(importLoading && importProviderId === selectedProvider.id)" />刷新模型</a-button>
              <a-button @click="addModel"><PlusOutlined />添加模型</a-button>
            </div>
          </div>
          <div v-if="selectedProvider.models.length === 0" class="models-empty">尚未添加模型。</div>
          <div v-else-if="filteredModels.length === 0" class="models-empty">没有匹配的模型。</div>
          <div v-else class="model-list">
            <div
              v-for="model in pagedModels"
              :key="model.key"
              :class="['model-list-row', { disabled: !model.enabled }]"
              v-bind="modelRowProps(model)"
            >
              <div class="model-text">
                <div class="model-name">{{ model.label || model.id }}</div>
                <div v-if="model.label && model.label !== model.id" class="model-code">{{ model.id }}</div>
              </div>
              <div class="model-actions" @click.stop>
                <a-tooltip :title="model.enabled ? '停用' : '启用'">
                  <a-switch
                    :checked="model.enabled"
                    size="small"
                    :aria-label="model.enabled ? '停用模型' : '启用模型'"
                    @change="(value: string | number | boolean) => toggleModel(model, value)"
                  />
                </a-tooltip>
                <a-tooltip title="响应测试">
                  <a-button
                    type="text"
                    :loading="testingModelKey === model.key"
                    :disabled="Boolean(testingModelKey) && testingModelKey !== model.key"
                    aria-label="响应测试"
                    @click="testModel(model)"
                  ><ThunderboltOutlined v-if="testingModelKey !== model.key" /></a-button>
                </a-tooltip>
                <a-tooltip title="设置">
                  <a-button type="text" aria-label="模型设置" @click="editModel(model)"><SettingOutlined /></a-button>
                </a-tooltip>
                <a-tooltip title="删除">
                  <a-button type="text" danger aria-label="删除模型" @click="removeModel(model.key)"><DeleteOutlined /></a-button>
                </a-tooltip>
              </div>
            </div>
          </div>
          <a-pagination
            v-if="filteredModels.length > modelPageSize"
            v-model:current="modelPage"
            class="model-pagination"
            size="small"
            :total="filteredModels.length"
            :page-size="modelPageSize"
            :show-size-changer="false"
            show-less-items
          />

          <div class="provider-danger">
            <a-button danger type="text" @click="removeProvider(selectedProvider.id)">删除该供应商</a-button>
          </div>
        </div>
        <div v-else class="provider-editor provider-editor-empty">先在左侧添加一个供应商。</div>
      </div>
    </section>

    <a-modal
      v-model:open="modelEditorOpen"
      :title="modelEditorTitle"
      width="560px"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveModel"
    >
      <div class="model-editor">
        <div class="field-row">
          <label class="field-label">模型代号</label>
          <a-input v-model:value="modelDraft.id" placeholder="如 deepseek-chat" />
        </div>
        <div class="field-row">
          <label class="field-label">名称</label>
          <a-input v-model:value="modelDraft.label" placeholder="可选" />
        </div>
        <div class="field-row">
          <label class="field-label">上下文窗口</label>
          <a-input-number v-model:value="modelDraft.contextWindow" class="model-context-input" :min="4096" :max="2000000" :step="32000" />
        </div>
        <div class="model-switches">
          <span class="model-field">
            <label>流式传输</label>
            <a-switch v-model:checked="modelDraft.streaming" size="small" />
          </span>
          <span class="model-field">
            <a-tooltip title="允许向模型发送截图等图片">
              <label class="vision-label">视觉</label>
            </a-tooltip>
            <a-switch v-model:checked="modelDraft.vision" size="small" />
          </span>
          <span class="model-field">
            <label>思考</label>
            <a-switch v-model:checked="modelDraft.thinking" size="small" />
          </span>
          <span class="model-field">
            <label>思考等级</label>
            <a-select v-model:value="modelDraft.thinkingLevel" :disabled="!modelDraft.thinking" size="small" class="level-select" :options="thinkingLevelOptions" />
          </span>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:open="importOpen"
      title="导入模型"
      width="960px"
      :confirm-loading="importConfirmLoading"
      :ok-button-props="{ disabled: importLoading || importMatching }"
      ok-text="确认导入"
      cancel-text="取消"
      @ok="confirmImport"
    >
      <div class="import-summary">
        <a-alert
          type="info"
          show-icon
          :message="importMatching ? '正在重新匹配…' : `匹配成功 ${importMatchedCount} 个，匹配失败 ${importFailedCount} 个`"
        />
        <a-tooltip title="按“/”后的模型名匹配元数据">
          <span class="import-option">
            <span>模型组兼容</span>
            <a-switch
              :checked="modelGroupCompat"
              size="small"
              :loading="importMatching"
              :disabled="importLoading || importMatching"
              aria-label="模型组兼容"
              @change="(value: string | number | boolean) => refreshImportMatches(value === true)"
            />
            <a-button type="link" size="small" :disabled="importLoading || importMatching" @click="refreshImportMatches()">重新匹配</a-button>
          </span>
        </a-tooltip>
      </div>
      <a-table
        class="import-table"
        row-key="key"
        :data-source="importRows"
        :loading="importLoading || importMatching"
        :pagination="{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showQuickJumper: true, showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total}` }"
        :row-class-name="(row: AiModelImportRow & { key: string; selected: boolean }) => row.matched ? '' : 'import-row-failed'"
      >
        <a-table-column key="selected" title="导入" :width="64">
          <template #default="{ record }">
            <a-checkbox v-model:checked="record.selected" :disabled="record.existing" />
          </template>
        </a-table-column>
        <a-table-column key="id" title="模型 ID" :width="220">
          <template #default="{ record }">
            <a-input v-model:value="record.id" size="small" @change="updateImportRow(record)" />
          </template>
        </a-table-column>
        <a-table-column key="label" title="名称" :width="180">
          <template #default="{ record }">
            <a-input v-model:value="record.label" size="small" />
          </template>
        </a-table-column>
        <a-table-column key="contextWindow" title="上下文" :width="120">
          <template #default="{ record }">
            <a-input-number v-model:value="record.contextWindow" size="small" :min="4096" :max="2000000" @change="updateImportRow(record)" />
          </template>
        </a-table-column>
        <a-table-column key="capabilities" title="能力">
          <template #default="{ record }">
            <span class="import-capabilities">
              <a-tooltip v-if="record.vision" title="支持视觉输入">
                <EyeOutlined aria-label="支持视觉输入" />
              </a-tooltip>
              <a-tooltip v-if="record.thinking" :title="`支持思考，等级：${thinkingLevelLabel(record.thinkingLevel)}`">
                <BulbOutlined aria-label="支持思考" />
              </a-tooltip>
            </span>
            <span v-if="record.existing" class="import-note">已有</span>
            <span v-if="!record.matched" class="import-failure">{{ record.failureReason || '需检查' }}</span>
          </template>
        </a-table-column>
        <a-table-column key="actions" title="" :width="52">
          <template #default="{ record }">
            <a-button type="text" danger aria-label="删除导入项" @click="deleteImportRow(record.key)"><DeleteOutlined /></a-button>
          </template>
        </a-table-column>
      </a-table>
    </a-modal>

    <section class="settings-block">
      <div class="block-heading">搜索供应商</div>
      <SearchProviderSettings v-model:active-provider-id="activeSearchProviderId" :providers="draftSearchProviders" />
    </section>

    <section class="settings-block">
      <div class="block-heading">记忆</div>
      <MemorySettings :active="props.active" />
    </section>

    <section class="settings-block">
      <div class="block-heading">教学</div>
      <div class="teaching-toggle">
        <div class="teaching-toggle-text">
          <div class="teaching-toggle-title">苏格拉底模式</div>
          <p class="teaching-toggle-desc">开启后 EOQ 以提问引导思考，不直接给出答案。</p>
        </div>
        <a-switch
          :checked="store.settings.socraticEnabled"
          :loading="socraticBusy"
          :disabled="settingsLocked"
          aria-label="苏格拉底模式开关"
          @change="(value: string | number | boolean) => toggleSocratic(value === true)"
        />
      </div>
    </section>

    <div class="ai-footer">
      <a-button @click="settingsWindow.close()">取消</a-button>
      <a-button type="primary" :disabled="settingsLocked" @click="handleSave">保存设置</a-button>
    </div>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.section-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.settings-block{padding:16px 0;margin-top:16px;border-bottom:1px solid rgba(5,5,5,0.06)}
.settings-block:last-of-type{border-bottom:none}
.block-heading{color:rgba(0,0,0,0.65);font-size:12px;line-height:20px;margin-bottom:8px}
.full-select{width:100%}
.read-failure-alert{margin-top:12px}
.default-hint{margin-top:4px;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.provider-columns{display:flex;gap:16px;min-height:320px}
.provider-rail{width:168px;display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.provider-item{display:flex;align-items:center;gap:4px;min-height:36px;padding:4px 8px;border-radius:6px;cursor:pointer;color:rgba(0,0,0,0.88);font-size:14px}
.provider-item.selected{background:rgba(22,119,255,.06)}
.provider-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.provider-item-tag{margin-inline-end:0;transform:scale(.83)}
.provider-editor{flex:1;min-width:0}
.provider-editor-empty{color:rgba(0,0,0,0.45);font-size:14px;display:flex;align-items:center}
.field-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.field-label{width:64px;flex-shrink:0;color:rgba(0,0,0,0.65);font-size:13px}
.key-row{display:flex;flex:1;gap:8px}
.models-heading{color:rgba(0,0,0,0.65);font-size:12px;margin:4px 0 8px}
.models-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.model-search{flex:1;min-width:0}
.models-actions{display:flex;flex-shrink:0;gap:8px}
.models-empty{color:rgba(0,0,0,0.45);font-size:13px;padding:8px 0}
.model-list{border-top:1px solid rgba(5,5,5,0.06)}
.model-list-row{display:flex;align-items:center;gap:16px;padding:10px 4px;border-bottom:1px solid rgba(5,5,5,0.06);cursor:pointer;transition:background-color 0.1s ease-out}
.model-list-row:hover{background:rgba(0,0,0,0.02)}
.model-list-row:focus-visible{outline:2px solid #1677ff;outline-offset:-2px}
.model-text{flex:1;min-width:0}
.model-name{overflow:hidden;color:rgba(0,0,0,.88);font-size:14px;line-height:22px;text-overflow:ellipsis;white-space:nowrap}
.model-code{margin-top:2px;overflow:hidden;color:rgba(0,0,0,.45);font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.model-list-row.disabled .model-name{color:rgba(0,0,0,.45)}
.model-actions{display:flex;flex-shrink:0;align-items:center;gap:4px}
.model-actions :deep(.ant-btn){width:32px;height:32px;padding:0}
.model-pagination{display:flex;justify-content:flex-end;margin-top:12px}
.model-field{display:flex;align-items:center;gap:8px}
.model-field>label{color:rgba(0,0,0,0.65);font-size:12px;white-space:nowrap}
.vision-label{cursor:help;text-decoration:underline dotted rgba(0,0,0,.35);text-underline-offset:3px}
.model-switches{display:flex;flex-wrap:wrap;gap:12px 16px;padding-top:4px}
.model-context-input{width:100%}
.model-editor .field-row{margin-bottom:16px}
.model-editor .field-label{width:80px}
.level-select{width:76px}
.provider-danger{margin-top:8px;display:flex;justify-content:flex-end}
.import-summary{display:flex;align-items:flex-start;gap:16px}
.import-summary :deep(.ant-alert){flex:1;min-width:0}
.import-option{display:inline-flex;flex-shrink:0;align-items:center;gap:8px;padding-top:6px;color:rgba(0,0,0,.65);font-size:12px}
.import-table{margin-top:16px}
.import-row-failed>td{background:rgba(255,77,79,.06)!important}
.import-failure{margin-left:8px;color:#cf1322}
.import-note{margin-left:8px;color:rgba(0,0,0,.45)}
.import-capabilities{display:inline-flex;align-items:center;gap:8px;color:rgba(0,0,0,.65)}
.teaching-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.teaching-toggle-text{flex:1}
.teaching-toggle-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.teaching-toggle-desc{margin-top:4px;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.ai-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(5,5,5,0.06)}
</style>
