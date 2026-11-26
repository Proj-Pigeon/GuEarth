import { Button, Segmented, Slider } from '@renderer/components/ui'
import { useSolarStore } from '@renderer/stores/solar'
import {
  dayLength,
  declinationForDate,
  monthStartDayOfYear,
  noonAltitudeDeg,
  solarDeclinationDeg
} from '@renderer/thematic/solarMath'
import { XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import LineChart from './charts/LineChart'
import type { ChartSeries } from './charts/LineChart'

import styles from './SolarChartPanel.module.css'

export interface SolarChartPanelProps {
  className?: string
  onClose: () => void
}

const DAY_LENGTH_COLOR = '#1677ff'
const ALTITUDE_COLOR = '#fa8c16'

const monthStarts = monthStartDayOfYear()

const modeOptions = [
  { value: 'latitude', label: '随纬度' },
  { value: 'date', label: '随日期' }
]

const latitudeMarks = { '-90': '90°S', 0: '0°', 90: '90°N' }

function latLabel(value: number): string {
  return `${Math.abs(value)}°${value > 0 ? 'N' : value < 0 ? 'S' : ''}`
}

const latitudeFormatter = (value: number): string =>
  value === 0 ? '0°' : `${Math.abs(value)}°${value > 0 ? 'N' : 'S'}`

const dateFormatter = (value: number): string => {
  const index = monthStarts.findIndex(
    (start, i) => value >= start && value < (monthStarts[i + 1] ?? 366)
  )
  return index === -1 ? '' : `${index + 1}月`
}

export function SolarChartPanel({ className, onClose }: SolarChartPanelProps) {
  const date = useSolarStore(state => state.date)
  const parts = useSolarStore(state => state.parts)
  const [mode, setMode] = useState<'latitude' | 'date'>('latitude')
  const [latitude, setLatitude] = useState(40)

  const declination = useMemo(
    () => declinationForDate(parts.month, parts.day),
    [parts.month, parts.day]
  )
  const declinationText = `${Math.abs(declination).toFixed(1)}°${declination >= 0 ? 'N' : 'S'}`

  const dayLengthSeries = useMemo<ChartSeries[]>(() => {
    if (mode === 'latitude') {
      const points: [number, number][] = []
      for (let lat = -90; lat <= 90; lat += 2) {
        points.push([lat, dayLength(lat, declination).hours])
      }
      return [{ name: '昼长', color: DAY_LENGTH_COLOR, points, markY: [12] }]
    }
    const points: [number, number][] = []
    for (let day = 1; day <= 365; day += 2) {
      points.push([day, dayLength(latitude, solarDeclinationDeg(day)).hours])
    }
    return [{ name: `昼长（${latLabel(latitude)}）`, color: DAY_LENGTH_COLOR, points, markY: [12] }]
  }, [mode, declination, latitude])

  const altitudeSeries = useMemo<ChartSeries[]>(() => {
    if (mode === 'latitude') {
      const points: [number, number][] = []
      for (let lat = -90; lat <= 90; lat += 2) {
        points.push([lat, noonAltitudeDeg(lat, declination)])
      }
      return [{ name: '正午太阳高度', color: ALTITUDE_COLOR, points, markY: [0] }]
    }
    const points: [number, number][] = []
    for (let day = 1; day <= 365; day += 2) {
      points.push([day, noonAltitudeDeg(latitude, solarDeclinationDeg(day))])
    }
    return [
      { name: `正午太阳高度（${latLabel(latitude)}）`, color: ALTITUDE_COLOR, points, markY: [0] }
    ]
  }, [mode, declination, latitude])

  const dayLengthTitle = mode === 'latitude' ? `昼长随纬度变化（${date}）` : '昼长随日期变化'
  const altitudeTitle =
    mode === 'latitude' ? `正午太阳高度随纬度变化（${date}）` : '正午太阳高度随日期变化'
  const rootClassName = className
    ? `${styles.solarChartPanel} ${className}`
    : styles.solarChartPanel

  return (
    <div className={rootClassName}>
      <div className={styles.chartHeader}>
        <Segmented
          value={mode}
          size='sm'
          options={modeOptions}
          aria-label='曲线模式'
          onChange={value => setMode(value as 'latitude' | 'date')}
        />
        <span className={styles.declination}>太阳直射点 {declinationText}</span>
        <Button
          variant='ghost'
          size='sm'
          aria-label='关闭曲线面板'
          icon={<XIcon className='size-3.5' />}
          onClick={onClose}
        />
      </div>
      {mode === 'date' && (
        <div className={styles.latitudeRow}>
          <span className={styles.latitudeLabel}>纬度</span>
          <Slider
            value={latitude}
            min={-90}
            max={90}
            step={5}
            marks={latitudeMarks}
            className={styles.latitudeSlider}
            aria-label='纬度选择'
            onChange={value => setLatitude(value)}
          />
          <span className={styles.latitudeValue}>{latLabel(latitude)}</span>
        </div>
      )}
      <div className={styles.chartTitle}>{dayLengthTitle}</div>
      <LineChart
        series={dayLengthSeries}
        xMin={mode === 'latitude' ? -90 : 1}
        xMax={mode === 'latitude' ? 90 : 365}
        xName={mode === 'latitude' ? '纬度' : '日期'}
        xFormatter={mode === 'latitude' ? latitudeFormatter : dateFormatter}
        yName='小时'
        yMin={0}
        yMax={24}
        height={168}
      />
      <div className={styles.chartTitle}>{altitudeTitle}</div>
      <LineChart
        series={altitudeSeries}
        xMin={mode === 'latitude' ? -90 : 1}
        xMax={mode === 'latitude' ? 90 : 365}
        xName={mode === 'latitude' ? '纬度' : '日期'}
        xFormatter={mode === 'latitude' ? latitudeFormatter : dateFormatter}
        yName='度'
        yMin={-90}
        yMax={90}
        height={168}
      />
    </div>
  )
}

export default SolarChartPanel
