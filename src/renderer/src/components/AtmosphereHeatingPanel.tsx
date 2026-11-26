import { useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button, Segmented, Tag } from '@renderer/components/ui'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'
import styles from './AtmosphereHeatingPanel.module.css'

export interface AtmosphereHeatingPanelProps {
  onClose: () => void
}

type Period = 'day' | 'night'
type CloudCover = 'clear' | 'cloudy'

interface RadiatorArrow {
  d: string
  color: string
  width?: number
  dashed?: boolean
  marker: string
  label?: string
  labelAt?: [number, number]
  labelAnchor?: 'start' | 'middle' | 'end'
}

const SOLAR = dc.energy
const GROUND_RADIATION = dc.heatRadiation
const COUNTER_RADIATION = dc.counterRadiation

const periodOptions = [
  { value: 'day', label: '白天' },
  { value: 'night', label: '夜晚' }
]

const cloudOptions = [
  { value: 'clear', label: '晴朗' },
  { value: 'cloudy', label: '多云' }
]

const legendItems = [
  { color: SOLAR, name: '太阳短波辐射' },
  { color: GROUND_RADIATION, name: '地面长波辐射' },
  { color: COUNTER_RADIATION, name: '大气逆辐射' }
]

const keyPoints = [
  '太阳辐射是地球上最主要的能量来源',
  '大气对太阳辐射的削弱作用：吸收、反射、散射',
  '地面吸收太阳辐射增温后产生地面辐射，加热近地面大气——地面是近地面大气主要的直接热源',
  '大气逆辐射把热量还给地面，对地面起保温作用（温室效应原理类似）'
]

export function AtmosphereHeatingPanel({ onClose }: AtmosphereHeatingPanelProps) {
  const [period, setPeriod] = useState<Period>('day')
  const [cloud, setCloud] = useState<CloudCover>('clear')

  const stateLabel = `${period === 'day' ? '白天' : '夜晚'}·${cloud === 'clear' ? '晴朗' : '多云'}`
  const groundText = period === 'day' ? '地面（吸收太阳辐射而增温）' : '地面（向外辐射散热降温）'

  const arrows = useMemo<RadiatorArrow[]>(() => {
    const isDay = period === 'day'
    const isCloudy = cloud === 'cloudy'
    const list: RadiatorArrow[] = []
    if (isDay) {
      if (isCloudy) {
        list.push(
          { d: 'M 56 44 L 200 52', color: SOLAR, width: 2.4, marker: 'solar', label: '太阳辐射', labelAt: [116, 30] },
          { d: 'M 214 48 Q 258 30 280 20', color: SOLAR, width: 1.6, dashed: true, marker: 'solar', label: '云层反射', labelAt: [254, 14] },
          { d: 'M 58 52 L 84 166', color: SOLAR, width: 1.4, dashed: true, marker: 'solar', label: '云隙透过', labelAt: [72, 140], labelAnchor: 'end' }
        )
      } else {
        list.push(
          { d: 'M 56 44 L 160 166', color: SOLAR, width: 2.6, marker: 'solar', label: '太阳辐射', labelAt: [118, 92], labelAnchor: 'start' },
          { d: 'M 76 68 L 116 52', color: SOLAR, width: 1.4, dashed: true, marker: 'solar', label: '大气削弱', labelAt: [122, 52], labelAnchor: 'start' }
        )
      }
    }
    if (isCloudy) {
      list.push(
        { d: 'M 170 166 L 170 72', color: GROUND_RADIATION, width: 2.2, marker: 'ground', label: '地面辐射', labelAt: [162, 124], labelAnchor: 'end' },
        { d: 'M 260 166 L 260 72', color: GROUND_RADIATION, width: 1.6, marker: 'ground' }
      )
    } else {
      list.push(
        { d: 'M 130 166 L 130 92', color: GROUND_RADIATION, width: 2.2, marker: 'ground', label: '地面辐射', labelAt: [122, 140], labelAnchor: 'end' },
        { d: 'M 300 166 L 300 34', color: GROUND_RADIATION, width: 1.4, dashed: true, marker: 'ground', label: '逸散到宇宙', labelAt: [294, 26], labelAnchor: 'end' }
      )
    }
    if (period === 'night' && isCloudy) {
      list.push({
        d: 'M 210 92 L 203 166',
        color: COUNTER_RADIATION,
        width: 3.4,
        marker: 'counter',
        label: '大气逆辐射强',
        labelAt: [206, 86]
      })
    } else if (period === 'night' && !isCloudy) {
      list.push({
        d: 'M 166 100 L 158 166',
        color: COUNTER_RADIATION,
        width: 1.4,
        marker: 'counter',
        label: '大气逆辐射弱',
        labelAt: [172, 128],
        labelAnchor: 'start'
      })
    } else if (isCloudy) {
      list.push({
        d: 'M 210 92 L 203 166',
        color: COUNTER_RADIATION,
        width: 1.8,
        marker: 'counter',
        label: '大气逆辐射',
        labelAt: [206, 86]
      })
    } else {
      list.push({
        d: 'M 172 96 L 162 166',
        color: COUNTER_RADIATION,
        width: 1.8,
        marker: 'counter',
        label: '大气逆辐射',
        labelAt: [178, 128],
        labelAnchor: 'start'
      })
    }
    return list
  }, [period, cloud])

  const stateConclusion = useMemo(() => {
    if (period === 'day') {
      return cloud === 'clear'
        ? '晴天大气对太阳辐射削弱少，到达地面的太阳辐射多，气温升高快。'
        : '多云时云层反射太阳辐射，削弱作用强，到达地面的太阳辐射少，气温不会太高。'
    }
    return cloud === 'clear'
      ? '晴朗夜晚云少，大气吸收地面辐射少、逆辐射弱，地面散热快、气温低——深秋寒霜多发生在晴朗夜间。'
      : '多云夜晚云吸收地面辐射多、逆辐射强，保温作用强，气温不会太低。'
  }, [period, cloud])

  const labeledArrows = useMemo(() => arrows.filter((item) => item.label && item.labelAt), [arrows])

  return (
    <div className={styles.heatingPanel} role="group" aria-label="大气受热过程演示">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>大气受热过程</span>
        <Button variant="ghost" size="sm" aria-label="关闭大气受热过程" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>
      <div className={styles.controlRow}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>昼夜</span>
          <Segmented
            value={period}
            size="sm"
            options={periodOptions}
            aria-label="昼夜"
            onChange={(value) => setPeriod(value as Period)}
          />
        </div>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>云量</span>
          <Segmented
            value={cloud}
            size="sm"
            options={cloudOptions}
            aria-label="云量"
            onChange={(value) => setCloud(value as CloudCover)}
          />
        </div>
      </div>
      <svg
        viewBox="0 0 360 200"
        className={styles.heatingSvg}
        role="img"
        aria-label="大气受热过程示意图：太阳辐射、地面辐射与大气逆辐射"
      >
        <defs>
          <linearGradient id="ah-sky-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d6ecff" />
            <stop offset="100%" stopColor="#f4faff" />
          </linearGradient>
          <linearGradient id="ah-sky-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d2b4d" />
            <stop offset="100%" stopColor="#3a4a6b" />
          </linearGradient>
          <linearGradient id="ah-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8c9a0" />
            <stop offset="100%" stopColor="#c9a06c" />
          </linearGradient>
          <radialGradient id="ah-sun" cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#ffd666" />
            <stop offset="100%" stopColor={dc.sun} />
          </radialGradient>
          <marker id="ah-solar" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={SOLAR} />
          </marker>
          <marker id="ah-ground-m" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={GROUND_RADIATION} />
          </marker>
          <marker id="ah-counter" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={COUNTER_RADIATION} />
          </marker>
        </defs>
        <rect
          x="0"
          y="0"
          width="360"
          height="170"
          fill={period === 'day' ? 'url(#ah-sky-day)' : 'url(#ah-sky-night)'}
          className={styles.skyFade}
        />
        <text
          x="10"
          y="16"
          className={styles.spaceLabel}
          fill={period === 'day' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)'}
        >
          宇宙空间
        </text>
        {period === 'night' && (
          <g fill="rgba(255,255,255,0.75)">
            <circle cx="120" cy="26" r="1.2" />
            <circle cx="186" cy="14" r="1" />
            <circle cx="262" cy="30" r="1.2" />
            <circle cx="320" cy="18" r="1" />
          </g>
        )}
        {period === 'day' ? (
          <g>
            <circle cx="44" cy="36" r="14" fill="url(#ah-sun)" opacity="0.35" />
            <circle cx="44" cy="36" r="9" fill="url(#ah-sun)" />
          </g>
        ) : (
          <g>
            <circle cx="44" cy="36" r="9" fill="#e8e8e8" />
            <circle cx="48" cy="33" r="8" fill="#2c3a5c" />
          </g>
        )}
        {cloud === 'cloudy' && (
          <g className={styles.cloudGroup}>
            <ellipse
              cx="218"
              cy="54"
              rx="34"
              ry="12"
              fill={period === 'day' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.16)'}
            />
            <ellipse
              cx="195"
              cy="60"
              rx="20"
              ry="9"
              fill={period === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}
            />
            <ellipse
              cx="245"
              cy="60"
              rx="22"
              ry="9"
              fill={period === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}
            />
            <text
              x="218"
              y="34"
              textAnchor="middle"
              className={styles.spaceLabel}
              fill={period === 'day' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'}
            >
              云层
            </text>
          </g>
        )}
        {arrows.map((arrow, index) => (
          <path
            key={`r-${index}`}
            d={arrow.d}
            fill="none"
            stroke={arrow.color}
            strokeWidth={arrow.width}
            strokeDasharray={arrow.dashed ? '5 4' : undefined}
            markerEnd={`url(#ah-${arrow.marker === 'ground' ? 'ground-m' : arrow.marker})`}
            strokeLinecap="round"
          />
        ))}
        {labeledArrows.map((arrow, index) => (
          <text
            key={`t-${index}`}
            x={arrow.labelAt![0]}
            y={arrow.labelAt![1]}
            textAnchor={arrow.labelAnchor ?? 'middle'}
            className={period === 'night' ? `${styles.arrowLabel} ${styles.arrowLabelDark}` : styles.arrowLabel}
            fill={arrow.color}
            fontFamily={diagramFont}
          >
            {arrow.label}
          </text>
        ))}
        <rect x="0" y="170" width="360" height="30" fill="url(#ah-ground)" />
        <line x1="0" y1="170" x2="360" y2="170" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="1.5" />
        <text x="180" y="188" textAnchor="middle" className={styles.groundLabel}>
          {groundText}
        </text>
      </svg>
      <div className={styles.legendRow}>
        {legendItems.map((item) => (
          <span key={item.name} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
      <div className={styles.conclusionRow}>
        <Tag className={styles.stateTag}>{stateLabel}</Tag>
        <span className={styles.conclusionText}>{stateConclusion}</span>
      </div>
      <div className={styles.keyPoints}>
        <div className={styles.sectionTitle}>要点回顾</div>
        <ul className={styles.pointList}>
          {keyPoints.map((point) => (
            <li key={point} className={styles.pointItem}>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default AtmosphereHeatingPanel
