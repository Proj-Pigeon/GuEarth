<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Empty, message } from 'ant-design-vue'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useOnlineDataStore } from '@renderer/stores/onlineData'
import { normalizeQWeatherHost, validateQWeatherApiKey, type LaboratoryProvider, type LaboratoryProviderInput } from '../../../../common/onlineData'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ busyChange: [busy: boolean] }>()
const providers = ref<LaboratoryProvider[]>([])
const loaded = ref(false)
const operation = ref<'load' | 'save' | 'remove' | null>(null)
const busy = computed(() => operation.value !== null)
const provider = computed(() => providers.value.find((item) => item.provider === 'qweather'))
const onlineData = useOnlineDataStore()
const providerIssue = computed(() => {
  if (!provider.value?.configured) return '凭据不可用，请重新配置'
  return onlineData.snapshot?.typhoonError || ''
})
const loadError = ref('')
const operationError = ref('')
const editorOpen = ref(false)
const removeOpen = ref(false)
const editing = ref(false)
const keyRequired = computed(() => !editing.value || !provider.value?.configured)
const draft = reactive({ category: 'weather' as const, provider: 'qweather' as const, apiHost: '', apiKey: '' })
const hostError = ref('')
const keyError = ref('')
const dataNotice = '配置保存后立即生效，在首次使用对应功能时获取数据，无需重启'
const actionsDisabled = computed(() => busy.value || editorOpen.value || removeOpen.value)

function clearDraft(): void {
  draft.apiHost = ''
  draft.apiKey = ''
  hostError.value = ''
  keyError.value = ''
  operationError.value = ''
}

async function loadProviders(): Promise<void> {
  if (actionsDisabled.value) return
  operation.value = 'load'
  loadError.value = ''
  try {
    providers.value = await window.guEarth.laboratory.listProviders()
    loaded.value = true
  } catch {
    loadError.value = '提供商列表加载失败，请重试。'
  } finally {
    operation.value = null
  }
}

function openEditor(edit: boolean): void {
  if (actionsDisabled.value || !loaded.value || (edit ? !provider.value : provider.value)) return
  clearDraft()
  editing.value = edit
  draft.apiHost = edit ? provider.value?.apiHost ?? '' : ''
  editorOpen.value = true
}

function closeDialogs(): void {
  if (busy.value) return
  editorOpen.value = false
  removeOpen.value = false
  clearDraft()
}

async function saveProvider(): Promise<void> {
  if (busy.value || !editorOpen.value || (!editing.value && provider.value)) return
  hostError.value = ''
  keyError.value = ''
  const rawKey = draft.apiKey.trim()
  let apiKey = ''
  if (!rawKey) {
    keyError.value = keyRequired.value ? '请输入 API Key' : ''
  } else {
    try {
      apiKey = validateQWeatherApiKey(rawKey)
    } catch (error) {
      keyError.value = error instanceof Error ? error.message : '请输入有效的 API Key'
    }
  }
  let apiHost = ''
  try {
    apiHost = normalizeQWeatherHost(draft.apiHost)
  } catch (error) {
    hostError.value = error instanceof Error ? error.message : '请输入有效的和风天气 API Host'
  }
  if (hostError.value || keyError.value) return
  const input: LaboratoryProviderInput = { category: draft.category, provider: draft.provider, apiHost }
  if (apiKey) input.apiKey = apiKey
  operation.value = 'save'
  operationError.value = ''
  try {
    providers.value = await window.guEarth.laboratory.saveProvider(input)
    editorOpen.value = false
    clearDraft()
    message.success('提供商配置已保存，使用时自动获取数据')
  } catch {
    operationError.value = '保存失败，请检查配置及系统安全存储后重试。'
  } finally {
    operation.value = null
  }
}

function confirmRemove(): void {
  if (actionsDisabled.value || !provider.value) return
  operationError.value = ''
  removeOpen.value = true
}

async function removeProvider(): Promise<void> {
  if (busy.value || !removeOpen.value || !provider.value) return
  operation.value = 'remove'
  operationError.value = ''
  try {
    providers.value = await window.guEarth.laboratory.removeProvider('qweather')
    removeOpen.value = false
    clearDraft()
    message.success('提供商配置已移除')
  } catch {
    operationError.value = '移除失败，配置尚未确认移除，请重试。'
  } finally {
    operation.value = null
  }
}

watch(() => props.active, (active) => {
  if (active && !loaded.value) void loadProviders()
  if (!active) closeDialogs()
}, { immediate: true })
watch(operation, (value) => emit('busyChange', value === 'save' || value === 'remove'), { flush: 'sync' })
onBeforeUnmount(() => { clearDraft(); emit('busyChange', false) })
</script>

<template>
  <section class="settings-section" aria-label="实验室设置">
    <h3 class="section-title">实验室</h3>
    <p class="section-desc">体验咕咕地球最新试验性功能</p>
    <a-alert class="notice" type="info" show-icon :message="dataNotice" />
    <section class="settings-block" aria-label="数据源">
      <h4 class="block-heading">数据源</h4>
      <p class="data-description">管理外部数据提供商，已配置的数据源将在应用启动时自动更新。</p>
      <a-card title="提供商列表" size="small">
        <template #extra>
          <a-tooltip title="添加提供商">
            <a-button type="text" :disabled="actionsDisabled || !loaded || !!loadError || !!provider" aria-label="添加提供商" @click="openEditor(false)">
              <template #icon><PlusOutlined /></template>
            </a-button>
          </a-tooltip>
        </template>
        <a-spin v-if="operation === 'load'" class="loading" tip="正在加载提供商列表…"><div class="loading-space" /></a-spin>
        <a-alert v-else-if="loadError" type="error" show-icon :message="loadError">
          <template #action><a-button :disabled="actionsDisabled" @click="loadProviders">重试</a-button></template>
        </a-alert>
        <div v-else-if="provider" class="provider-row">
          <div class="provider-info">
            <a-space :size="8" wrap>
              <a-typography-text strong>和风天气</a-typography-text>
              <a-tag>天气信息</a-tag>
              <a-tooltip :title="providerIssue || '配置正常'">
                <a-badge :status="providerIssue ? 'error' : 'success'" :text="providerIssue || undefined" :aria-label="providerIssue || '配置正常'" />
              </a-tooltip>
            </a-space>
            <p class="provider-host">API Host：{{ provider.apiHost }}</p>
          </div>
          <div class="provider-actions">
            <a-tooltip title="编辑提供商">
              <a-button type="text" :disabled="actionsDisabled" aria-label="编辑提供商" @click="openEditor(true)">
                <template #icon><EditOutlined /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="删除提供商">
              <a-button type="text" danger :disabled="actionsDisabled" aria-label="删除提供商" @click="confirmRemove">
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </a-tooltip>
          </div>
        </div>
        <a-empty v-else-if="loaded" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="尚未添加数据源提供商，请使用右上角“添加提供商”。" />
      </a-card>
    </section>
    <a-modal :open="editorOpen" :title="editing ? '编辑提供商' : '添加提供商'" :width="480" :ok-text="operationError ? '重试保存' : '保存'" cancel-text="取消" :confirm-loading="operation === 'save'" :ok-button-props="{ disabled: busy }" :cancel-button-props="{ disabled: busy }" :closable="!busy" :keyboard="!busy" :mask-closable="false" destroy-on-close @ok="saveProvider" @cancel="closeDialogs">
      <a-form layout="vertical" :model="draft" :disabled="busy">
        <a-form-item label="数据源分类" name="category" required>
          <a-select v-model:value="draft.category" :options="[{ value: 'weather', label: '天气信息' }]" />
        </a-form-item>
        <a-form-item label="提供商" name="provider" required>
          <a-select v-model:value="draft.provider" :options="[{ value: 'qweather', label: '和风天气' }]" />
        </a-form-item>
        <a-form-item label="API Host" name="apiHost" required :validate-status="hostError ? 'error' : undefined" :help="hostError || undefined" extra="请从提供商控制台复制 API Host，不含接口路径或端口。">
          <a-input v-model:value="draft.apiHost" placeholder="粘贴控制台提供的 API Host" autocomplete="off" @change="hostError = ''" @press-enter="saveProvider" />
        </a-form-item>
        <a-form-item label="API Key" name="apiKey" :required="keyRequired" :validate-status="keyError ? 'error' : undefined" :help="keyError || undefined" :extra="keyRequired ? '请填写提供商 API Key，保存后不显示密钥。' : '已保存密钥不会显示；留空保留原密钥，填写则替换。'">
          <a-input-password v-model:value="draft.apiKey" :placeholder="keyRequired ? '输入 API Key' : '留空保留原密钥'" autocomplete="new-password" @change="keyError = ''" @press-enter="saveProvider" />
        </a-form-item>
      </a-form>
      <a-alert v-if="operationError" class="form-error" type="error" show-icon :message="operationError" />
      <a-alert type="info" show-icon :message="dataNotice" />
    </a-modal>
    <a-modal :open="removeOpen" title="移除和风天气提供商？" :width="480" :ok-text="operationError ? '重试移除' : '移除'" cancel-text="取消" :confirm-loading="operation === 'remove'" :ok-button-props="{ danger: true, disabled: busy }" :cancel-button-props="{ disabled: busy }" :closable="!busy" :keyboard="!busy" :mask-closable="false" @ok="removeProvider" @cancel="closeDialogs">
      <p>将移除该提供商配置及其 API Key，并立即停止使用其在线数据。</p>
      <a-alert v-if="operationError" class="form-error" type="error" show-icon :message="operationError" />
    </a-modal>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.section-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.notice,.settings-block{margin-top:24px}
.block-heading{margin:0 0 8px;color:rgba(0,0,0,0.88);font-size:16px;font-weight:600;line-height:24px}
.data-description{margin:0 0 16px;color:rgba(0,0,0,0.65);font-size:14px;line-height:22px}
.provider-row{display:flex;align-items:center;gap:16px}
.provider-info{flex:1;min-width:0}
.provider-host{margin:4px 0 0;color:rgba(0,0,0,0.65);font-size:13px;line-height:20px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;overflow-wrap:anywhere}
.provider-actions{display:flex;flex-shrink:0;gap:4px}
.loading{width:100%}
.loading-space{min-height:96px}
.form-error{margin-bottom:16px}
</style>
