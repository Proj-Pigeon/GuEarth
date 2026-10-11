<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CloseOutlined, DeleteOutlined, MoreOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { basemapCategories, providerCatalog, credentialOnlyProviders, terrainCatalog, type LayerMeta, type ProviderMeta } from '@renderer/stores/globe'
import { networkProxyMode, normalizeNetworkProxy, type NetworkProxyMode } from '../../../common/networkProxy'

interface CredentialStatus {
  configured: boolean
  updatedAt: number | null
}

interface BasemapOption {
  id: string
  name: string
  selected: boolean
  providers: ProviderMeta[]
  activeProviderId: string
  activeProviderName: string
  activeLayer?: LayerMeta
}

const props = defineProps<{
  open: boolean
  layers: LayerMeta[]
  selectedLayerId: string
  error: string
  terrainError: string
  terrainProviderId: string
  activeTerrainId: string
  terrainExaggeration: number
  terrainLighting: boolean
  tileCacheEnabled: boolean
  tileMirrorEnabled: boolean
  networkProxy: string
  providerCredentials: Record<string, CredentialStatus>
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
  opacity: [id: string, opacity: number]
  retry: []
  terrain: [id: string]
  terrainExaggeration: [value: number]
  terrainLighting: [value: boolean]
  cache: [value: boolean]
  mirror: [value: boolean]
  networkProxy: [value: string]
  credentialSave: [id: string, apiKey: string, securityKey?: string]
  credentialClear: [id: string]
}>()

const basemapOptions = computed<BasemapOption[]>(() => basemapCategories.map((category) => {
  const providers = category.providerIds
    .map((id) => providerCatalog.find((provider) => provider.id === id))
    .filter((provider): provider is ProviderMeta => Boolean(provider))
  const activeProviderId = providers.some((provider) => provider.id === props.selectedLayerId) ? props.selectedLayerId : providers[0]?.id ?? ''
  return {
    id: category.id,
    name: category.name,
    selected: category.providerIds.includes(props.selectedLayerId),
    providers,
    activeProviderId,
    activeProviderName: providers.find((provider) => provider.id === activeProviderId)?.name ?? '',
    activeLayer: props.layers.find((layer) => layer.id === activeProviderId)
  }
}))

const settingsCategoryId = ref('')
const activeTerrainName = computed(() => terrainCatalog.find((terrain) => terrain.id === props.activeTerrainId)?.name ?? '')
const terrainDegraded = computed(() => Boolean(props.activeTerrainId) && props.activeTerrainId !== props.terrainProviderId)
const settingsCategory = computed(() => basemapOptions.value.find((option) => option.id === settingsCategoryId.value))
const settingsOpacity = computed(() => Math.round((settingsCategory.value?.activeLayer?.opacity ?? 1) * 100))

function openSettings(id: string, event: Event): void {
  event.stopPropagation()
  settingsCategoryId.value = id
}

function closeSettings(): void {
  settingsCategoryId.value = ''
}

function handleSettingsProviderChange(event: { target: { value: string } }): void {
  emit('select', event.target.value)
}

function handleSettingsOpacity(value: number): void {
  const layer = settingsCategory.value?.activeLayer
  if (layer) emit('opacity', layer.id, value / 100)
}

const keyProviders = computed(() => [...providerCatalog, ...credentialOnlyProviders].filter((provider) => provider.requiresKey))
const credentialProviderId = ref('')
const credentialDraft = ref('')
const credentialSkDraft = ref('')

const selectedCredentialStatus = computed(() => props.providerCredentials[credentialProviderId.value])
const selectedSecurityCredentialStatus = computed(() => props.providerCredentials[`${credentialProviderId.value}-sk`])
const selectedProvider = computed(() => [...providerCatalog, ...credentialOnlyProviders].find((provider) => provider.id === credentialProviderId.value))
const supportsSecurityKey = computed(() => Boolean(selectedProvider.value?.requiresSk || selectedProvider.value?.requiresSecurityKey))
const requiresSecurityKey = computed(() => Boolean((selectedProvider.value?.requiresSecurityKey && !selectedProvider.value?.securityKeyOptional) || (selectedProvider.value?.requiresSk && !selectedProvider.value?.skOptional)))
const securityKeyPlaceholder = computed(() => selectedProvider.value?.requiresSecurityKey ? '输入签名私钥（可选）' : '输入 SK (签名密钥，可选)')

watch(keyProviders, (providers) => {
  if (!providers.some((provider) => provider.id === credentialProviderId.value)) credentialProviderId.value = providers[0]?.id ?? ''
}, { immediate: true })

watch(credentialProviderId, () => {
  credentialDraft.value = ''
  credentialSkDraft.value = ''
})

function saveCredential(): void {
  const value = credentialDraft.value.trim()
  const sk = credentialSkDraft.value.trim()
  if (!credentialProviderId.value || !value || (requiresSecurityKey.value && !sk)) return
  emit('credentialSave', credentialProviderId.value, value, sk || undefined)
  credentialDraft.value = ''
  credentialSkDraft.value = ''
}

function clearCredential(): void {
  if (!credentialProviderId.value) return
  emit('credentialClear', credentialProviderId.value)
  credentialDraft.value = ''
  credentialSkDraft.value = ''
}

const proxyPendingCustom = ref(false)
const proxyDraft = ref('')
const proxyTesting = ref(false)
const proxyTestResult = ref<{ ok: boolean; text: string } | null>(null)
const proxyMode = computed<NetworkProxyMode>(() => networkProxyMode(props.networkProxy))
const proxyModeView = computed<NetworkProxyMode>(() => (proxyPendingCustom.value || proxyMode.value === 'custom') ? 'custom' : proxyMode.value)
const normalizedProxyDraft = computed(() => normalizeNetworkProxy(proxyDraft.value))
const proxyApplyEnabled = computed(() => normalizedProxyDraft.value !== '' && normalizedProxyDraft.value !== props.networkProxy)

watch(() => props.networkProxy, (value) => {
  proxyDraft.value = networkProxyMode(value) === 'custom' ? value : ''
  proxyPendingCustom.value = false
  proxyTestResult.value = null
}, { immediate: true })

function handleProxyModeChange(event: { target: { value: NetworkProxyMode } }): void {
  const mode = event.target.value
  if (mode === 'custom') {
    proxyPendingCustom.value = true
    return
  }
  proxyPendingCustom.value = false
  emit('networkProxy', mode === 'system' ? '' : 'direct')
}

function applyProxy(): void {
  if (!proxyApplyEnabled.value) return
  emit('networkProxy', normalizedProxyDraft.value)
}

async function testProxy(): Promise<void> {
  if (proxyTesting.value) return
  if (proxyModeView.value === 'custom' && normalizedProxyDraft.value === '') {
    proxyTestResult.value = { ok: false, text: '请输入有效的代理地址' }
    return
  }
  const candidate = proxyModeView.value === 'custom' ? normalizedProxyDraft.value : props.networkProxy
  proxyTesting.value = true
  proxyTestResult.value = null
  try {
    const result = await window.guEarth.settings.testNetworkProxy(candidate)
    proxyTestResult.value = result.ok
      ? { ok: true, text: `连接正常 · ${result.elapsedMs} ms` }
      : { ok: false, text: `连接失败：${result.error || '未知错误'}` }
  } catch (error) {
    proxyTestResult.value = { ok: false, text: `连接失败：${error instanceof Error ? error.message : '未知错误'}` }
  } finally {
    proxyTesting.value = false
  }
}
</script>

<template>
  <a-drawer :open="open" placement="right" :width="360" :mask="false" :closable="false" :body-style="{ padding: '16px' }" @close="emit('close')">
    <template #title>
      <div class="panel-title">
        <h2>图层管理</h2>
        <a-button type="text" aria-label="关闭图层管理" @click="emit('close')"><CloseOutlined /></a-button>
      </div>
    </template>
    <a-alert v-if="error" type="error" show-icon :message="error" class="panel-alert">
      <template #action><a-button type="text" size="small" @click="emit('retry')"><ReloadOutlined />重试</a-button></template>
    </a-alert>
    <div class="layer-spin">
      <section class="panel-section">
        <div class="basemap-list">
          <div
            v-for="option in basemapOptions"
            :key="option.id"
            :class="['basemap-item', { selected: option.selected }]"
            @click="emit('select', option.activeProviderId)"
          >
            <a-radio :checked="option.selected" :aria-label="`选择${option.name}底图`" />
            <div class="basemap-copy">
              <div class="basemap-name">{{ option.name }}</div>
              <div class="basemap-description">{{ option.activeProviderName }}</div>
            </div>
            <a-tooltip :title="`${option.name}设置`">
              <a-button type="text" size="small" class="more-button" :aria-label="`${option.name}设置`" @click="openSettings(option.id, $event)"><MoreOutlined /></a-button>
            </a-tooltip>
          </div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-heading"><span>3D 地形</span></div>
        <a-select :value="terrainProviderId" class="full-select" @change="(value: string) => emit('terrain', value)">
          <a-select-option v-for="option in terrainCatalog" :key="option.id" :value="option.id" :title="option.description">{{ option.name }}</a-select-option>
        </a-select>
        <div v-if="terrainDegraded" class="terrain-active-hint">当前实际使用「{{ activeTerrainName }}」</div>
        <div class="terrain-slider-head"><span>垂直夸张</span><span>{{ terrainExaggeration }}×</span></div>
        <a-slider
          :value="terrainExaggeration"
          :min="1"
          :max="5"
          :step="0.5"
          :marks="{ 1: '1×', 3: '3×', 5: '5×' }"
          aria-label="地形垂直夸张倍数"
          @change="(value: number) => emit('terrainExaggeration', value)"
        />
        <div class="terrain-lighting-row"><span>太阳光照</span><a-switch size="small" :checked="terrainLighting" @change="(value: boolean) => emit('terrainLighting', value)" /></div>
        <a-alert v-if="terrainError" type="warning" :message="terrainError" show-icon class="terrain-alert" />
      </section>

      <section class="panel-section cache-row">
        <span>瓦片缓存</span><a-switch :checked="tileCacheEnabled" @change="(value: boolean) => emit('cache', value)" />
      </section>
      <section class="panel-section mirror-row">
        <div class="mirror-copy">
          <span class="mirror-name">高德镜像瓦片源</span>
          <p class="mirror-description">OSM / OpenTopoMap / ArcGIS 影像改用高德境内瓦片并纠偏回 WGS-84，适合原始源无法直连的国内网络环境；切换时会清空相关底图缓存并重载，海外区域影像最高约 12 级</p>
        </div>
        <a-switch size="small" :checked="tileMirrorEnabled" @change="(value: boolean) => emit('mirror', value)" />
      </section>

      <section class="panel-section">
        <div class="section-heading"><span>网络代理</span></div>
        <a-radio-group :value="proxyModeView" size="small" class="proxy-mode-group" @change="handleProxyModeChange">
          <a-radio-button value="system">跟随系统</a-radio-button>
          <a-radio-button value="direct">直连</a-radio-button>
          <a-radio-button value="custom">自定义</a-radio-button>
        </a-radio-group>
        <a-input v-if="proxyModeView === 'custom'" v-model:value="proxyDraft" size="small" placeholder="http://127.0.0.1:7890 或 socks5://…" class="proxy-input" @press-enter="testProxy" />
        <div class="proxy-actions">
          <a-button v-if="proxyModeView === 'custom'" type="primary" size="small" :disabled="!proxyApplyEnabled" @click="applyProxy">应用</a-button>
          <a-button size="small" :loading="proxyTesting" @click="testProxy">测试</a-button>
        </div>
        <div v-if="proxyTestResult" :class="['proxy-result', proxyTestResult.ok ? 'proxy-result-ok' : 'proxy-result-fail']">{{ proxyTestResult.text }}</div>
      </section>

      <section v-if="keyProviders.length" class="panel-section" data-guide-target="provider-credentials">
        <div class="section-heading"><span>供应商密钥</span><a-tag v-if="selectedCredentialStatus?.configured && (!requiresSecurityKey || selectedSecurityCredentialStatus?.configured)" color="green">已配置</a-tag></div>
        <a-select v-model:value="credentialProviderId" class="full-select"><a-select-option v-for="provider in keyProviders" :key="provider.id" :value="provider.id">{{ provider.name }}</a-select-option></a-select>
        <a-input v-model:value="credentialDraft" type="password" size="small" :placeholder="credentialProviderId === 'amap' ? '输入 Web 服务 API Key' : supportsSecurityKey ? '输入 AK (访问密钥)' : '输入 API Key'" class="key-input" @press-enter="saveCredential" />
        <a-input v-if="supportsSecurityKey" v-model:value="credentialSkDraft" type="password" size="small" :placeholder="securityKeyPlaceholder" class="key-input" @press-enter="saveCredential" />
        <a-alert v-if="supportsSecurityKey && !requiresSecurityKey" type="info" :message="credentialProviderId === 'amap' ? '仅在高德控制台开启数字签名时填写签名私钥' : '若使用签名鉴权，需填写有效签名密钥'" show-icon class="credential-hint" />
        <div class="key-actions">
          <a-button type="primary" size="small" :disabled="!credentialDraft.trim() || (requiresSecurityKey && !credentialSkDraft.trim())" @click="saveCredential"><SaveOutlined />保存</a-button>
          <a-button size="small" :disabled="!selectedCredentialStatus?.configured && !selectedSecurityCredentialStatus?.configured" @click="clearCredential"><DeleteOutlined />清除</a-button>
        </div>
      </section>
    </div>

    <a-modal
      :open="settingsCategory !== undefined"
      :title="settingsCategory ? `${settingsCategory.name}设置` : ''"
      :footer="null"
      :width="420"
      @cancel="closeSettings"
    >
      <template v-if="settingsCategory">
        <div class="modal-block">
          <div class="setting-head"><span>不透明度</span><span>{{ settingsOpacity }}%</span></div>
          <a-slider
            :value="settingsOpacity"
            :min="0"
            :max="100"
            :step="5"
            :aria-label="`${settingsCategory.name}不透明度`"
            @change="handleSettingsOpacity"
          />
        </div>
        <a-collapse class="advanced-collapse">
          <a-collapse-panel key="advanced" header="高级设置">
            <div class="setting-head"><span>供应商</span></div>
            <a-radio-group :value="settingsCategory.activeProviderId" class="provider-group" @change="handleSettingsProviderChange">
              <a-radio v-for="provider in settingsCategory.providers" :key="provider.id" :value="provider.id" class="provider-radio">
                <div class="provider-copy">
                  <div class="provider-name">{{ provider.name }}</div>
                  <div class="provider-description">{{ provider.description }}</div>
                </div>
              </a-radio>
            </a-radio-group>
          </a-collapse-panel>
        </a-collapse>
      </template>
    </a-modal>
  </a-drawer>
</template>

<style scoped>
.panel-title{display:flex;align-items:center;justify-content:space-between;width:100%}h2{margin:0;color:rgba(0,0,0,.88);font-size:20px;font-weight:600;line-height:28px}.panel-alert{margin-bottom:16px}.layer-spin{display:block;min-height:168px}.panel-section{padding:0 0 16px;margin:0 0 16px;border-bottom:1px solid rgba(5,5,5,.06)}.panel-section:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px;color:rgba(0,0,0,.65);font-size:12px;line-height:20px}.full-select{width:100%}.cache-row{display:flex;align-items:center;justify-content:space-between}.mirror-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mirror-copy{flex:1;min-width:0}.mirror-name{color:rgba(0,0,0,.88);font-size:13px;line-height:22px}.mirror-description{margin:2px 0 0;color:rgba(0,0,0,.45);font-size:12px;line-height:18px}.terrain-slider-head{display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:rgba(0,0,0,.65);font-size:13px;line-height:20px}.terrain-lighting-row{display:flex;align-items:center;justify-content:space-between;margin-top:4px;color:rgba(0,0,0,.65);font-size:13px;line-height:20px}.terrain-alert{margin-top:8px}.key-input{margin-top:8px}.credential-hint{margin-top:8px}.key-actions{display:flex;gap:8px;margin-top:8px}.basemap-item{display:flex;align-items:center;gap:4px;min-height:48px;padding:6px 8px;border-radius:6px;cursor:pointer}.basemap-item.selected{background:rgba(22,119,255,.06)}.basemap-copy{flex:1;min-width:0;margin-left:4px}.basemap-name{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}.basemap-description{overflow:hidden;color:rgba(0,0,0,.45);font-size:12px;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.more-button{color:rgba(0,0,0,.45)}.modal-block{margin-bottom:16px}.proxy-mode-group{display:flex;width:100%}.proxy-mode-group :deep(.ant-radio-button-wrapper){flex:1;text-align:center}.proxy-input{margin-top:8px}.proxy-actions{display:flex;gap:8px;margin-top:8px}.proxy-result{margin-top:8px;color:rgba(0,0,0,.65);font-size:12px;line-height:20px;word-break:break-all}.proxy-result-ok{color:#389e0d}.proxy-result-fail{color:#cf1322}.setting-head{display:flex;align-items:center;justify-content:space-between;color:rgba(0,0,0,.65);font-size:12px;line-height:20px}.provider-group{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:8px}.provider-radio{display:flex;align-items:flex-start;margin:0}.provider-radio :deep(.ant-radio){margin-top:1px}.provider-copy{min-width:0}.provider-name{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}.provider-description{color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
</style>
