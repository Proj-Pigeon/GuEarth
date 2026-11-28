import { Button, MonthDayPicker, Slider, Tooltip } from '@renderer/components/ui'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useClimateStore } from '@renderer/stores/climate'
import { useFlightStopsStore } from '@renderer/stores/flightStops'
import { useSolarStore } from '@renderer/stores/solar'
import type * as Cesium from 'cesium'
import { LineChartIcon, PauseIcon, PlayIcon, RepeatIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import styles from './SolarTimePanel.module.css'

export interface SolarTimePanelProps {
  viewer?: Cesium.Viewer
  renderChart?: (props: { onClose: () => void }) => ReactNode
}

const presets = [
  { key: 'spring-equinox', label: '春分' },
  { key: 'summer-solstice', label: '夏至' },
  { key: 'autumn-equinox', label: '秋分' },
  { key: 'winter-solstice', label: '冬至' }
] as const

const marks = { 0: '0时', 6: '6时', 12: '12时', 18: '18时', 24: '24时' }

export function SolarTimePanel({ viewer, renderChart }: SolarTimePanelProps) {
  const active = useSolarStore(state => state.active)
  const date = useSolarStore(state => state.date)
  const hour = useSolarStore(state => state.hour)
  const isPlaying = useSolarStore(state => state.isPlaying)
  const isAnnualPlaying = useSolarStore(state => state.isAnnualPlaying)
  const beijingClock = useSolarStore(state => state.beijingClock)
  const utcClock = useSolarStore(state => state.utcClock)
  const advance = useSolarStore(state => state.advance)
  const togglePlaying = useSolarStore(state => state.togglePlaying)
  const toggleAnnualPlaying = useSolarStore(state => state.toggleAnnualPlaying)
  const setDate = useSolarStore(state => state.setDate)
  const setPreset = useSolarStore(state => state.setPreset)
  const setHour = useSolarStore(state => state.setHour)

  const hasActiveOverlay = useClimateStore(state => state.hasActiveOverlay)
  const flightStopsVisible = useFlightStopsStore(state => state.visible)

  const [chartOpen, setChartOpen] = useState(false)

  useVisibleAnimation(active && (isPlaying || isAnnualPlaying), dt => {
    if (dt > 0) {
      advance(dt)
    }
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender()
    }
  })

  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender()
    }
  }, [date, hour, active, viewer])

  if (!active) {
    return null
  }

  const panelClasses = [
    styles.solarPanel,
    hasActiveOverlay ? styles.solarPanelStacked : '',
    flightStopsVisible ? styles.solarPanelFlightStacked : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={panelClasses} role='group' aria-label='太阳光照时间轴'>
      <Button
        variant={isPlaying ? 'primary' : 'default'}
        shape='circle'
        aria-label={isPlaying ? '暂停时间流逝' : '播放昼夜交替'}
        icon={isPlaying ? <PauseIcon className='size-3.5' /> : <PlayIcon className='size-3.5' />}
        onClick={togglePlaying}
      />
      <Tooltip title='直射点回归运动（按年推进日期）'>
        <Button
          variant={isAnnualPlaying ? 'primary' : 'default'}
          shape='circle'
          aria-label={isAnnualPlaying ? '暂停直射点回归运动' : '播放直射点回归运动'}
          icon={
            isAnnualPlaying ? (
              <PauseIcon className='size-3.5' />
            ) : (
              <RepeatIcon className='size-3.5' />
            )
          }
          onClick={toggleAnnualPlaying}
        />
      </Tooltip>
      <MonthDayPicker value={date} aria-label='模拟日期' onChange={setDate} />
      {presets.map(preset => (
        <Button key={preset.key} size='sm' onClick={() => setPreset(preset.key)}>
          {preset.label}
        </Button>
      ))}
      <div className={styles.clockReadout}>
        <span className={styles.clockPrimary}>北京 {beijingClock}</span>
        <span className={styles.clockSecondary}>UTC {utcClock}</span>
      </div>
      <Tooltip title='昼夜规律曲线'>
        <Button
          variant={chartOpen ? 'primary' : 'ghost'}
          size='sm'
          aria-label='昼夜规律曲线'
          icon={<LineChartIcon className='size-3.5' />}
          onClick={() => setChartOpen(open => !open)}
        />
      </Tooltip>
      <Slider
        value={hour}
        min={0}
        max={24}
        step={0.25}
        marks={marks}
        className={styles.hourSlider}
        aria-label='模拟时刻（北京时间）'
        onChange={(value: number) => setHour(value)}
      />
      {chartOpen && renderChart ? (
        <div className={styles.chartAnchor}>
          {renderChart({ onClose: () => setChartOpen(false) })}
        </div>
      ) : null}
    </div>
  )
}

export default SolarTimePanel
