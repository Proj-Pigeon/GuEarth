import { useMemo } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui'
import type { TimezoneComparison } from '@renderer/composables/useTimezoneCompare'
import { useSolarStore } from '@renderer/stores/solar'
import { formatClock, localSolarTime } from '@renderer/thematic/solarMath'
import styles from './TimezonePanel.module.css'

export interface TimezonePanelProps {
  comparison: TimezoneComparison
  onClear: () => void
}

function longitudeText(longitude: number): string {
  return `${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`
}

export function TimezonePanel({ comparison, onClear }: TimezonePanelProps) {
  const solarActive = useSolarStore((state) => state.active)
  const solarUtcHour = useSolarStore((state) => state.utcHour)
  const beijingClock = useSolarStore((state) => state.beijingClock)

  const utcHours = useMemo(() => {
    if (solarActive) {return solarUtcHour}
    const now = new Date()
    return now.getUTCHours() + now.getUTCMinutes() / 60
  }, [solarActive, solarUtcHour])

  const timeSourceText = solarActive ? `按模拟时刻计算（北京 ${beijingClock}）` : '按当前真实时刻计算'

  const differenceText = useMemo(() => {
    const difference = comparison.differenceHours
    if (Math.abs(difference) < 1 / 60) {return '两地经度相近，地方时基本相同'}
    const abs = Math.abs(difference)
    const hours = Math.floor(abs)
    const minutes = Math.round((abs - hours) * 60)
    const duration = minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
    return `B 地比 A 地${difference > 0 ? '早' : '晚'} ${duration}（东早西晚）`
  }, [comparison.differenceHours])

  function pickTime(longitude: number): string {
    return formatClock(localSolarTime(utcHours, longitude))
  }

  return (
    <div className={styles.timezonePanel} aria-label="时区对比">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>地方时对比</span>
        <Button variant="ghost" size="sm" aria-label="关闭时区对比" icon={<XIcon className="size-3.5" />} onClick={onClear} />
      </div>
      <div className={styles.pickRow}>
        <span className={`${styles.pickDot} ${styles.pickA}`} />
        <span className={styles.pickName}>A 地</span>
        <span className={styles.pickValue}>{longitudeText(comparison.picks[0].longitude)}</span>
        <span className={styles.pickTime}>{pickTime(comparison.picks[0].longitude)}</span>
      </div>
      <div className={styles.pickRow}>
        <span className={`${styles.pickDot} ${styles.pickB}`} />
        <span className={styles.pickName}>B 地</span>
        <span className={styles.pickValue}>{longitudeText(comparison.picks[1].longitude)}</span>
        <span className={styles.pickTime}>{pickTime(comparison.picks[1].longitude)}</span>
      </div>
      <div className={styles.difference}>{differenceText}</div>
      <div className={styles.hint}>{timeSourceText}</div>
      <div className={styles.divider} />
      <p className={styles.note}>地球自西向东自转，同纬度偏东地点先见日出，地方时更早。地方时 = UTC + 经度 ÷ 15。</p>
      <p className={styles.note}>
        日界线有两条：180° 经线为人为日界线（自西向东越过日期减一天）；地方时 0 时所在经线为自然日界线（自西向东越过日期加一天）。
      </p>
    </div>
  )
}

export default TimezonePanel
