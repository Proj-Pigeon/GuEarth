<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons-vue'
import type { AiSearchProviderConfig, ProviderCredentialStatus } from '../../../preload'

const props = defineProps<{ providers: AiSearchProviderConfig[]; activeProviderId: string }>()
const emit = defineEmits<{ 'update:activeProviderId': [id: string] }>()
const selected = computed(() => props.providers.find((provider) => provider.id === props.activeProviderId) ?? props.providers[0])
const credential = ref<ProviderCredentialStatus>({ configured: false, updatedAt: null })
const apiKeyDraft = ref('')
const loading = ref(false)
const saving = ref(false)
const clearing = ref(false)
const error = ref('')

async function refreshCredential(): Promise<void> {
  const providerId = selected.value?.id
  if (!providerId) return
  loading.value = true
  error.value = ''
  try {
    const status = await window.guEarth.settings.hasProviderApiKey(`ai-search-${providerId}`)
    if (selected.value?.id === providerId) credential.value = status
  } catch {
    if (selected.value?.id === providerId) error.value = '无法读取搜索密钥状态，请重试'
  } finally {
    if (selected.value?.id === providerId) loading.value = false
  }
}

watch(() => selected.value?.id, () => {
  apiKeyDraft.value = ''
  credential.value = { configured: false, updatedAt: null }
  void refreshCredential()
}, { immediate: true })

async function saveKey(): Promise<void> {
  const providerId = selected.value?.id
  const key = apiKeyDraft.value.trim()
  if (!providerId || !key || saving.value || clearing.value) return
  saving.value = true
  error.value = ''
  try {
    const status = await window.guEarth.settings.setProviderApiKey(`ai-search-${providerId}`, key)
    if (selected.value?.id === providerId) {
      credential.value = status
      apiKeyDraft.value = ''
    }
    message.success('搜索 API Key 已保存')
  } catch {
    error.value = '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

async function clearKey(): Promise<void> {
  const providerId = selected.value?.id
  if (!providerId || saving.value || clearing.value) return
  clearing.value = true
  error.value = ''
  try {
    const status = await window.guEarth.settings.clearProviderApiKey(`ai-search-${providerId}`)
    if (selected.value?.id === providerId) {
      credential.value = status
      apiKeyDraft.value = ''
    }
    message.success('搜索 API Key 已清除')
  } catch {
    error.value = '搜索密钥清除失败，请重试'
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <section class="search-settings">
    <a-select
      v-if="providers.length > 1"
      :value="activeProviderId"
      :options="providers.map((provider) => ({ value: provider.id, label: provider.name }))"
      :disabled="loading || saving || clearing"
      aria-label="默认搜索供应商"
      class="search-provider-select"
      @change="(value: string) => emit('update:activeProviderId', value)"
    />
    <a-card v-if="selected" :title="selected.name" size="small">
      <template #extra>
        <a-tag v-if="!loading && !error" :color="credential.configured ? 'success' : 'default'">{{ credential.configured ? '已配置' : '未配置' }}</a-tag>
      </template>
      <a-spin :spinning="loading">
        <a-form layout="vertical">
          <a-form-item label="AppBuilder API Key" :html-for="`search-key-${selected.id}`">
            <a-input-password
              :id="`search-key-${selected.id}`"
              v-model:value="apiKeyDraft"
              :maxlength="4096"
              :disabled="saving || clearing"
              autocomplete="off"
              placeholder="输入 AppBuilder API Key"
              @press-enter="saveKey"
            />
          </a-form-item>
        </a-form>
        <div class="search-key-actions">
          <a-button :loading="saving" :disabled="!apiKeyDraft.trim() || clearing || loading" @click="saveKey"><SaveOutlined />保存密钥</a-button>
          <a-button :loading="clearing" :disabled="!credential.configured || saving || loading" @click="clearKey"><DeleteOutlined />清除密钥</a-button>
        </div>
      </a-spin>
    </a-card>
    <a-alert v-if="error" type="error" show-icon :message="error">
      <template #action><a-button :disabled="saving || clearing" @click="refreshCredential">刷新状态</a-button></template>
    </a-alert>
    <a-empty v-if="!selected" description="暂无可用搜索服务" />
  </section>
</template>

<style scoped>
.search-settings{display:flex;flex-direction:column;gap:16px;padding-bottom:16px}
.search-provider-select{width:100%}
.search-description{margin:0 0 16px;color:rgba(0,0,0,.65);font-size:14px;line-height:22px}
.search-key-actions{display:flex;flex-wrap:wrap;gap:8px}
.search-hint{margin:12px 0 0;color:rgba(0,0,0,.65);font-size:12px;line-height:20px}
.search-endpoint{display:block;margin-top:8px;overflow-wrap:anywhere}
.search-endpoint :deep(code){white-space:normal;word-break:break-all}
</style>
