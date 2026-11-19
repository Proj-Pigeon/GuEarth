<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { credentialOnlyProviders, providerCatalog, useGlobeStore } from '@renderer/stores/globe'
import { networkProxyMode, normalizeNetworkProxy, type NetworkProxyMode } from '../../../../common/networkProxy'
import {
  mirrorEndpointLabel,
  mirrorEndpointShortLabel,
  type MirrorEndpointPreference
} from '../../../../common/tileMirror'

const globeStore = useGlobeStore()
const {
  networkProxy,
  selectedLayerId,
  tileCacheEnabled,
  tileMirrorMode,
  tileMirrorSource,
  activeMirrorEndpoint,
  mirrorProbingEndpoints,
  mirrorEndpointProbes,
  mirroredProviders,
  mirrorFallenBackProviders,
  providerCredentials
} = storeToRefs(globeStore)

const tileMirrorEnabled = computed(() => tileMirrorMode.value === 'on')
const tileMirrorRouteActive = computed(() => tileMirrorEnabled.value || mirroredProviders.value.length > 0)
const tileMirrorFallenBack = computed(() =>
  tileMirrorEnabled.value
  && mirrorFallenBackProviders.value.length > 0
  && (mirrorFallenBackProviders.value.includes(selectedLayerId.value) || mirroredProviders.value.length === 0)
)
const tileMirrorStatusColor = computed(() => (tileMirrorFallenBack.value ? 'orange' : tileMirrorRouteActive.value ? 'blue' : undefined))
const tileMirrorStatusLabel = computed(() => {
  if (tileMirrorFallenBack.value) return '镜像异常，已回退直连'
  if (tileMirrorRouteActive.value) {
    if (mirrorProbingEndpoints.value) return '正在匹配镜像源…'
    return `已启用 · ${mirrorEndpointShortLabel(activeMirrorEndpoint.value)}`
  }
  return '直连原服务'
})
const tileMirrorSourceHint = computed(() => {
  if (tileMirrorSource.value === 'auto') {
    if (mirrorProbingEndpoints.value) return '正在测速 EdgeOne 与 Cloudflare，自动选择最适合当前网络的镜像源…'
    return `每次启动自动测速并在 EdgeOne 与 Cloudflare 中选择更优线路，当前使用：${mirrorEndpointLabel(activeMirrorEndpoint.value)}`
  }
  return `已固定使用 ${mirrorEndpointLabel(tileMirrorSource.value)}，启动时不会自动切换`
})
const mirrorProbeEntries = computed(() =>
  mirrorEndpointProbes.value.map((probe) => ({
    endpoint: probe.endpoint,
    label: mirrorEndpointShortLabel(probe.endpoint),
    ok: probe.ok,
    text: probe.ok && probe.latencyMs !== null ? `${probe.latencyMs} ms` : (probe.error ? `不可用（${probe.error}）` : '不可用')
  }))
)

onMounted(() => {
  if (typeof window.guEarth?.tiles?.getMirrorStatus !== 'function') return
  void window.guEarth.tiles.getMirrorStatus().then((status) => {
    globeStore.applyTileMirrorStatus(status)
  }).catch(() => undefined)
})

function handleTileMirrorSourceChange(event: { target: { value: MirrorEndpointPreference } }): void {
  globeStore.setTileMirrorSource(event.target.value)
}

async function reprobeMirrorEndpoints(): Promise<void> {
  if (mirrorProbingEndpoints.value || typeof window.guEarth?.tiles?.probeMirrorEndpoints !== 'function') return
  try {
    const status = await window.guEarth.tiles.probeMirrorEndpoints()
    globeStore.applyTileMirrorStatus(status)
    const probes = status.endpointProbes ?? []
    const anyReachable = probes.some((probe) => probe.ok)
    if (!anyReachable) {
      message.warning('镜像源测速失败，请检查网络连接或代理设置')
      return
    }
    const active = status.activeEndpoint ?? activeMirrorEndpoint.value
    if (tileMirrorSource.value === 'auto') {
      message.success(`测速完成，已匹配 ${mirrorEndpointShortLabel(active)} 镜像源`)
    } else {
      message.success('镜像源测速完成')
    }
  } catch {
    message.error('镜像源测速失败，请重试')
  }
}

async function retryTileMirror(): Promise<void> {
  if (typeof window.guEarth?.tiles?.resetMirrorFallback !== 'function') return
  try {
    const status = await window.guEarth.tiles.resetMirrorFallback()
    globeStore.applyTileMirrorStatus(status)
    message.info('已重新尝试镜像线路')
  } catch {
    message.error('重置镜像状态失败，请重试')
  }
}

function handleTileMirrorSwitchChange(checked: string | number | boolean): void {
  if (checked === true) {
    globeStore.openMirrorConsent('settings')
    return
  }
  globeStore.setTileMirrorMode('off')
}

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
  const touchesSecurityKey = sk !== '' || id === 'amap'
  try {
    const status = await window.guEarth.settings.setProviderApiKey(id, value)
    globeStore.setCredentialStatus(id, status)
  } catch {
    message.error('保存失败，请重试')
    return
  }
  if (touchesSecurityKey) {
    try {
      const securityStatus = sk
        ? await window.guEarth.settings.setProviderApiKey(`${id}-sk`, sk)
        : await window.guEarth.settings.clearProviderApiKey(`${id}-sk`)
      globeStore.setCredentialStatus(`${id}-sk`, securityStatus)
    } catch {
      message.error('主密钥已保存，但签名密钥保存失败，请重试')
      return
    }
  }
  credentialDraft.value = ''
  credentialSkDraft.value = ''
  message.success('密钥已保存')
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
        <span>地图搜索密钥</span>
        <a-tag v-if="selectedCredentialStatus?.configured && (!requiresSecurityKey || selectedSecurityCredentialStatus?.configured)" color="green">已配置</a-tag>
      </div>
      <a-select v-model:value="credentialProviderId" class="full-width">
        <a-select-option v-for="provider in keyProviders" :key="provider.id" :value="provider.id">{{ provider.name }}</a-select-option>
      </a-select>
      <a-input v-model:value="credentialDraft" type="password" :placeholder="credentialProviderId === 'amap' ? '输入高德 Web 服务 Key' : supportsSecurityKey ? '输入 AK（访问密钥）' : '输入 API Key'" class="key-input" @press-enter="saveCredential" />
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
          <div class="setting-title">地图缓存</div>
          <p class="setting-desc">将浏览过的地图保存在本地，再次打开更快、更省流量</p>
        </div>
        <a-switch :checked="tileCacheEnabled" @change="(value: string | number | boolean) => globeStore.setTileCacheEnabled(value === true)" />
      </div>
    </section>

    <section class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title-row">
            <span class="setting-title">海外资源镜像服务</span>
            <a-tag :color="tileMirrorStatusColor">
              {{ tileMirrorStatusLabel }}
            </a-tag>
            <a-button v-if="tileMirrorFallenBack" type="link" class="policy-inline-link" @click="retryTileMirror">重试镜像</a-button>
          </div>
          <p class="setting-desc">
            由咕咕地球携手奈索星联团队提供加速服务，加速海外底图、3D 地形与教学数据加载。启用即表示同意<a-button type="link" class="policy-inline-link" @click="globeStore.openMirrorPolicy('agreement')">《咕咕地球镜像服务使用协议》</a-button>与<a-button type="link" class="policy-inline-link" @click="globeStore.openMirrorPolicy('acceptable-use')">《可接受使用政策》</a-button>。
          </p>
        </div>
        <a-switch
          :checked="tileMirrorEnabled"
          aria-label="海外资源镜像服务"
          @change="handleTileMirrorSwitchChange"
        />
      </div>
      <div v-if="tileMirrorEnabled" class="mirror-source-section">
        <div class="mirror-source-header">
          <span class="mirror-source-heading">镜像服务源</span>
          <a-button
            size="small"
            :loading="mirrorProbingEndpoints"
            @click="reprobeMirrorEndpoints"
          >
            {{ mirrorProbingEndpoints ? '测速中…' : '重新测速' }}
          </a-button>
        </div>
        <a-radio-group
          :value="tileMirrorSource"
          class="proxy-mode-group"
          @change="handleTileMirrorSourceChange"
        >
          <a-radio-button value="auto">自动匹配</a-radio-button>
          <a-radio-button value="edgeone">EdgeOne</a-radio-button>
          <a-radio-button value="cloudflare">Cloudflare</a-radio-button>
        </a-radio-group>
        <p class="mirror-source-hint">{{ tileMirrorSourceHint }}</p>
        <div v-if="mirrorProbeEntries.length > 0" class="mirror-probe-list">
          <span
            v-for="entry in mirrorProbeEntries"
            :key="entry.endpoint"
            :class="['mirror-probe-item', entry.ok ? 'mirror-probe-ok' : 'mirror-probe-fail']"
          >
            {{ entry.label }}：{{ entry.text }}
          </span>
        </div>
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
.setting-title-row{display:flex;align-items:center;gap:8px}
.setting-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.setting-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.policy-inline-link{height:auto;padding:0;border:0;font-size:inherit;line-height:inherit;vertical-align:baseline;white-space:normal;text-align:left}
.proxy-mode-group{display:flex;width:100%;max-width:420px}
.proxy-mode-group :deep(.ant-radio-button-wrapper){flex:1;text-align:center}
.proxy-input{margin-top:8px;max-width:420px}
.proxy-actions{display:flex;gap:8px;margin-top:8px}
.proxy-result{margin-top:8px;color:rgba(0,0,0,0.65);font-size:12px;line-height:20px;word-break:break-all}
.proxy-result-ok{color:#389e0d}
.proxy-result-fail{color:#cf1322}
.mirror-source-section{margin-top:16px;padding-top:12px;border-top:1px solid rgba(5,5,5,0.06)}
.mirror-source-header{display:flex;align-items:center;justify-content:space-between;gap:8px;max-width:420px;margin-bottom:8px}
.mirror-source-heading{color:rgba(0,0,0,0.65);font-size:12px;line-height:20px}
.mirror-source-hint{margin:8px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.mirror-probe-list{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;font-size:12px;line-height:20px}
.mirror-probe-item{color:rgba(0,0,0,0.65)}
.mirror-probe-ok{color:#389e0d}
.mirror-probe-fail{color:#cf1322}
</style>
