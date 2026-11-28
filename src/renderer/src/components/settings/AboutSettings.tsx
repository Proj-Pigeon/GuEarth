import { Button, useToast } from '@renderer/components/ui'
import { useUpdaterStore } from '@renderer/stores/updater'
import { CopyIcon, RotateCwIcon } from 'lucide-react'
import { useState } from 'react'

import { logger } from '../../../../common/logger'

import styles from './AboutSettings.module.css'

export interface AboutSettingsProps {}

export function AboutSettings(_props: AboutSettingsProps) {
  const toast = useToast()
  const currentVersion = useUpdaterStore(state => state.currentVersion)
  const checking = useUpdaterStore(state => state.checking)
  const checkNow = useUpdaterStore(state => state.checkNow)

  const [copying, setCopying] = useState(false)

  const versionText = currentVersion ? `v${currentVersion}` : '未知'

  async function copyDiagnostics(): Promise<void> {
    if (copying) {
      return
    }
    setCopying(true)
    try {
      await window.guEarth.logs.copy(logger.dump())
      toast.success('诊断日志已复制到剪贴板')
    } catch {
      toast.error('复制失败，请重试')
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
          <Button
            loading={checking}
            icon={<RotateCwIcon className='size-3.5' />}
            onClick={() => void checkNow()}
          >
            检查更新
          </Button>
        </div>
      </div>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>诊断信息</div>
          </div>
          <Button
            loading={copying}
            icon={<CopyIcon className='size-3.5' />}
            onClick={() => void copyDiagnostics()}
          >
            复制
          </Button>
        </div>
      </div>
    </section>
  )
}

export default AboutSettings
