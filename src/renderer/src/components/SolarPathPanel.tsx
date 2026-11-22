import { CaretRightOutlined, CloseOutlined, PauseOutlined } from '@ant-design/icons'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useSolarStore } from '@renderer/stores/solar'
import {
  dayLength,
  declinationForDate,
  formatClock,
  horizonCrossingsDeg,
  noonAltitudeDeg,
  solarHorizontalPositionDeg,
  type DayState
} from '@renderer/thematic/solarMath'
import { Button, DatePicker, Slider } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'

import styles from './SolarPathPanel.module.css'

export interface SolarPathPanelProps {
  onClose: () => void
}

const SVG_SIZE = 260
const CENTER = SVG_SIZE / 2
const HORIZON_RADIUS = 116
const PATH_COLOR = '#fa8c16'
const SUN_COLOR = '#fa8c16'
const NOON_COLOR = '#1677ff'
const LOCAL_HOURS_PER_SECOND = 1.5

const presets = [
  { key: 'spring-equinox', label: '春分' },
  { key: 'summer-solstice', label: '夏至' },
  { key: 'autumn-equinox', label: '秋分' },
  { key: 'winter-solstice', label: '冬至' }
] as const

const DIRECTION_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

const latitudeMarks = { '-90': '90°S', 0: '0°', 90: '90°N' }
const timeMarks = { 0: '0时', 6: '6时', 12: '12时', 18: '18时', 24: '24时' }

function polarPoint(azimuthDeg: number, altitudeDeg: number): { x: number; y: number } {
  const radius = HORIZON_RADIUS * (1 - Math.max(0, Math.min(90, altitudeDeg)) / 90)
  const angle = (azimuthDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) }
}

function directionText(azimuthDeg: number): string {
  const sector = Math.round(azimuthDeg / 45) % 8
  const offset = Math.round(azimuthDeg - sector * 45)
  if (offset === 0)
    return sector % 2 === 0 ? `正${DIRECTION_NAMES[sector]}` : DIRECTION_NAMES[sector]
  return offset > 0
    ? `${DIRECTION_NAMES[sector]}偏${DIRECTION_NAMES[(sector + 1) % 8]}${offset}°`
    : `${DIRECTION_NAMES[sector]}偏${DIRECTION_NAMES[(sector + 7) % 8]}${-offset}°`
}

function latLabel(value: number): string {
  return value === 0 ? '0°' : `${Math.abs(value)}°${value > 0 ? 'N' : 'S'}`
}

function azLabel(azimuth: number | undefined): string {
  return azimuth === undefined ? '—' : `${azimuth.toFixed(0)}°（${directionText(azimuth)}）`
}

export function SolarPathPanel({ onClose }: SolarPathPanelProps) {
  const date = useSolarStore(state => state.date)
  const parts = useSolarStore(state => state.parts)
  const setPreset = useSolarStore(state => state.setPreset)
  const setDate = useSolarStore(state => state.setDate)

  const [latitude, setLatitude] = useState(40)
  const [localHour, setLocalHour] = useState(10)
  const [isPlaying, setIsPlaying] = useState(false)

  const dateValue = useMemo(() => dayjs(date), [date])
  const declination = useMemo(
    () => declinationForDate(parts.month, parts.day),
    [parts.month, parts.day]
  )
  const length = useMemo(() => dayLength(latitude, declination), [latitude, declination])
  const crossings = useMemo(
    () => horizonCrossingsDeg(latitude, declination),
    [latitude, declination]
  )
  const noonPosition = useMemo(
    () => solarHorizontalPositionDeg(latitude, declination, 12),
    [latitude, declination]
  )
  const sunNow = useMemo(
    () => solarHorizontalPositionDeg(latitude, declination, localHour),
    [latitude, declination, localHour]
  )

  const pathPoints = useMemo(() => {
    if (length.state === 'polar-night') return ''
    const points: Array<{ x: number; y: number }> = []
    for (let t = 0; t <= 24.001; t += 0.1) {
      const position = solarHorizontalPositionDeg(latitude, declination, t)
      if (position.altitudeDeg > 0.3)
        points.push(polarPoint(position.azimuthDeg, position.altitudeDeg))
    }
    if (length.state === 'polar-day' && points.length > 1) points.push(points[0])
    return points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
      )
      .join(' ')
  }, [length.state, latitude, declination])

  const sunDot = useMemo(
    () => (sunNow.altitudeDeg > -0.3 ? polarPoint(sunNow.azimuthDeg, sunNow.altitudeDeg) : null),
    [sunNow.altitudeDeg, sunNow.azimuthDeg]
  )
  const noonDot = useMemo(
    () =>
      noonPosition.altitudeDeg > 0
        ? polarPoint(noonPosition.azimuthDeg, noonPosition.altitudeDeg)
        : null,
    [noonPosition.altitudeDeg, noonPosition.azimuthDeg]
  )
  const sunriseDot = useMemo(
    () =>
      crossings.state === 'normal' && crossings.sunriseAzimuthDeg !== undefined
        ? polarPoint(crossings.sunriseAzimuthDeg, 0)
        : null,
    [crossings.state, crossings.sunriseAzimuthDeg]
  )
  const sunsetDot = useMemo(
    () =>
      crossings.state === 'normal' && crossings.sunsetAzimuthDeg !== undefined
        ? polarPoint(crossings.sunsetAzimuthDeg, 0)
        : null,
    [crossings.state, crossings.sunsetAzimuthDeg]
  )

  const noonSkyText = useMemo(() => {
    if (noonPosition.altitudeDeg > 89) return '太阳位于天顶'
    return noonPosition.azimuthDeg <= 22.5 || noonPosition.azimuthDeg >= 337.5
      ? '正午太阳位于正北天空'
      : '正午太阳位于正南天空'
  }, [noonPosition.altitudeDeg, noonPosition.azimuthDeg])

  const stateText = useMemo(() => {
    const state: DayState = length.state
    if (state === 'polar-day') return '当日极昼：太阳整日不落，轨迹为完整圆环'
    if (state === 'polar-night') return '当日极夜：太阳始终位于地平圈以下，无视运动轨迹'
    return ''
  }, [length.state])

  useVisibleAnimation(isPlaying, dt => {
    if (dt > 0) setLocalHour(prev => (prev + dt * LOCAL_HOURS_PER_SECOND) % 24)
  })

  function handleDateChange(value: Dayjs | null): void {
    if (value) setDate(value.format('YYYY-MM-DD'))
  }

  return (
    <div className={styles.solarPathPanel} role='group' aria-label='太阳视运动轨迹'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>太阳视运动轨迹</span>
        <span className={styles.panelSubtitle}>{date}</span>
        <Button
          type='text'
          size='small'
          aria-label='关闭太阳视运动轨迹'
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </div>
      <div className={styles.presetRow}>
        {presets.map(preset => (
          <Button key={preset.key} size='small' onClick={() => setPreset(preset.key)}>
            {preset.label}
          </Button>
        ))}
        <DatePicker
          value={dateValue}
          size='small'
          format='M月D日'
          allowClear={false}
          aria-label='观察日期'
          onChange={handleDateChange}
        />
      </div>
      <div className={styles.latitudeRow}>
        <span className={styles.rowLabel}>观察点纬度</span>
        <Slider
          value={latitude}
          min={-90}
          max={90}
          step={1}
          marks={latitudeMarks}
          className={styles.latitudeSlider}
          ariaLabelForHandle='观察点纬度'
          onChange={value => setLatitude(value)}
        />
        <span className={styles.rowValue}>{latLabel(latitude)}</span>
      </div>
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className={styles.skyDome}
        role='img'
        aria-label='太阳视运动轨迹天穹图，外圈为地平圈，圆心为天顶'
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={HORIZON_RADIUS}
          fill='rgba(0, 0, 0, 0.02)'
          stroke='rgba(0, 0, 0, 0.45)'
          strokeWidth='1.5'
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={(HORIZON_RADIUS * 2) / 3}
          fill='none'
          stroke='rgba(0, 0, 0, 0.08)'
          strokeDasharray='3 4'
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={HORIZON_RADIUS / 3}
          fill='none'
          stroke='rgba(0, 0, 0, 0.08)'
          strokeDasharray='3 4'
        />
        <text x={CENTER} y={16} className={styles.directionLabel}>
          北
        </text>
        <text x={SVG_SIZE - 16} y={CENTER + 4} className={styles.directionLabel}>
          东
        </text>
        <text x={CENTER} y={SVG_SIZE - 6} className={styles.directionLabel}>
          南
        </text>
        <text x={16} y={CENTER + 4} className={styles.directionLabel}>
          西
        </text>
        <text x={CENTER + 5} y={CENTER - 5} className={styles.zenithLabel}>
          天顶
        </text>
        {pathPoints && <path d={pathPoints} fill='none' stroke={PATH_COLOR} strokeWidth='2.5' />}
        {sunriseDot && (
          <g>
            <circle
              cx={sunriseDot.x}
              cy={sunriseDot.y}
              r='4'
              fill='#faad14'
              stroke='#ffffff'
              strokeWidth='1.5'
            />
            <text x={sunriseDot.x + 7} y={sunriseDot.y + 4} className={styles.markerLabel}>
              日出
            </text>
          </g>
        )}
        {sunsetDot && (
          <g>
            <circle
              cx={sunsetDot.x}
              cy={sunsetDot.y}
              r='4'
              fill='#faad14'
              stroke='#ffffff'
              strokeWidth='1.5'
            />
            <text x={sunsetDot.x + 7} y={sunsetDot.y + 4} className={styles.markerLabel}>
              日落
            </text>
          </g>
        )}
        {noonDot && (
          <g>
            <circle
              cx={noonDot.x}
              cy={noonDot.y}
              r='3.5'
              fill='none'
              stroke={NOON_COLOR}
              strokeWidth='1.5'
            />
            <text x={noonDot.x + 7} y={noonDot.y - 5} className={styles.markerLabel}>
              正午
            </text>
          </g>
        )}
        {sunDot && (
          <g>
            <circle
              cx={sunDot.x}
              cy={sunDot.y}
              r='7'
              fill='none'
              stroke={SUN_COLOR}
              strokeWidth='1'
              opacity='0.4'
            />
            <circle
              cx={sunDot.x}
              cy={sunDot.y}
              r='5'
              fill={SUN_COLOR}
              stroke='#ffffff'
              strokeWidth='1.5'
            />
          </g>
        )}
        {length.state !== 'polar-night' && (
          <text x={CENTER} y={SVG_SIZE - 24} className={styles.hintLabel}>
            外圈=地平圈 · 圆心=天顶 · 虚线圈=高度30°/60°
          </text>
        )}
      </svg>
      {stateText && <div className={styles.stateText}>{stateText}</div>}
      <div className={styles.readoutGrid}>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>日出方位</span>
          <span className={styles.readoutValue}>{azLabel(crossings.sunriseAzimuthDeg)}</span>
        </div>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>日落方位</span>
          <span className={styles.readoutValue}>{azLabel(crossings.sunsetAzimuthDeg)}</span>
        </div>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>正午太阳高度</span>
          <span className={styles.readoutValue}>
            {noonAltitudeDeg(latitude, declination).toFixed(0)}°
          </span>
        </div>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>正午太阳方位</span>
          <span className={styles.readoutValue}>{noonSkyText}</span>
        </div>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>昼长</span>
          <span className={styles.readoutValue}>{length.hours.toFixed(1)} 小时</span>
        </div>
        <div className={styles.readoutItem}>
          <span className={styles.readoutLabel}>直射点纬度</span>
          <span className={styles.readoutValue}>
            {Math.abs(declination).toFixed(1)}°{declination >= 0 ? 'N' : 'S'}
          </span>
        </div>
      </div>
      <div className={styles.timeRow}>
        <Button
          type={isPlaying ? 'primary' : 'default'}
          shape='circle'
          size='small'
          aria-label={isPlaying ? '暂停视运动演示' : '播放视运动演示'}
          icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
          onClick={() => setIsPlaying(prev => !prev)}
        />
        <Slider
          value={localHour}
          min={0}
          max={24}
          step={0.25}
          marks={timeMarks}
          className={styles.timeSlider}
          ariaLabelForHandle='地方时'
          onChange={value => setLocalHour(value)}
        />
        <span className={styles.rowValue}>地方时 {formatClock(localHour)}</span>
      </div>
      <div className={styles.panelNote}>
        轨迹形状由纬度与日期决定；调整日期会同步球面晨昏线模拟。
      </div>
    </div>
  )
}

export default SolarPathPanel
