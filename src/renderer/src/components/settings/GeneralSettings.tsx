import { useEffect, useState } from 'react'
import { FolderOpenIcon, HelpCircleIcon } from 'lucide-react'
import { Button, Segmented, useToast } from '@renderer/components/ui'
import { useGlobeStore } from '@renderer/stores/globe'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import type { ThemeMode } from '../../../../common/themeMode'
import styles from './GeneralSettings.module.css'

export interface GeneralSettingsProps {
  onRestartGuide?: () => void
}

const themeModeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' }
]

export function GeneralSettings({ onRestartGuide }: GeneralSettingsProps) {
  const toast = useToast()
  const closeSettingsWindow = useSettingsWindowStore((state) => state.close)
  const themeMode = useGlobeStore((state) => state.themeMode)
  const setThemeMode = useGlobeStore((state) => state.setThemeMode)

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
        toast.success('保存目录已更新')
      }
    } catch {
      toast.error('选择目录失败，请重试')
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
            <div className={styles.settingTitle}>外观主题</div>
            <p className={styles.settingDesc}>切换界面浅色、深色或跟随系统外观</p>
          </div>
          <Segmented<ThemeMode>
            value={themeMode}
            options={themeModeOptions}
            aria-label="外观主题"
            onChange={(value) => void setThemeMode(value)}
          />
        </div>
      </div>

      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div className={styles.settingCopy}>
            <div className={styles.settingTitle}>录制保存目录</div>
          </div>
          <Button loading={choosing} icon={<FolderOpenIcon className="size-4" />} onClick={() => void chooseDirectory()}>
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
          <Button icon={<HelpCircleIcon className="size-4" />} onClick={() => void restartGuide()}>
            重新开始
          </Button>
        </div>
      </div>
    </section>
  )
}

export default GeneralSettings
