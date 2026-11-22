import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Card, Empty, Form, Input, Select, Spin, Tag } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  const { message } = AntdApp.useApp()
  const selected = providers.find(provider => provider.id === activeProviderId) ?? providers[0]
  const selectedId = selected?.id
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const [credential, setCredential] = useState<ProviderCredentialStatus>({
    configured: false,
    updatedAt: null
  })
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  const refreshCredential = useCallback(
    async (providerId = selectedIdRef.current): Promise<void> => {
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
    },
    []
  )

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
      message.success('搜索 API Key 已保存')
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
      message.success('搜索 API Key 已清除')
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
          options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
          disabled={loading || saving || clearing}
          aria-label='默认搜索供应商'
          className={styles.searchProviderSelect}
          onChange={(value: string) => onActiveProviderIdChange(value)}
        />
      )}
      {selected && (
        <Card
          title={selected.name}
          size='small'
          extra={
            !loading && !error ? (
              <Tag color={credential.configured ? 'success' : 'default'}>
                {credential.configured ? '已配置' : '未配置'}
              </Tag>
            ) : null
          }
        >
          <Spin spinning={loading}>
            <Form layout='vertical'>
              <Form.Item label='AppBuilder API Key' htmlFor={`search-key-${selected.id}`}>
                <Input.Password
                  id={`search-key-${selected.id}`}
                  value={apiKeyDraft}
                  onChange={event => setApiKeyDraft(event.target.value)}
                  maxLength={4096}
                  disabled={saving || clearing}
                  autoComplete='off'
                  placeholder='输入 AppBuilder API Key'
                  onPressEnter={() => void saveKey()}
                />
              </Form.Item>
            </Form>
            <div className={styles.searchKeyActions}>
              <Button
                loading={saving}
                disabled={!apiKeyDraft.trim() || clearing || loading}
                icon={<SaveOutlined />}
                onClick={() => void saveKey()}
              >
                保存密钥
              </Button>
              <Button
                loading={clearing}
                disabled={!credential.configured || saving || loading}
                icon={<DeleteOutlined />}
                onClick={() => void clearKey()}
              >
                清除密钥
              </Button>
            </div>
          </Spin>
        </Card>
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={
            <Button disabled={saving || clearing} onClick={() => void refreshCredential()}>
              刷新状态
            </Button>
          }
        />
      )}
      {!selected && <Empty description='暂无可用搜索服务' />}
    </section>
  )
}

export default SearchProviderSettings
