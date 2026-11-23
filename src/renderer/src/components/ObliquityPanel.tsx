import { useMemo, useState } from 'react'
import { CloseOutlined, UndoOutlined } from '@ant-design/icons'
import { Button, Slider } from 'antd'
import styles from './ObliquityPanel.module.css'

export interface ObliquityPanelProps {
  onClose: () => void
}

const REAL_OBLIQUITY = 23.5
const CURVE_WIDTH = 292
const CURVE_HEIGHT = 128
const CURVE_TOP_PAD = 6
const BAR_HEIGHT = 208
const BAR_WIDTH = 22
const TROPIC_COLOR = '#fa8c16'
const TEMPERATE_COLOR = '#52c41a'
const FRIGID_COLOR = '#1677ff'

const SEASON_MARKS = [
  { day: 80, label: '春分' },
  { day: 172, label: '夏至' },
  { day: 266, label: '秋分' },
  { day: 355, label: '冬至' }
]

const obliquityMarks = { 0: '0°', 23.5: '23.5°', 45: '45°' }

interface ZoneSegment {
  name: string
  south: number
  north: number
  color: string
  labelable: boolean
}

function curveY(latitude: number): number {
  const usableHeight = CURVE_HEIGHT - CURVE_TOP_PAD * 2
  return CURVE_TOP_PAD + ((90 - latitude) / 180) * usableHeight
}

function barY(latitude: number): number {
  return ((90 - latitude) / 180) * BAR_HEIGHT
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function ObliquityPanel({ onClose }: ObliquityPanelProps) {
  const [obliquity, setObliquity] = useState(REAL_OBLIQUITY)

  const curvePoints = useMemo(() => {
    const usableHeight = CURVE_HEIGHT - CURVE_TOP_PAD * 2
    const points: string[] = []
    for (let day = 1; day <= 365; day += 2) {
      const declination = obliquity * Math.sin(((360 * (284 + day)) / 365) * (Math.PI / 180))
      const x = ((day - 1) / 365) * CURVE_WIDTH
      const y = CURVE_TOP_PAD + ((90 - declination) / 180) * usableHeight
      points.push(`${points.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return points.join(' ')
  }, [obliquity])

  const zoneSegments = useMemo<ZoneSegment[]>(() => {
    const polar = 90 - obliquity
    const tropic = obliquity
    return [
      { name: '北寒带', south: polar, north: 90, color: FRIGID_COLOR, labelable: 90 - polar >= 10 },
      { name: '北温带', south: tropic, north: polar, color: TEMPERATE_COLOR, labelable: polar - tropic >= 10 },
      { name: '热带', south: -tropic, north: tropic, color: TROPIC_COLOR, labelable: 2 * tropic >= 10 },
      { name: '南温带', south: -polar, north: -tropic, color: TEMPERATE_COLOR, labelable: polar - tropic >= 10 },
      { name: '南寒带', south: -90, north: -polar, color: FRIGID_COLOR, labelable: 90 - polar >= 10 }
    ]
  }, [obliquity])

  const boundaryMarks = useMemo(
    () => [
      { latitude: 90, label: '90°N' },
      { latitude: 90 - obliquity, label: `极圈 ${fmt(90 - obliquity)}°` },
      { latitude: obliquity, label: `回归线 ${fmt(obliquity)}°` },
      { latitude: 0, label: '0°' },
      { latitude: -obliquity, label: `回归线 ${fmt(obliquity)}°` },
      { latitude: -(90 - obliquity), label: `极圈 ${fmt(90 - obliquity)}°` },
      { latitude: -90, label: '90°S' }
    ],
    [obliquity]
  )

  const zoneWidthText = useMemo(() => {
    const polar = 90 - obliquity
    const tropic = obliquity
    return [
      `热带跨度 ${fmt(2 * tropic)}°`,
      `温带跨度 ${fmt(polar - tropic)}°`,
      `寒带跨度 ${fmt(90 - polar)}°`
    ]
  }, [obliquity])

  const conclusion = useMemo(() => {
    if (obliquity === 0) {
      return '交角为 0°：太阳始终直射赤道，全球全年昼夜等长，没有直射与极昼极夜现象，也就没有五带与四季之分。'
    }
    if (obliquity === REAL_OBLIQUITY) {
      return '交角为 23.5°（现实值）：直射点在南北回归线之间做回归运动，回归线与极圈之间为温带，五带划分如图。'
    }
    return obliquity > REAL_OBLIQUITY
      ? '交角增大：直射范围与极昼极夜范围都向中纬度扩展，热带、寒带变宽，温带变窄，正午太阳高度与昼夜长短的年变化更剧烈。'
      : '交角减小：直射范围与极昼极夜范围收缩，热带、寒带变窄，温带变宽，昼夜长短与正午太阳高度的年变化趋于平缓。'
  }, [obliquity])

  return (
    <div className={styles.obliquityPanel} role="group" aria-label="黄赤交角可调探究">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>黄赤交角可调探究</span>
        <Button
          type="text"
          size="small"
          aria-label="恢复真实黄赤交角 23.5 度"
          icon={<UndoOutlined />}
          onClick={() => setObliquity(REAL_OBLIQUITY)}
        />
        <Button type="text" size="small" aria-label="关闭黄赤交角探究" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <div className={styles.sliderRow}>
        <span className={styles.rowLabel}>黄赤交角</span>
        <Slider
          value={obliquity}
          min={0}
          max={45}
          step={0.5}
          marks={obliquityMarks}
          className={styles.obliquitySlider}
          ariaLabelForHandle="黄赤交角"
          onChange={(value) => setObliquity(value)}
        />
        <span className={styles.rowValue}>{fmt(obliquity)}°</span>
      </div>
      <div className={styles.chartTitle}>直射点回归运动（横轴：一年日期）</div>
      <svg
        viewBox={`0 ${-CURVE_TOP_PAD} ${CURVE_WIDTH} ${CURVE_HEIGHT + CURVE_TOP_PAD + 18}`}
        className={styles.declinationCurve}
        role="img"
        aria-label="太阳直射点纬度随日期变化的正弦曲线"
      >
        <line x1="0" y1={curveY(0)} x2={CURVE_WIDTH} y2={curveY(0)} stroke="rgba(0, 0, 0, 0.25)" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="0" y1={curveY(obliquity)} x2={CURVE_WIDTH} y2={curveY(obliquity)} stroke="rgba(250, 140, 22, 0.55)" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="0" y1={curveY(-obliquity)} x2={CURVE_WIDTH} y2={curveY(-obliquity)} stroke="rgba(250, 140, 22, 0.55)" strokeWidth="1" strokeDasharray="4 3" />
        <path d={curvePoints} fill="none" stroke={TROPIC_COLOR} strokeWidth="2" />
        <text x={CURVE_WIDTH - 4} y={curveY(obliquity) - 4} className={styles.axisLabel} textAnchor="end">
          北回归线 {fmt(obliquity)}°N
        </text>
        <text x={CURVE_WIDTH - 4} y={curveY(-obliquity) + 12} className={styles.axisLabel} textAnchor="end">
          南回归线 {fmt(obliquity)}°S
        </text>
        <text x={CURVE_WIDTH - 4} y={curveY(0) - 4} className={styles.axisLabel} textAnchor="end">
          赤道 0°
        </text>
        {SEASON_MARKS.map((mark) => (
          <g key={mark.label}>
            <line
              x1={(mark.day / 365) * CURVE_WIDTH}
              y1={CURVE_HEIGHT}
              x2={(mark.day / 365) * CURVE_WIDTH}
              y2={CURVE_HEIGHT + 4}
              stroke="rgba(0, 0, 0, 0.45)"
            />
            <text
              x={(mark.day / 365) * CURVE_WIDTH}
              y={CURVE_HEIGHT + 16}
              className={styles.axisLabel}
              textAnchor="middle"
            >
              {mark.label}
            </text>
          </g>
        ))}
      </svg>
      <div className={styles.chartTitle}>五带划分（随交角变化）</div>
      <div className={styles.zoneRow}>
        <svg
          viewBox={`-58 0 ${BAR_WIDTH + 58 + 86} ${BAR_HEIGHT}`}
          className={styles.zoneBar}
          role="img"
          aria-label="五带划分随黄赤交角变化的纬度条"
        >
          {boundaryMarks.map((mark) => (
            <g key={`${mark.label}-${mark.latitude}`}>
              <line x1="-6" y1={barY(mark.latitude)} x2="-2" y2={barY(mark.latitude)} stroke="rgba(0, 0, 0, 0.45)" />
              <text x="-8" y={barY(mark.latitude) + 4} className={styles.axisLabel} textAnchor="end">
                {mark.label}
              </text>
            </g>
          ))}
          {zoneSegments.map((segment) => (
            <rect
              key={segment.name}
              x="0"
              y={barY(segment.north)}
              width={BAR_WIDTH}
              height={Math.max(0, barY(segment.south) - barY(segment.north))}
              fill={segment.color}
              opacity="0.75"
            />
          ))}
          <text x="-58" y="10" className={styles.axisLabel}>
            极昼极夜最低纬度 {fmt(90 - obliquity)}°
          </text>
          {zoneSegments
            .filter((item) => item.labelable)
            .map((segment) => (
              <g key={`label-${segment.name}`}>
                <text
                  x={BAR_WIDTH + 8}
                  y={(barY(segment.north) + barY(segment.south)) / 2 + 4}
                  className={styles.zoneLabel}
                  fill={segment.color}
                >
                  {segment.name}
                </text>
              </g>
            ))}
        </svg>
        <div className={styles.zoneFacts}>
          {zoneWidthText.map((fact) => (
            <div key={fact} className={styles.factItem}>
              {fact}
            </div>
          ))}
          <div className={styles.factItem}>极昼极夜 ≥{fmt(90 - obliquity)}°</div>
          <div className={styles.factItem}>直射范围 ±{fmt(obliquity)}°</div>
        </div>
      </div>
      <div className={styles.panelNote}>{conclusion}</div>
    </div>
  )
}

export default ObliquityPanel
