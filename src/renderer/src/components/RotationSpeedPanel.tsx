import { Button } from '@renderer/components/ui'
import { XIcon } from 'lucide-react'
import { useMemo } from 'react'

import LineChart from './charts/LineChart'
import type { ChartSeries } from './charts/LineChart'

import styles from './RotationSpeedPanel.module.css'

export interface RotationSpeedPanelProps {
  onClose: () => void
}

const EQUATOR_SPEED_KMH = 1670
const SPEED_COLOR = '#1677ff'
const SVG_WIDTH = 300
const SVG_HEIGHT = 158
const SUN = { x: 58, y: 96, r: 13 }
const E1 = { x: 152, y: 136, r: 10 }
const E2 = { x: 236, y: 70, r: 10 }
const STAR = { x: 18, y: 22 }

const latitudeFormatter = (value: number): string =>
  value === 0 ? '0°' : `${Math.abs(value)}°${value > 0 ? 'N' : 'S'}`

function toward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  length: number
): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const norm = Math.hypot(dx, dy) || 1
  return { x: from.x + (dx / norm) * length, y: from.y + (dy / norm) * length }
}

const e1SunArrow = toward(E1, SUN, 44)
const e2StarArrow = (() => {
  const dx = SUN.x - E1.x
  const dy = SUN.y - E1.y
  const norm = Math.hypot(dx, dy) || 1
  return { x: E2.x + (dx / norm) * 44, y: E2.y + (dy / norm) * 44 }
})()
const e2SunArrow = toward(E2, SUN, 44)

const facts = [
  { label: '角速度', value: '15°/小时（南北极点为 0）' },
  { label: '赤道线速度', value: '约 1670 千米/时（465 米/秒）' },
  { label: '60° 纬线线速度', value: '约 835 千米/时（赤道一半）' },
  { label: '恒星日', value: '23 时 56 分 4 秒 · 转 360°' },
  { label: '太阳日', value: '24 时 · 转 360°59′' },
  { label: '两者之差', value: '3 分 56 秒（一年累计恰好多转一圈）' }
]

export function RotationSpeedPanel({ onClose }: RotationSpeedPanelProps) {
  const speedSeries = useMemo<ChartSeries[]>(() => {
    const points: [number, number][] = []
    for (let lat = -90; lat <= 90; lat += 2) {
      points.push([lat, EQUATOR_SPEED_KMH * Math.cos((lat * Math.PI) / 180)])
    }
    return [{ name: '自转线速度', color: SPEED_COLOR, points, markY: [EQUATOR_SPEED_KMH] }]
  }, [])

  return (
    <div className={styles.rotationPanel} role='group' aria-label='地球自转速度演示'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>地球自转的速度与周期</span>
        <Button
          variant='ghost'
          size='sm'
          aria-label='关闭自转速度演示'
          icon={<XIcon className='size-3.5' />}
          onClick={onClose}
        />
      </div>
      <div className={styles.chartTitle}>自转线速度随纬度变化（v = 1670 × cos φ 千米/时）</div>
      <LineChart
        series={speedSeries}
        xMin={-90}
        xMax={90}
        xName='纬度'
        xFormatter={latitudeFormatter}
        yName='千米/时'
        yMin={0}
        yMax={1800}
        height={150}
      />
      <div className={styles.chartTitle}>恒星日与太阳日（示意，59′ 夸大绘制）</div>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className={styles.dayDiagram}
        role='img'
        aria-label='恒星日与太阳日对比示意图：地球公转一段后需多转59分才能再次对准太阳'
      >
        <line
          x1={STAR.x}
          y1={STAR.y}
          x2={E1.x}
          y2={E1.y}
          stroke='var(--border-strong)'
          strokeDasharray='3 4'
        />
        <line
          x1={STAR.x}
          y1={STAR.y}
          x2={E2.x}
          y2={E2.y}
          stroke='var(--border-strong)'
          strokeDasharray='3 4'
        />
        <g transform={`translate(${STAR.x}, ${STAR.y})`}>
          <circle r='3' fill='#722ed1' />
          <circle r='7' fill='none' stroke='#722ed1' strokeDasharray='2 2' />
        </g>
        <text x={STAR.x} y={STAR.y - 12} className={styles.axisLabel} textAnchor='middle'>
          遥远恒星
        </text>
        <g transform={`translate(${SUN.x}, ${SUN.y})`}>
          <circle r={SUN.r} fill='#fa8c16' />
        </g>
        <text x={SUN.x} y={SUN.y + SUN.r + 14} className={styles.axisLabel} textAnchor='middle'>
          太阳
        </text>
        <path
          d='M 165 122 Q 200 108 226 84'
          fill='none'
          stroke='var(--ink-tertiary)'
          strokeDasharray='4 4'
          markerEnd='url(#orbit-arrow)'
        />
        <defs>
          <marker
            id='orbit-arrow'
            viewBox='0 0 8 8'
            refX='7'
            refY='4'
            markerWidth='6'
            markerHeight='6'
            orient='auto'
          >
            <path d='M0,0 L8,4 L0,8 z' fill='var(--ink-tertiary)' />
          </marker>
          <marker
            id='solid-arrow'
            viewBox='0 0 8 8'
            refX='7'
            refY='4'
            markerWidth='6'
            markerHeight='6'
            orient='auto'
          >
            <path d='M0,0 L8,4 L0,8 z' fill='#1677ff' />
          </marker>
          <marker
            id='dash-arrow'
            viewBox='0 0 8 8'
            refX='7'
            refY='4'
            markerWidth='6'
            markerHeight='6'
            orient='auto'
          >
            <path d='M0,0 L8,4 L0,8 z' fill='rgba(22, 119, 255, 0.55)' />
          </marker>
        </defs>
        <text x='196' y='122' className={styles.axisLabel}>
          公转方向
        </text>
        <circle
          cx={E1.x}
          cy={E1.y}
          r={E1.r}
          fill='#52c41a'
          stroke='var(--surface)'
          strokeWidth='2'
        />
        <line
          x1={E1.x}
          y1={E1.y}
          x2={e1SunArrow.x}
          y2={e1SunArrow.y}
          stroke='#1677ff'
          strokeWidth='2'
          markerEnd='url(#solid-arrow)'
        />
        <text x={E1.x + 4} y={E1.y - 16} className={styles.earthLabel}>
          位置① P 指向太阳（也是恒星方向）
        </text>
        <circle
          cx={E2.x}
          cy={E2.y}
          r={E2.r}
          fill='#52c41a'
          stroke='var(--surface)'
          strokeWidth='2'
        />
        <line
          x1={E2.x}
          y1={E2.y}
          x2={e2StarArrow.x}
          y2={e2StarArrow.y}
          stroke='#1677ff'
          strokeWidth='2'
          markerEnd='url(#solid-arrow)'
        />
        <line
          x1={E2.x}
          y1={E2.y}
          x2={e2SunArrow.x}
          y2={e2SunArrow.y}
          stroke='rgba(22, 119, 255, 0.55)'
          strokeWidth='1.5'
          strokeDasharray='4 3'
          markerEnd='url(#dash-arrow)'
        />
        <text x={E2.x + 6} y={E2.y - 24} className={styles.earthLabel}>
          位置② 已转 360°：P 仍指恒星（恒星日）
        </text>
        <text x={E2.x + 6} y={E2.y - 12} className={styles.earthLabelDim}>
          还需再转 59′ 才对准太阳（太阳日）
        </text>
        <text x={E2.x - 44} y={E2.y + 26} className={styles.axisLabel}>
          约59′
        </text>
      </svg>
      <div className={styles.readoutGrid}>
        {facts.map(fact => (
          <div key={fact.label} className={styles.readoutItem}>
            <span className={styles.readoutLabel}>{fact.label}</span>
            <span className={styles.readoutValue}>{fact.value}</span>
          </div>
        ))}
      </div>
      <div className={styles.panelNote}>
        线速度由赤道向两极递减；同一纬线各点角速度、线速度相同。图示角度经夸大，实际每日多转约 59′。
      </div>
    </div>
  )
}

export default RotationSpeedPanel
