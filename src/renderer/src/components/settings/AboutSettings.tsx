import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useUpdaterStore } from '@renderer/stores/updater'
import { App as AntdApp, Button } from 'antd'
import { useState } from 'react'

import { logger } from '../../../../common/logger'

import styles from './AboutSettings.module.css'

export interface AboutSettingsProps {}

export function AboutSettings(_props: AboutSettingsProps) {
  const { message } = AntdApp.useApp()
  const currentVersion = useUpdaterStore(state => state.currentVersion)
  const checking = useUpdaterStore(state => state.checking)
  const checkNow = useUpdaterStore(state => state.checkNow)

  const [copying, setCopying] = useState(false)

  const versionText = currentVersion ? `v${currentVersion}` : '未知'

  async function copyDiagnostics(): Promise<void> {
    if (copying) return
    setCopying(true)
    try {
      await window.guEarth.logs.copy(logger.dump())
      message.success('诊断日志已复制到剪贴板')
    } catch {
      message.error('复制失败，请重试')
    } finally {
      setCopying(false)
    }
  }

  return (
    <section className={styles.settingsSection} data-settings-section='' aria-label='关于'>
      <h3 className={styles.sectionTitle}>关于</h3>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>当前版本</div>
            <p className={`${styles.settingDesc} ${styles.versionText}`}>{versionText}</p>
          </div>
          <Button loading={checking} icon={<ReloadOutlined />} onClick={() => void checkNow()}>
            检查更新
          </Button>
        </div>
      </div>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>诊断信息</div>
          </div>
          <Button loading={copying} icon={<CopyOutlined />} onClick={() => void copyDiagnostics()}>
            复制
          </Button>
        </div>
      </div>
    </section>
  )
}

export default AboutSettings
