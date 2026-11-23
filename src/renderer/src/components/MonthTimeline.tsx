import { useEffect } from 'react'
import { Button, Slider } from 'antd'
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons'
import type * as Cesium from 'cesium'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useClimateStore } from '@renderer/stores/climate'
import { useFlightStopsStore } from '@renderer/stores/flightStops'
import styles from './MonthTimeline.module.css'

export interface MonthTimelineProps {
  viewer?: Cesium.Viewer
}

const marks = { 1: '1月', 3: '3月', 5: '5月', 7: '7月', 9: '9月', 11: '11月', 12: '12月' }

export function MonthTimeline({ viewer }: MonthTimelineProps) {
  const month = useClimateStore((state) => state.month)
  const isPlaying = useClimateStore((state) => state.isPlaying)
  const hasSeasonalOverlay = useClimateStore((state) => state.hasSeasonalOverlay)
  const summerStrength = useClimateStore((state) => state.summerStrength)
  const winterStrength = useClimateStore((state) => state.winterStrength)
  const advance = useClimateStore((state) => state.advance)
  const togglePlaying = useClimateStore((state) => state.togglePlaying)
  const setMonth = useClimateStore((state) => state.setMonth)
  const flightStopsVisible = useFlightStopsStore((state) => state.visible)

  useVisibleAnimation(isPlaying && hasSeasonalOverlay, (dt) => {
    if (dt > 0) advance(dt)
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
  })

  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
  }, [month, viewer])

  if (!hasSeasonalOverlay) return null

  const displayMonth = Math.min(12, Math.floor(month))
  const seasonText =
    summerStrength > 0.6
      ? '夏季风盛行'
      : winterStrength > 0.6
        ? '冬季风强盛'
        : summerStrength >= winterStrength
          ? '夏季风增强'
          : '冬季风增强'

  return (
    <div
      className={
        flightStopsVisible
          ? `${styles.monthTimeline} ${styles.monthTimelineStacked}`
          : styles.monthTimeline
      }
      role="group"
      aria-label="月份时间轴"
    >
      <Button
        type={isPlaying ? 'primary' : 'default'}
        shape="circle"
        aria-label={isPlaying ? '暂停月份播放' : '播放月份动画'}
        icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
        onClick={togglePlaying}
      />
      <div className={styles.monthReadout}>
        <span className={styles.monthValue}>{displayMonth} 月</span>
        <span className={styles.seasonText}>{seasonText}</span>
      </div>
      <Slider
        value={displayMonth}
        min={1}
        max={12}
        step={1}
        marks={marks}
        className={styles.monthSlider}
        ariaLabelForHandle="月份选择"
        onChange={(value: number) => setMonth(value)}
      />
    </div>
  )
}

export default MonthTimeline
