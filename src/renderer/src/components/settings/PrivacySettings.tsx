import { usePrivacyStore } from '@renderer/stores/privacy'
import { App as AntdApp, Button, Modal, Switch, Tag } from 'antd'
import { useEffect, useState } from 'react'

import {
  PRIVACY_DISCLOSURES,
  privacyDisclosureFor,
  type PrivacySettingKey
} from '../../../../common/privacy'

import styles from './PrivacySettings.module.css'

export interface PrivacySettingsProps {}

export function PrivacySettings(_props: PrivacySettingsProps) {
  const { message } = AntdApp.useApp()
  const errorReportingEnabled = usePrivacyStore(state => state.errorReportingEnabled)
  const telemetryEnabled = usePrivacyStore(state => state.telemetryEnabled)
  const aiTelemetryEnabled = usePrivacyStore(state => state.aiTelemetryEnabled)
  const hydrated = usePrivacyStore(state => state.hydrated)
  const hydrate = usePrivacyStore(state => state.hydrate)
  const setPrivacySetting = usePrivacyStore(state => state.setPrivacySetting)

  const [savingKey, setSavingKey] = useState<PrivacySettingKey | null>(null)
  const [pendingKey, setPendingKey] = useState<PrivacySettingKey | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const pendingDisclosure = pendingKey ? privacyDisclosureFor(pendingKey) : null

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  function isEnabled(key: PrivacySettingKey): boolean {
    if (key === 'errorReportingEnabled') return errorReportingEnabled
    if (key === 'telemetryEnabled') return telemetryEnabled
    return aiTelemetryEnabled
  }

  async function handleSwitchChange(key: PrivacySettingKey, checked: boolean): Promise<void> {
    if (!hydrated || savingKey || confirmLoading) return
    if (checked) {
      setPendingKey(key)
      return
    }
    setSavingKey(key)
    try {
      const saved = await setPrivacySetting(key, false)
      if (saved) message.success(`已关闭“${privacyDisclosureFor(key).title}”`)
      else message.error('隐私设置保存失败，请重试')
    } finally {
      setSavingKey(null)
    }
  }

  function cancelEnable(): void {
    if (confirmLoading) return
    setPendingKey(null)
  }

  async function confirmEnable(): Promise<void> {
    const key = pendingKey
    if (!key || confirmLoading) return
    setConfirmLoading(true)
    try {
      const saved = await setPrivacySetting(key, true)
      if (saved) {
        setPendingKey(null)
        message.success(`已开启“${privacyDisclosureFor(key).title}”`)
      } else {
        message.error('隐私设置保存失败，请重试')
      }
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <section className={styles.settingsSection} data-settings-section='' aria-label='隐私设置'>
      <h3 className={styles.sectionTitle}>隐私</h3>

      {PRIVACY_DISCLOSURES.map(item => {
        const enabled = isEnabled(item.key)
        return (
          <div key={item.key} className={styles.settingsBlock}>
            <div className={styles.settingRow}>
              <div className={styles.settingCopy}>
                <div className={styles.settingTitleRow}>
                  <span className={styles.settingTitle}>{item.title}</span>
                  <Tag color={enabled ? 'blue' : undefined}>{enabled ? '已开启' : '已关闭'}</Tag>
                </div>
                <p className={styles.settingDesc}>{item.summary}</p>
              </div>
              <Switch
                checked={enabled}
                loading={savingKey === item.key}
                disabled={!hydrated || confirmLoading}
                aria-label={item.title}
                onChange={checked => void handleSwitchChange(item.key, checked)}
              />
            </div>
          </div>
        )
      })}

      <Modal
        open={pendingDisclosure !== null}
        title={pendingDisclosure?.confirmTitle}
        width={520}
        zIndex={1300}
        mask={{ closable: false }}
        closable={!confirmLoading}
        keyboard={!confirmLoading}
        centered
        onCancel={cancelEnable}
        footer={
          <div className={styles.disclosureFooter}>
            <Button disabled={confirmLoading} onClick={cancelEnable}>
              取消
            </Button>
            <Button type='primary' loading={confirmLoading} onClick={() => void confirmEnable()}>
              已知晓并开启
            </Button>
          </div>
        }
      >
        {pendingDisclosure && (
          <div className={styles.disclosureBody}>
            <p className={styles.disclosureIntro}>{pendingDisclosure.confirmIntro}</p>
            <div className={styles.disclosureCard}>
              <div className={styles.disclosureCardTitle}>可能会收集、处理并上传的数据项</div>
              <ul className={styles.disclosureList}>
                {pendingDisclosure.collectedItems.map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
              </ul>
            </div>
            <p className={styles.disclosureDestination}>{pendingDisclosure.destinations}</p>
            <p className={styles.disclosureNotice}>{pendingDisclosure.notice}</p>
          </div>
        )}
      </Modal>
    </section>
  )
}

export default PrivacySettings
