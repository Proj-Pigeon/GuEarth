import { useEffect, useMemo, useState } from 'react'
import { SaveIcon, Trash2Icon } from 'lucide-react'
import { Alert, Button, PasswordInput, Input, Segmented, Select, Switch, Tag, useToast } from '@renderer/components/ui'
import { credentialOnlyProviders, providerCatalog, useGlobeStore } from '@renderer/stores/globe'
import { networkProxyMode, normalizeNetworkProxy } from '../../../../common/networkProxy';
import type { NetworkProxyMode } from '../../../../common/networkProxy';
import { mirrorEndpointLabel, mirrorEndpointShortLabel } from '../../../../common/tileMirror';
import type { MirrorEndpointPreference } from '../../../../common/tileMirror';
import { normalizeTouchInteractionMode, touchInteractionModes } from '../../../../common/touchInteraction';
import type { TouchInteractionMode } from '../../../../common/touchInteraction';
import styles from './MapSettings.module.css'

export interface MapSettingsProps {}

const allProviders = [...providerCatalog, ...credentialOnlyProviders]

const touchInteractionModeLabels: Record<TouchInteractionMode, string> = {
  auto: '自动',
  on: '始终开启',
  off: '关闭'
}

const touchInteractionModeDescriptions: Record<TouchInteractionMode, string> = {
  auto: '软件自动识别触控情况，在特定情况下启用触屏模式。',
  on: '始终启用触摸交互界面。',
  off: '始终使用桌面键鼠界面。'
}

const touchInteractionModeOptions = touchInteractionModes.map((mode) => ({
  value: mode,
  label: touchInteractionModeLabels[mode]
}))

const proxyModeOptions: { value: NetworkProxyMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'direct', label: '直连' },
  { value: 'custom', label: '自定义' }
]

const mirrorSourceOptions: { value: MirrorEndpointPreference; label: string }[] = [
  { value: 'auto', label: '自动匹配' },
  { value: 'edgeone', label: 'EdgeOne' },
  { value: 'cloudflare', label: 'Cloudflare' }
]

export function MapSettings(_props: MapSettingsProps) {
  const toast = useToast()
  const networkProxy = useGlobeStore((state) => state.networkProxy)
  const selectedLayerId = useGlobeStore((state) => state.selectedLayerId)
  const tileCacheEnabled = useGlobeStore((state) => state.tileCacheEnabled)
  const tileMirrorMode = useGlobeStore((state) => state.tileMirrorMode)
  const tileMirrorSource = useGlobeStore((state) => state.tileMirrorSource)
  const activeMirrorEndpoint = useGlobeStore((state) => state.activeMirrorEndpoint)
  const mirrorProbingEndpoints = useGlobeStore((state) => state.mirrorProbingEndpoints)
  const mirrorEndpointProbes = useGlobeStore((state) => state.mirrorEndpointProbes)
  const mirroredProviders = useGlobeStore((state) => state.mirroredProviders)
  const mirrorFallenBackProviders = useGlobeStore((state) => state.mirrorFallenBackProviders)
  const providerCredentials = useGlobeStore((state) => state.providerCredentials)
  const touchInteractionMode = useGlobeStore((state) => state.touchInteractionMode)
  const touchInteractionActive = useGlobeStore((state) => state.touchInteractionActive)
  const applyTileMirrorStatus = useGlobeStore((state) => state.applyTileMirrorStatus)
  const setTileMirrorSource = useGlobeStore((state) => state.setTileMirrorSource)
  const openMirrorConsent = useGlobeStore((state) => state.openMirrorConsent)
  const setTileMirrorMode = useGlobeStore((state) => state.setTileMirrorMode)
  const setCredentialStatus = useGlobeStore((state) => state.setCredentialStatus)
  const setNetworkProxy = useGlobeStore((state) => state.setNetworkProxy)
  const setTileCacheEnabled = useGlobeStore((state) => state.setTileCacheEnabled)
  const openMirrorPolicy = useGlobeStore((state) => state.openMirrorPolicy)
  const setTouchInteractionMode = useGlobeStore((state) => state.setTouchInteractionMode)

  const keyProviders = useMemo(() => allProviders.filter((provider) => provider.requiresKey), [])
  const [credentialProviderId, setCredentialProviderId] = useState(() => keyProviders[0]?.id ?? '')
  const [credentialDraft, setCredentialDraft] = useState('')
  const [credentialSkDraft, setCredentialSkDraft] = useState('')

  const [proxyPendingCustom, setProxyPendingCustom] = useState(false)
  const [proxyDraft, setProxyDraft] = useState(() => (networkProxyMode(networkProxy) === 'custom' ? networkProxy : ''))
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyTestResult, setProxyTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (typeof window.guEarth?.tiles?.getMirrorStatus !== 'function') {return}
    void window.guEarth.tiles
      .getMirrorStatus()
      .then((status) => {
        applyTileMirrorStatus(status)
      })
      .catch(() => {})
  }, [applyTileMirrorStatus])

  useEffect(() => {
    if (!keyProviders.some((provider) => provider.id === credentialProviderId)) {
      setCredentialProviderId(keyProviders[0]?.id ?? '')
    }
  }, [keyProviders, credentialProviderId])

  useEffect(() => {
    setProxyDraft(networkProxyMode(networkProxy) === 'custom' ? networkProxy : '')
    setProxyPendingCustom(false)
    setProxyTestResult(null)
  }, [networkProxy])

  const tileMirrorEnabled = tileMirrorMode === 'on'
  const tileMirrorRouteActive = tileMirrorEnabled || mirroredProviders.length > 0
  const tileMirrorFallenBack =
    tileMirrorEnabled &&
    mirrorFallenBackProviders.length > 0 &&
    (mirrorFallenBackProviders.includes(selectedLayerId) || mirroredProviders.length === 0)
  const tileMirrorStatusTone = tileMirrorFallenBack
    ? 'warning'
    : tileMirrorRouteActive
      ? mirrorProbingEndpoints
        ? 'info'
        : 'success'
      : 'neutral'
  const tileMirrorStatusLabel = tileMirrorFallenBack
    ? '镜像异常，已回退直连'
    : tileMirrorRouteActive
      ? mirrorProbingEndpoints
        ? '正在匹配镜像源…'
        : `已启用 · ${mirrorEndpointShortLabel(activeMirrorEndpoint)}`
      : '直连原服务'
  const tileMirrorSourceHint =
    tileMirrorSource === 'auto'
      ? mirrorProbingEndpoints
        ? '正在测速 EdgeOne 与 Cloudflare，自动选择最适合当前网络的镜像源…'
        : `每次启动自动测速并在 EdgeOne 与 Cloudflare 中选择更优线路，当前使用：${mirrorEndpointLabel(activeMirrorEndpoint)}`
      : `已固定使用 ${mirrorEndpointLabel(tileMirrorSource)}，启动时不会自动切换`

  const mirrorProbeEntries = useMemo(
    () =>
      mirrorEndpointProbes.map((probe) => ({
        endpoint: probe.endpoint,
        label: mirrorEndpointShortLabel(probe.endpoint),
        ok: probe.ok,
        text:
          probe.ok && probe.latencyMs !== null
            ? `${probe.latencyMs} ms`
            : probe.error
              ? `不可用（${probe.error}）`
              : '不可用'
      })),
    [mirrorEndpointProbes]
  )

  const selectedCredentialStatus = providerCredentials[credentialProviderId]
  const selectedSecurityCredentialStatus = providerCredentials[`${credentialProviderId}-sk`]
  const selectedProvider = allProviders.find((provider) => provider.id === credentialProviderId)
  const supportsSecurityKey = Boolean(selectedProvider?.requiresSk || selectedProvider?.requiresSecurityKey)
  const requiresSecurityKey = Boolean(
    (selectedProvider?.requiresSecurityKey && !selectedProvider?.securityKeyOptional) ||
      (selectedProvider?.requiresSk && !selectedProvider?.skOptional)
  )
  const securityKeyPlaceholder = selectedProvider?.requiresSecurityKey ? '输入签名私钥（可选）' : '输入 SK (签名密钥，可选)'

  const proxyMode: NetworkProxyMode = networkProxyMode(networkProxy)
  const proxyModeView: NetworkProxyMode = proxyPendingCustom || proxyMode === 'custom' ? 'custom' : proxyMode
  const normalizedProxyDraft = normalizeNetworkProxy(proxyDraft)
  const proxyApplyEnabled = normalizedProxyDraft !== '' && normalizedProxyDraft !== networkProxy

  function handleCredentialProviderChange(nextId: string | undefined): void {
    if (!nextId) {return}
    setCredentialProviderId(nextId)
    setCredentialDraft('')
    setCredentialSkDraft('')
  }

  async function reprobeMirrorEndpoints(): Promise<void> {
    if (mirrorProbingEndpoints || typeof window.guEarth?.tiles?.probeMirrorEndpoints !== 'function') {return}
    try {
      const status = await window.guEarth.tiles.probeMirrorEndpoints()
      applyTileMirrorStatus(status)
      const probes = status.endpointProbes ?? []
      const anyReachable = probes.some((probe) => probe.ok)
      if (!anyReachable) {
        toast.warning('镜像源测速失败，请检查网络连接或代理设置')
        return
      }
      const active = status.activeEndpoint ?? activeMirrorEndpoint
      if (tileMirrorSource === 'auto') {
        toast.success(`测速完成，已匹配 ${mirrorEndpointShortLabel(active)} 镜像源`)
      } else {
        toast.success('镜像源测速完成')
      }
    } catch {
      toast.error('镜像源测速失败，请重试')
    }
  }

  async function retryTileMirror(): Promise<void> {
    if (typeof window.guEarth?.tiles?.resetMirrorFallback !== 'function') {return}
    try {
      const status = await window.guEarth.tiles.resetMirrorFallback()
      applyTileMirrorStatus(status)
      toast.info('已重新尝试镜像线路')
    } catch {
      toast.error('重置镜像状态失败，请重试')
    }
  }

  function handleTileMirrorSwitchChange(checked: boolean): void {
    if (checked) {
      openMirrorConsent('settings')
      return
    }
    setTileMirrorMode('off')
  }

  async function saveCredential(): Promise<void> {
    const id = credentialProviderId
    const value = credentialDraft.trim()
    const sk = credentialSkDraft.trim()
    if (!id || !value || (requiresSecurityKey && !sk)) {return}
    const touchesSecurityKey = sk !== '' || id === 'amap'
    try {
      const status = await window.guEarth.settings.setProviderApiKey(id, value)
      setCredentialStatus(id, status)
    } catch {
      toast.error('保存失败，请重试')
      return
    }
    if (touchesSecurityKey) {
      try {
        const securityStatus = sk
          ? await window.guEarth.settings.setProviderApiKey(`${id}-sk`, sk)
          : await window.guEarth.settings.clearProviderApiKey(`${id}-sk`)
        setCredentialStatus(`${id}-sk`, securityStatus)
      } catch {
        toast.error('主密钥已保存，但签名密钥保存失败，请重试')
        return
      }
    }
    setCredentialDraft('')
    setCredentialSkDraft('')
    toast.success('密钥已保存')
  }

  async function clearCredential(): Promise<void> {
    const id = credentialProviderId
    if (!id) {return}
    try {
      const status = await window.guEarth.settings.clearProviderApiKey(id)
      setCredentialStatus(id, status)
      const securityStatus = await window.guEarth.settings.clearProviderApiKey(`${id}-sk`)
      setCredentialStatus(`${id}-sk`, securityStatus)
      setCredentialDraft('')
      setCredentialSkDraft('')
      toast.success('密钥已清除')
    } catch {
      toast.error('密钥清除失败')
    }
  }

  function handleProxyModeChange(mode: NetworkProxyMode): void {
    if (mode === 'custom') {
      setProxyPendingCustom(true)
      return
    }
    setProxyPendingCustom(false)
    setNetworkProxy(mode === 'system' ? '' : 'direct')
  }

  function applyProxy(): void {
    if (!proxyApplyEnabled) {return}
    setNetworkProxy(normalizedProxyDraft)
  }

  async function testProxy(): Promise<void> {
    if (proxyTesting) {return}
    if (proxyModeView === 'custom' && normalizedProxyDraft === '') {
      setProxyTestResult({ ok: false, text: '请输入有效的代理地址' })
      return
    }
    const candidate = proxyModeView === 'custom' ? normalizedProxyDraft : networkProxy
    setProxyTesting(true)
    setProxyTestResult(null)
    try {
      const result = await window.guEarth.settings.testNetworkProxy(candidate)
      setProxyTestResult(
        result.ok
          ? { ok: true, text: `连接正常 · ${result.elapsedMs} ms` }
          : { ok: false, text: `连接失败：${result.error || '未知错误'}` }
      )
    } catch (error) {
      setProxyTestResult({
        ok: false,
        text: `连接失败：${error instanceof Error ? error.message : '未知错误'}`
      })
    } finally {
      setProxyTesting(false)
    }
  }

  const keyProviderOptions = useMemo(
    () => keyProviders.map((provider) => ({ value: provider.id, label: provider.name })),
    [keyProviders]
  )

  return (
    <section className={styles.settingsSection} data-settings-section="" aria-label="地图设置">
      <h3 className={styles.sectionTitle}>地图</h3>

      {keyProviders.length > 0 && (
        <section className={styles.settingsBlock} data-guide-target="map-credentials">
          <div className={styles.blockHeading}>
            <span>地图搜索密钥</span>
            {selectedCredentialStatus?.configured &&
              (!requiresSecurityKey || selectedSecurityCredentialStatus?.configured) && (
                <Tag tone="success">已配置</Tag>
              )}
          </div>
          <Select
            value={credentialProviderId}
            options={keyProviderOptions}
            className={styles.fullWidth}
            aria-label="选择地图搜索供应商"
            onChange={handleCredentialProviderChange}
          />
          <PasswordInput
            value={credentialDraft}
            placeholder={
              credentialProviderId === 'amap'
                ? '输入高德 Web 服务 Key'
                : supportsSecurityKey
                  ? '输入 AK（访问密钥）'
                  : '输入 API Key'
            }
            className={styles.keyInput}
            onChange={(event) => setCredentialDraft(event.target.value)}
            onPressEnter={() => void saveCredential()}
          />
          {supportsSecurityKey && (
            <PasswordInput
              value={credentialSkDraft}
              placeholder={securityKeyPlaceholder}
              className={styles.keyInput}
              onChange={(event) => setCredentialSkDraft(event.target.value)}
              onPressEnter={() => void saveCredential()}
            />
          )}
          {supportsSecurityKey && !requiresSecurityKey && (
            <Alert
              type="neutral"
              title={
                credentialProviderId === 'amap'
                  ? '仅在高德控制台开启数字签名时填写签名私钥'
                  : '若使用签名鉴权，需填写有效签名密钥'
              }
              showIcon
              className={styles.credentialHint}
            />
          )}
          <div className={styles.keyActions}>
            <Button
              variant="primary"
              disabled={!credentialDraft.trim() || (requiresSecurityKey && !credentialSkDraft.trim())}
              icon={<SaveIcon className="size-3.5" />}
              onClick={() => void saveCredential()}
            >
              保存
            </Button>
            <Button
              disabled={!selectedCredentialStatus?.configured && !selectedSecurityCredentialStatus?.configured}
              icon={<Trash2Icon className="size-3.5" />}
              onClick={() => void clearCredential()}
            >
              清除
            </Button>
          </div>
        </section>
      )}

      <section className={styles.settingsBlock}>
        <div className={styles.blockHeading}>
          <span>网络代理</span>
        </div>
        <Segmented<NetworkProxyMode>
          value={proxyModeView}
          options={proxyModeOptions}
          block
          className={styles.proxyModeGroup}
          aria-label="网络代理模式"
          onChange={handleProxyModeChange}
        />
        {proxyModeView === 'custom' && (
          <Input
            value={proxyDraft}
            placeholder="http://127.0.0.1:7890 或 socks5://…"
            className={styles.proxyInput}
            onChange={(event) => setProxyDraft(event.target.value)}
            onPressEnter={() => void testProxy()}
          />
        )}
        <div className={styles.proxyActions}>
          {proxyModeView === 'custom' && (
            <Button variant="primary" disabled={!proxyApplyEnabled} onClick={applyProxy}>
              应用
            </Button>
          )}
          <Button loading={proxyTesting} onClick={() => void testProxy()}>
            测试
          </Button>
        </div>
        {proxyTestResult && (
          <div
            className={`${styles.proxyResult} ${proxyTestResult.ok ? styles.proxyResultOk : styles.proxyResultFail}`}
          >
            {proxyTestResult.text}
          </div>
        )}
      </section>

      <section className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>地图缓存</div>
            <p className={styles.settingDesc}>将浏览过的地图保存在本地，再次打开更快、更省流量</p>
          </div>
          <Switch checked={tileCacheEnabled} aria-label="地图缓存" onChange={(value) => setTileCacheEnabled(value)} />
        </div>
      </section>

      <section className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitleRow}>
              <span className={styles.settingTitle}>海外资源镜像服务</span>
              <Tag tone={tileMirrorStatusTone}>{tileMirrorStatusLabel}</Tag>
              {tileMirrorFallenBack && (
                <Button variant="link" className={styles.policyInlineLink} onClick={() => void retryTileMirror()}>
                  重试镜像
                </Button>
              )}
            </div>
            <p className={styles.settingDesc}>
              由咕咕地球携手奈索星联团队提供加速服务，加速海外底图、3D 地形与教学数据加载。启用即表示同意
              <Button variant="link" className={styles.policyInlineLink} onClick={() => openMirrorPolicy('agreement')}>
                《咕咕地球镜像服务使用协议》
              </Button>
              与
              <Button
                variant="link"
                className={styles.policyInlineLink}
                onClick={() => openMirrorPolicy('acceptable-use')}
              >
                《可接受使用政策》
              </Button>
              。
            </p>
          </div>
          <Switch checked={tileMirrorEnabled} aria-label="海外资源镜像服务" onChange={handleTileMirrorSwitchChange} />
        </div>

        {tileMirrorEnabled && (
          <div className={styles.mirrorSourceSection}>
            <div className={styles.mirrorSourceHeader}>
              <span className={styles.mirrorSourceHeading}>镜像服务源</span>
              <Button size="sm" loading={mirrorProbingEndpoints} onClick={() => void reprobeMirrorEndpoints()}>
                {mirrorProbingEndpoints ? '测速中…' : '重新测速'}
              </Button>
            </div>
            <Segmented<MirrorEndpointPreference>
              value={tileMirrorSource}
              options={mirrorSourceOptions}
              block
              className={styles.proxyModeGroup}
              aria-label="镜像服务源"
              onChange={(value) => setTileMirrorSource(value)}
            />
            <p className={styles.mirrorSourceHint}>{tileMirrorSourceHint}</p>
            {mirrorProbeEntries.length > 0 && (
              <div className={styles.mirrorProbeList}>
                {mirrorProbeEntries.map((entry) => (
                  <span
                    key={entry.endpoint}
                    className={`${styles.mirrorProbeItem} ${entry.ok ? styles.mirrorProbeOk : styles.mirrorProbeFail}`}
                  >
                    {entry.label}：{entry.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitleRow}>
              <span className={styles.settingTitle}>触摸操作</span>
              {touchInteractionMode !== 'off' && (
                <Tag tone={touchInteractionActive ? 'info' : 'neutral'}>
                  {touchInteractionActive ? '触摸交互已启用' : '未检测到触摸设备'}
                </Tag>
              )}
            </div>
            <p className={styles.settingDesc}>{touchInteractionModeDescriptions[touchInteractionMode]}</p>
          </div>
          <Select
            className={styles.touchModeSelect}
            value={touchInteractionMode}
            options={touchInteractionModeOptions}
            aria-label="触摸操作"
            onChange={(value) => void setTouchInteractionMode(normalizeTouchInteractionMode(value))}
          />
        </div>
      </section>
    </section>
  )
}

export default MapSettings
