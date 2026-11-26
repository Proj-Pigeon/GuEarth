import { useCallback, useEffect, useRef, useState } from 'react'
import { SaveIcon, Trash2Icon } from 'lucide-react'
import {
  Alert,
  Button,
  Empty,
  PasswordInput,
  Select,
  Spinner,
  Tag,
  useToast
} from '@renderer/components/ui'
import type { AiSearchProviderConfig, ProviderCredentialStatus } from '../../../preload'
import styles from './SearchProviderSettings.module.css'

export interface SearchProviderSettingsProps {
  providers: AiSearchProviderConfig[]
  activeProviderId: string
  onActiveProviderIdChange: (id: string) => void
}

export function SearchProviderSettings({
  providers,
  activeProviderId,
  onActiveProviderIdChange
}: SearchProviderSettingsProps) {
  const toast = useToast()
  const selected = providers.find((provider) => provider.id === activeProviderId) ?? providers[0]
  const selectedId = selected?.id
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const [credential, setCredential] = useState<ProviderCredentialStatus>({ configured: false, updatedAt: null })
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  const refreshCredential = useCallback(async (providerId = selectedIdRef.current): Promise<void> => {
    if (!providerId) return
    setLoading(true)
    setError('')
    try {
      const status = await window.guEarth.settings.hasProviderApiKey(`ai-search-${providerId}`)
      if (selectedIdRef.current === providerId) setCredential(status)
    } catch {
      if (selectedIdRef.current === providerId) setError('无法读取搜索密钥状态，请重试')
    } finally {
      if (selectedIdRef.current === providerId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setApiKeyDraft('')
    setCredential({ configured: false, updatedAt: null })
    if (!selectedId) {
      setLoading(false)
      setError('')
      return
    }
    void refreshCredential(selectedId)
  }, [selectedId, refreshCredential])

  async function saveKey(): Promise<void> {
    const providerId = selectedIdRef.current
    const key = apiKeyDraft.trim()
    if (!providerId || !key || saving || clearing) return
    setSaving(true)
    setError('')
    try {
      const status = await window.guEarth.settings.setProviderApiKey(`ai-search-${providerId}`, key)
      if (selectedIdRef.current === providerId) {
        setCredential(status)
        setApiKeyDraft('')
      }
      toast.success('搜索 API Key 已保存')
    } catch {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  async function clearKey(): Promise<void> {
    const providerId = selectedIdRef.current
    if (!providerId || saving || clearing) return
    setClearing(true)
    setError('')
    try {
      const status = await window.guEarth.settings.clearProviderApiKey(`ai-search-${providerId}`)
      if (selectedIdRef.current === providerId) {
        setCredential(status)
        setApiKeyDraft('')
      }
      toast.success('搜索 API Key 已清除')
    } catch {
      setError('搜索密钥清除失败，请重试')
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className={styles.searchSettings}>
      {providers.length > 1 && (
        <Select
          value={activeProviderId}
          options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
          disabled={loading || saving || clearing}
          aria-label="默认搜索供应商"
          className={styles.searchProviderSelect}
          onChange={(value) => {
            if (value) onActiveProviderIdChange(value)
          }}
        />
      )}
      {selected && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{selected.name}</span>
            {!loading && !error && (
              <Tag tone={credential.configured ? 'success' : 'neutral'}>
                {credential.configured ? '已配置' : '未配置'}
              </Tag>
            )}
          </div>
          <div className={styles.cardBody}>
            <Spinner spinning={loading}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`search-key-${selected.id}`}>
                  AppBuilder API Key
                </label>
                <PasswordInput
                  id={`search-key-${selected.id}`}
                  value={apiKeyDraft}
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                  maxLength={4096}
                  disabled={saving || clearing}
                  autoComplete="off"
                  placeholder="输入 AppBuilder API Key"
                  onPressEnter={() => void saveKey()}
                />
              </div>
              <div className={styles.searchKeyActions}>
                <Button
                  loading={saving}
                  disabled={!apiKeyDraft.trim() || clearing || loading}
                  icon={<SaveIcon className="size-3.5" />}
                  onClick={() => void saveKey()}
                >
                  保存密钥
                </Button>
                <Button
                  loading={clearing}
                  disabled={!credential.configured || saving || loading}
                  icon={<Trash2Icon className="size-3.5" />}
                  onClick={() => void clearKey()}
                >
                  清除密钥
                </Button>
              </div>
            </Spinner>
          </div>
        </div>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="sm" disabled={saving || clearing} onClick={() => void refreshCredential()}>
              刷新状态
            </Button>
          }
        />
      )}
      {!selected && <Empty description="暂无可用搜索服务" />}
    </section>
  )
}

export default SearchProviderSettings
