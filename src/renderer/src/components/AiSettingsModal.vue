<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons-vue'
import type { AiModelConfig, AiProviderConfig, AiSearchProviderConfig, AiSettings, AiThinkingLevel, ProviderCredentialStatus } from '../../../preload'
import { useAiStore } from '@renderer/stores/ai'
import SearchProviderSettings from './SearchProviderSettings.vue'
import MemorySettings from './MemorySettings.vue'

interface ProviderDraft extends AiProviderConfig {
  key: string
  models: ModelDraft[]
}

interface ModelDraft extends AiModelConfig {
  key: string
}

const store = useAiStore()
const visible = computed({
  get: () => store.isSettingsOpen,
  set: (value: boolean) => store.setSettingsOpen(value)
})

const draftProviders = ref<ProviderDraft[]>([])
const activeChoice = ref('')
const credentialStatuses = ref<Record<string, ProviderCredentialStatus>>({})
const selectedProviderId = ref('')
const apiKeyDraft = ref('')
const activeTab = ref('llm')
const draftSearchProviders = ref<AiSearchProviderConfig[]>([])
const activeSearchProviderId = ref('')
const draftSocraticEnabled = ref(false)

const baseUrlPlaceholder = computed(() => (selectedProvider.value?.protocol ?? 'openai') === 'anthropic'
  ? 'https://api.anthropic.com'
  : 'https://api.deepseek.com 或 https://api.openai.com')

const selectedProvider = computed(() => draftProviders.value.find((provider) => provider.id === selectedProviderId.value))

const thinkingLevelOptions: { value: AiThinkingLevel; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

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

watch(visible, async (open) => {
  apiKeyDraft.value = ''
  if (!open) return
  await store.hydrate()
  if (!visible.value) return
  activeTab.value = 'llm'
  draftProviders.value = store.settings.providers.map(toProviderDraft)
  draftSearchProviders.value = store.settings.searchProviders.map((provider) => ({ ...provider }))
  activeSearchProviderId.value = store.settings.activeSearchProviderId
  draftSocraticEnabled.value = store.settings.socraticEnabled
  activeChoice.value = store.settings.activeProviderId && store.settings.activeModelId
    ? `${store.settings.activeProviderId}:${store.settings.activeModelId}`
    : ''
  selectedProviderId.value = store.settings.activeProviderId || draftProviders.value[0]?.id || ''
  apiKeyDraft.value = ''
  void refreshCredentialStatuses()
})

watch(selectedProviderId, () => {
  apiKeyDraft.value = ''
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
  draftProviders.value = draftProviders.value.filter((provider) => provider.id !== providerId)
  if (selectedProviderId.value === providerId) selectedProviderId.value = draftProviders.value[0]?.id ?? ''
  if (activeChoice.value.startsWith(`${providerId}:`)) activeChoice.value = ''
}

function addModel(): void {
  const provider = selectedProvider.value
  if (!provider) return
  provider.models.push({
    key: makeKey(),
    id: '',
    label: '',
    contextWindow: 128000,
    streaming: true,
    vision: false,
    thinking: false,
    thinkingLevel: 'medium'
  })
}

function removeModel(modelKey: string): void {
  const provider = selectedProvider.value
  if (!provider) return
  provider.models = provider.models.filter((model) => model.key !== modelKey)
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
    message.error('密钥清除失败')
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
  const problem = validate()
  if (problem) {
    activeTab.value = 'llm'
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
          thinkingLevel: model.thinkingLevel
        }))
    })),
    activeProviderId,
    activeModelId,
    searchProviders: draftSearchProviders.value.map((provider) => ({ ...provider })),
    activeSearchProviderId: activeSearchProviderId.value,
    skipDeleteConversationConfirm: store.settings.skipDeleteConversationConfirm,
    memoryEnabled: store.settings.memoryEnabled,
    socraticEnabled: draftSocraticEnabled.value
  }
  try {
    await store.saveSettings(next)
    message.success('AI 设置已保存')
    visible.value = false
  } catch {
    message.error('设置保存失败')
  }
}
</script>

<template>
  <a-modal
    v-model:open="visible"
    title="AI 设置"
    :width="760"
    :footer="null"
    :body-style="{ paddingTop: '12px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }"
  >
    <a-tabs v-model:active-key="activeTab">
    <a-tab-pane key="llm" tab="LLM 供应商">
    <section class="section">
      <div class="section-heading">默认模型</div>
      <a-select
        v-model:value="activeChoice"
        class="full-select"
        placeholder="选择供应商与模型"
        allow-clear
      >
        <a-select-opt-group v-for="provider in draftProviders" :key="provider.id" :label="provider.name">
          <a-select-option v-for="model in provider.models" :key="`${provider.id}:${model.id}`" :value="`${provider.id}:${model.id}`">
            {{ model.label || model.id }}
          </a-select-option>
        </a-select-opt-group>
      </a-select>
      <div class="default-hint">发送提问时将使用该模型。</div>
    </section>

    <section class="section provider-layout" data-guide-target="ai-provider-settings">
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
          <span>模型列表（{{ selectedProvider.models.length }}）</span>
          <a-button size="small" type="dashed" @click="addModel"><PlusOutlined />添加模型</a-button>
        </div>
        <div v-if="selectedProvider.models.length === 0" class="models-empty">尚未添加模型，点击“添加模型”开始。</div>
        <div v-for="model in selectedProvider.models" :key="model.key" class="model-card">
          <div class="model-row">
            <a-input v-model:value="model.id" placeholder="模型 ID，如 deepseek-chat / qwen3-max / claude-sonnet-4-5" class="model-id-input" />
            <a-input v-model:value="model.label" placeholder="显示名（可选）" class="model-label-input" />
            <a-button type="text" danger aria-label="删除模型" @click="removeModel(model.key)"><DeleteOutlined /></a-button>
          </div>
          <div class="model-row model-row-secondary">
            <span class="model-field">
              <label>上下文窗口</label>
              <a-input-number v-model:value="model.contextWindow" :min="4096" :max="2000000" :step="32000" :formatter="(value: number) => `${value}`" />
            </span>
            <span class="model-field">
              <label>流式传输</label>
              <a-switch v-model:checked="model.streaming" size="small" />
            </span>
            <span class="model-field">
              <a-tooltip title="开启后允许向该模型发送地球截图等图片内容；模型不支持图像输入时请保持关闭，截图将以文字描述视角代替">
                <label class="vision-label">视觉</label>
              </a-tooltip>
              <a-switch v-model:checked="model.vision" size="small" />
            </span>
            <span class="model-field">
              <label>思考</label>
              <a-switch v-model:checked="model.thinking" size="small" />
            </span>
            <span class="model-field">
              <label>思考等级</label>
              <a-select v-model:value="model.thinkingLevel" :disabled="!model.thinking" size="small" class="level-select" :options="thinkingLevelOptions" />
            </span>
          </div>
        </div>

        <div class="provider-danger">
          <a-button danger type="text" @click="removeProvider(selectedProvider.id)">删除该供应商</a-button>
        </div>
      </div>
      <div v-else class="provider-editor provider-editor-empty">先在左侧添加一个供应商。</div>
    </section>

    </a-tab-pane>
    <a-tab-pane key="search" tab="搜索供应商">
      <SearchProviderSettings v-if="visible" v-model:active-provider-id="activeSearchProviderId" :providers="draftSearchProviders" />
    </a-tab-pane>
    <a-tab-pane key="memory" tab="记忆">
      <MemorySettings v-if="visible" :active="activeTab === 'memory'" />
    </a-tab-pane>
    <a-tab-pane key="teaching" tab="教学">
      <section class="section">
        <div class="teaching-toggle">
          <div class="teaching-toggle-text">
            <div class="teaching-toggle-title">苏格拉底模式</div>
            <p class="teaching-toggle-desc">开启后 EOQ 以提问引导思考，不直接给出答案。</p>
          </div>
          <a-switch
            v-model:checked="draftSocraticEnabled"
            aria-label="苏格拉底模式开关"
          />
        </div>
      </section>
    </a-tab-pane>
    </a-tabs>
    <div class="modal-footer">
      <a-button @click="visible = false">取消</a-button>
      <a-button type="primary" @click="handleSave">保存设置</a-button>
    </div>
  </a-modal>
</template>

<style scoped>
.section{margin-bottom:16px}
.section-heading{color:rgba(0,0,0,.65);font-size:12px;line-height:20px;margin-bottom:8px}
.full-select{width:100%}
.default-hint{margin-top:4px;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.provider-layout{display:flex;gap:16px;min-height:320px}
.provider-rail{width:168px;display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.provider-item{display:flex;align-items:center;gap:4px;min-height:36px;padding:4px 8px;border-radius:6px;cursor:pointer;color:rgba(0,0,0,.88);font-size:14px}
.provider-item.selected{background:rgba(22,119,255,.06)}
.provider-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.provider-item-tag{margin-inline-end:0;transform:scale(.83)}
.provider-editor{flex:1;min-width:0}
.provider-editor-empty{color:rgba(0,0,0,.45);font-size:14px;display:flex;align-items:center}
.field-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.field-label{width:64px;flex-shrink:0;color:rgba(0,0,0,.65);font-size:13px}
.key-row{display:flex;flex:1;gap:8px}
.models-heading{display:flex;align-items:center;justify-content:space-between;color:rgba(0,0,0,.65);font-size:12px;margin:4px 0 8px}
.models-empty{color:rgba(0,0,0,.45);font-size:13px;padding:8px 0}
.model-card{border:1px solid rgba(5,5,5,.06);border-radius:8px;padding:12px;margin-bottom:8px}
.model-row{display:flex;align-items:center;gap:8px}
.model-row-secondary{margin-top:8px;gap:12px 16px;flex-wrap:wrap}
.model-id-input{flex:1.4}
.model-label-input{flex:1}
.model-field{display:flex;align-items:center;gap:8px}
.model-field>label{color:rgba(0,0,0,.65);font-size:12px;white-space:nowrap}
.vision-label{cursor:help;text-decoration:underline dotted rgba(0,0,0,.35);text-underline-offset:3px}
.model-field :deep(.ant-input-number){width:104px}
.level-select{width:76px}
.provider-danger{margin-top:8px;display:flex;justify-content:flex-end}
.modal-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid rgba(5,5,5,.06)}
.teaching-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.teaching-toggle-text{flex:1}
.teaching-toggle-title{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}
.teaching-toggle-desc{margin-top:4px;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
@media(max-width:640px){
  .provider-layout{flex-direction:column}
  .provider-rail{width:100%}
  .field-row{align-items:flex-start;flex-direction:column;gap:8px}
  .key-row{width:100%;flex-wrap:wrap}
  .key-row :deep(.ant-input-password){flex-basis:100%}
  .model-row{flex-wrap:wrap}
}
</style>
