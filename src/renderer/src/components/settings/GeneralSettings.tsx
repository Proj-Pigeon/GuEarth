import { useEffect, useState } from 'react'
import { App as AntdApp, Button } from 'antd'
import { FolderOpenOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import styles from './GeneralSettings.module.css'

export interface GeneralSettingsProps {
  onRestartGuide?: () => void
}

export function GeneralSettings({ onRestartGuide }: GeneralSettingsProps) {
  const { message } = AntdApp.useApp()
  const closeSettingsWindow = useSettingsWindowStore((state) => state.close)

  const [directory, setDirectory] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.guEarth.recordings
      .getDirectory()
      .then((value) => {
        if (!cancelled) setDirectory(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function chooseDirectory(): Promise<void> {
    if (choosing) return
    setChoosing(true)
    try {
      const next = await window.guEarth.recordings.chooseDirectory()
      if (next) {
        setDirectory(next)
        message.success('保存目录已更新')
      }
    } catch {
      message.error('选择目录失败，请重试')
    } finally {
      setChoosing(false)
    }
  }

  async function restartGuide(): Promise<void> {
    await window.guEarth.settings.update({ setupGuideDismissed: false }).catch(() => undefined)
    closeSettingsWindow()
    onRestartGuide?.()
  }

  return (
    <section className={styles.settingsSection} data-settings-section="" aria-label="通用设置">
      <h3 className={styles.sectionTitle}>通用</h3>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>录制保存目录</div>
          </div>
          <Button loading={choosing} icon={<FolderOpenOutlined />} onClick={() => void chooseDirectory()}>
            更改目录
          </Button>
        </div>
        {directory ? (
          <div className={styles.directoryPath}>{directory}</div>
        ) : (
          <div className={`${styles.directoryPath} ${styles.directoryEmpty}`}>未设置</div>
        )}
      </div>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>新手引导</div>
          </div>
          <Button icon={<QuestionCircleOutlined />} onClick={() => void restartGuide()}>
            重新开始
          </Button>
        </div>
      </div>
    </section>
  )
}

export default GeneralSettings
