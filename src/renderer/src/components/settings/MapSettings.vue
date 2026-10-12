<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { credentialOnlyProviders, providerCatalog, useGlobeStore } from '@renderer/stores/globe'
import { networkProxyMode, normalizeNetworkProxy, type NetworkProxyMode } from '../../../../common/networkProxy'

const globeStore = useGlobeStore()
const { networkProxy, tileCacheEnabled, tileMirrorEnabled, providerCredentials } = storeToRefs(globeStore)

const keyProviders = computed(() => [...providerCatalog, ...credentialOnlyProviders].filter((provider) => provider.requiresKey))
const credentialProviderId = ref('')
const credentialDraft = ref('')
const credentialSkDraft = ref('')

const selectedCredentialStatus = computed(() => providerCredentials.value[credentialProviderId.value])
const selectedSecurityCredentialStatus = computed(() => providerCredentials.value[`${credentialProviderId.value}-sk`])
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

async function saveCredential(): Promise<void> {
  const id = credentialProviderId.value
  const value = credentialDraft.value.trim()
  const sk = credentialSkDraft.value.trim()
  if (!id || !value || (requiresSecurityKey.value && !sk)) return
  try {
    const status = await window.guEarth.settings.setProviderApiKey(id, value)
    globeStore.setCredentialStatus(id, status)
    if (sk) {
      const securityStatus = await window.guEarth.settings.setProviderApiKey(`${id}-sk`, sk)
      globeStore.setCredentialStatus(`${id}-sk`, securityStatus)
    } else if (id === 'amap') {
      const securityStatus = await window.guEarth.settings.clearProviderApiKey(`${id}-sk`)
      globeStore.setCredentialStatus(`${id}-sk`, securityStatus)
    }
    credentialDraft.value = ''
    credentialSkDraft.value = ''
    message.success('密钥已保存')
  } catch {
    message.error('密钥保存失败：系统安全存储不可用')
  }
}

async function clearCredential(): Promise<void> {
  const id = credentialProviderId.value
  if (!id) return
  try {
    const status = await window.guEarth.settings.clearProviderApiKey(id)
    globeStore.setCredentialStatus(id, status)
    const securityStatus = await window.guEarth.settings.clearProviderApiKey(`${id}-sk`)
    globeStore.setCredentialStatus(`${id}-sk`, securityStatus)
    credentialDraft.value = ''
    credentialSkDraft.value = ''
    message.success('密钥已清除')
  } catch {
    message.error('密钥清除失败')
  }
}

const proxyPendingCustom = ref(false)
const proxyDraft = ref('')
const proxyTesting = ref(false)
const proxyTestResult = ref<{ ok: boolean; text: string } | null>(null)
const proxyMode = computed<NetworkProxyMode>(() => networkProxyMode(networkProxy.value))
const proxyModeView = computed<NetworkProxyMode>(() => (proxyPendingCustom.value || proxyMode.value === 'custom') ? 'custom' : proxyMode.value)
const normalizedProxyDraft = computed(() => normalizeNetworkProxy(proxyDraft.value))
const proxyApplyEnabled = computed(() => normalizedProxyDraft.value !== '' && normalizedProxyDraft.value !== networkProxy.value)

watch(networkProxy, (value) => {
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
  globeStore.setNetworkProxy(mode === 'system' ? '' : 'direct')
}

function applyProxy(): void {
  if (!proxyApplyEnabled.value) return
  globeStore.setNetworkProxy(normalizedProxyDraft.value)
}

async function testProxy(): Promise<void> {
  if (proxyTesting.value) return
  if (proxyModeView.value === 'custom' && normalizedProxyDraft.value === '') {
    proxyTestResult.value = { ok: false, text: '请输入有效的代理地址' }
    return
  }
  const candidate = proxyModeView.value === 'custom' ? normalizedProxyDraft.value : networkProxy.value
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
  <section class="settings-section" aria-label="地图设置">
    <h3 class="section-title">地图</h3>

    <section v-if="keyProviders.length" class="settings-block" data-guide-target="map-credentials">
      <div class="block-heading">
        <span>供应商密钥</span>
        <a-tag v-if="selectedCredentialStatus?.configured && (!requiresSecurityKey || selectedSecurityCredentialStatus?.configured)" color="green">已配置</a-tag>
      </div>
      <a-select v-model:value="credentialProviderId" class="full-width">
        <a-select-option v-for="provider in keyProviders" :key="provider.id" :value="provider.id">{{ provider.name }}</a-select-option>
      </a-select>
      <a-input v-model:value="credentialDraft" type="password" :placeholder="credentialProviderId === 'amap' ? '输入 Web 服务 API Key' : supportsSecurityKey ? '输入 AK (访问密钥)' : '输入 API Key'" class="key-input" @press-enter="saveCredential" />
      <a-input v-if="supportsSecurityKey" v-model:value="credentialSkDraft" type="password" :placeholder="securityKeyPlaceholder" class="key-input" @press-enter="saveCredential" />
      <a-alert v-if="supportsSecurityKey && !requiresSecurityKey" type="info" :message="credentialProviderId === 'amap' ? '仅在高德控制台开启数字签名时填写签名私钥' : '若使用签名鉴权，需填写有效签名密钥'" show-icon class="credential-hint" />
      <div class="key-actions">
        <a-button type="primary" :disabled="!credentialDraft.trim() || (requiresSecurityKey && !credentialSkDraft.trim())" @click="saveCredential"><SaveOutlined />保存</a-button>
        <a-button :disabled="!selectedCredentialStatus?.configured && !selectedSecurityCredentialStatus?.configured" @click="clearCredential"><DeleteOutlined />清除</a-button>
      </div>
    </section>

    <section class="settings-block">
      <div class="block-heading"><span>网络代理</span></div>
      <a-radio-group :value="proxyModeView" class="proxy-mode-group" @change="handleProxyModeChange">
        <a-radio-button value="system">跟随系统</a-radio-button>
        <a-radio-button value="direct">直连</a-radio-button>
        <a-radio-button value="custom">自定义</a-radio-button>
      </a-radio-group>
      <a-input v-if="proxyModeView === 'custom'" v-model:value="proxyDraft" placeholder="http://127.0.0.1:7890 或 socks5://…" class="proxy-input" @press-enter="testProxy" />
      <div class="proxy-actions">
        <a-button v-if="proxyModeView === 'custom'" type="primary" :disabled="!proxyApplyEnabled" @click="applyProxy">应用</a-button>
        <a-button :loading="proxyTesting" @click="testProxy">测试</a-button>
      </div>
      <div v-if="proxyTestResult" :class="['proxy-result', proxyTestResult.ok ? 'proxy-result-ok' : 'proxy-result-fail']">{{ proxyTestResult.text }}</div>
    </section>

    <section class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">瓦片缓存</div>
          <p class="setting-desc">将已下载的地图瓦片缓存到本地，在后续使用可以节省流量、提高加载速度。</p>
        </div>
        <a-switch :checked="tileCacheEnabled" @change="(value: string | number | boolean) => globeStore.setTileCacheEnabled(value === true)" />
      </div>
    </section>

    <section class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">高德镜像瓦片源</div>
          <p class="setting-desc">若您位于中国大陆，推荐开启此选项。</p>
        </div>
        <a-switch :checked="tileMirrorEnabled" @change="(value: string | number | boolean) => globeStore.setTileMirrorEnabled(value === true)" />
      </div>
    </section>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.section-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.settings-block{padding:16px 0;margin-top:16px;border-bottom:1px solid rgba(5,5,5,0.06)}
.settings-block:last-child{border-bottom:none}
.block-heading{display:flex;align-items:center;gap:8px;margin-bottom:12px;color:rgba(0,0,0,0.65);font-size:12px;line-height:20px}
.full-width{width:100%}
.key-input{margin-top:8px}
.credential-hint{margin-top:8px}
.key-actions{display:flex;gap:8px;margin-top:8px}
.setting-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.setting-copy{flex:1;min-width:0}
.setting-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.setting-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.proxy-mode-group{display:flex;width:100%;max-width:420px}
.proxy-mode-group :deep(.ant-radio-button-wrapper){flex:1;text-align:center}
.proxy-input{margin-top:8px;max-width:420px}
.proxy-actions{display:flex;gap:8px;margin-top:8px}
.proxy-result{margin-top:8px;color:rgba(0,0,0,0.65);font-size:12px;line-height:20px;word-break:break-all}
.proxy-result-ok{color:#389e0d}
.proxy-result-fail{color:#cf1322}
</style>
