import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button, Segmented } from '@renderer/components/ui'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'
import styles from './TideWavePanel.module.css'

export interface TideWavePanelProps {
  onClose: () => void
}

type Tab = 'wave' | 'tide'
type TideMode = 'spring' | 'neap'

const tabOptions = [
  { value: 'wave', label: '波浪' },
  { value: 'tide', label: '潮汐' }
]

const tideModeOptions = [
  { value: 'spring', label: '大潮（朔望）' },
  { value: 'neap', label: '小潮（上下弦）' }
]

const waveParticles: Array<{ cx: number; cy: number; r: number; delay: number }> = [
  { cx: 62, cy: 100, r: 7, delay: 0 },
  { cx: 122, cy: 100, r: 7, delay: -0.7 },
  { cx: 182, cy: 100, r: 7, delay: -1.4 },
  { cx: 242, cy: 100, r: 6, delay: -2.1 },
  { cx: 292, cy: 100, r: 4.5, delay: -2.8 }
]

const waveFacts = [
  '波浪：风摩擦海面将能量传给海水，水质点大致沿圆形轨道运动，波形向前传播而水质点几乎不随波前进。',
  '深水区水质点轨道接近圆形；浅水区受海底摩擦，轨道变扁，波高增大，最终波峰前倾破碎形成拍岸浪。',
  '波浪是塑造海岸地貌（海蚀崖、海蚀柱、沙滩）的主要外力之一。'
]

const springTideFacts = [
  '大潮：日、月、地三者大致呈直线（农历初一朔、十五望），太阳潮与太阴潮叠加，潮差最大。',
  '对月一侧因月球引力直接吸引海水隆起，背月一侧因惯性离心力隆起，全球同时出现两个潮汐隆起。',
  '钱塘江大潮（农历八月十八前后）即天文大潮叠加上宽下窄喇叭口地形的放大效果。'
]

const neapTideFacts = [
  '小潮：日、月、地三者呈直角（农历初八上弦、廿三下弦），太阳潮削弱太阴潮，潮差最小。',
  '月球引潮力约为太阳引潮力的 2.2 倍，月球是潮汐的主导因素。',
  '潮汐昼夜两涨两落；渔港赶海、潮汐发电、大型舰船趁潮进出港都是对潮汐规律的利用。'
]

export function TideWavePanel({ onClose }: TideWavePanelProps) {
  const [tab, setTab] = useState<Tab>('wave')
  const [tideMode, setTideMode] = useState<TideMode>('spring')

  const moonAngle = tideMode === 'spring' ? 0 : 90
  const moonX = 170 + 74 * Math.cos((moonAngle * Math.PI) / 180)
  const moonY = 96 - 74 * Math.sin((moonAngle * Math.PI) / 180)
  const bulgeRotation = tideMode === 'spring' ? 0 : -18
  const tideFacts = tideMode === 'spring' ? springTideFacts : neapTideFacts
  const facts = tab === 'wave' ? waveFacts : tideFacts

  return (
    <div className={styles.tidePanel} role="group" aria-label="潮汐与波浪演示">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>潮汐与波浪</span>
        <Segmented
          value={tab}
          size="sm"
          options={tabOptions}
          aria-label="波浪或潮汐"
          onChange={(value) => setTab(value as Tab)}
        />
        <Button variant="ghost" size="sm" aria-label="关闭潮汐与波浪" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>
      {tab === 'wave' ? (
        <svg viewBox="0 0 340 200" className={styles.tideSvg} role="img" aria-label="波浪与水质点运动示意">
          <defs>
            <linearGradient id="tw-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dc.oceanShallow} stopOpacity="0.45" />
              <stop offset="100%" stopColor={dc.oceanDeep} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="tw-bed" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d3c0a3" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#d3c0a3" stopOpacity="0.2" />
            </linearGradient>
            <marker id="tide-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill={dc.neutralArrow} />
            </marker>
          </defs>
          <rect x="0" y="0" width="340" height="200" rx="8" fill="#f6fbff" />
          <path d="M0 132 L340 132 L340 200 L0 200 Z" fill="url(#tw-bed)" />
          <path d="M0 96 L340 96 L340 132 L0 132 Z" fill="url(#tw-sea)" />
          <g className={styles.waveMove}>
            <path
              d="M-170 96 Q -127.5 66 -85 96 T 0 96 T 85 96 T 170 96 T 255 96 T 340 96 T 425 96 T 510 96"
              fill="none"
              stroke={dc.primary}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
          {waveParticles.map((p) => (
            <g key={p.cx}>
              <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke="rgba(250, 84, 28, 0.35)" strokeWidth="1" strokeDasharray="2 3" />
              <g className={styles.particleOrbit} style={{ transformOrigin: `${p.cx}px ${p.cy}px`, animationDelay: `${p.delay}s` }}>
                <circle cx={p.cx} cy={p.cy - p.r} r="3" fill="#fa541c" />
              </g>
            </g>
          ))}
          <path d="M 200 118 C 216 130 232 134 248 134" fill="none" stroke={dc.neutralArrow} strokeWidth="1.6" markerEnd="url(#tide-head)" />
          <g fontFamily={diagramFont}>
            <text x="16" y="22" fontSize="11" fill={dc.inkSecondary}>
              风向 →
            </text>
            <text x="304" y="60" fontSize="11" fill={dc.primary} fontWeight="600" textAnchor="middle">
              波形向前传播
            </text>
            <path d="M 258 64 L 274 70" stroke={dc.primary} strokeWidth="1" opacity="0.5" />
            <text x="168" y="152" fontSize="11" fill="#fa541c" textAnchor="middle" fontWeight="600" className={styles.svgStroked}>
              水质点沿轨道运动（不随波前进）
            </text>
            <text x="88" y="146" fontSize="10" fill={dc.inkSecondary} textAnchor="middle">
              浅水区轨道变扁、波高增大
            </text>
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 340 200" className={styles.tideSvg} role="img" aria-label="潮汐日地月示意">
          <defs>
            <radialGradient id="tw-earth" cx="42%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#69b1ff" />
              <stop offset="100%" stopColor="#1677ff" />
            </radialGradient>
            <radialGradient id="tw-sun" cx="42%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#ffd666" />
              <stop offset="100%" stopColor={dc.sun} />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="340" height="200" rx="8" fill="var(--subtle)" />
          <line x1="8" y1="96" x2="332" y2="96" stroke="var(--hairline)" strokeDasharray="4 5" />
          <circle cx="318" cy="96" r="14" fill="url(#tw-sun)" />
          <text x="318" y="128" textAnchor="middle" className={styles.svgLabel} fill={dc.inkSecondary}>
            太阳
          </text>
          <g transform={`rotate(${bulgeRotation} 170 96)`} className={styles.bulgeShift}>
            <ellipse
              cx="170"
              cy="96"
              rx="68"
              ry="27"
              fill="rgba(22, 119, 255, 0.16)"
              stroke="rgba(22, 119, 255, 0.4)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          </g>
          <circle cx="170" cy="96" r="20" fill="url(#tw-earth)" />
          <circle cx="170" cy="96" r="4.5" fill="rgba(255,255,255,0.9)" />
          <text x="170" y="150" textAnchor="middle" className={styles.svgLabel} fill={dc.inkSecondary}>
            地球
          </text>
          <text x="116" y="66" className={styles.svgLabel} fill={dc.coldAir} fontWeight="600" textAnchor="middle">
            潮汐隆起
          </text>
          <text x="228" y="132" className={styles.svgLabel} fill={dc.coldAir} fontWeight="600" textAnchor="middle">
            潮汐隆起
          </text>
          <circle cx="170" cy="96" r="74" fill="none" stroke="var(--hairline)" strokeDasharray="2 5" />
          <circle cx={moonX} cy={moonY} r="9" fill={dc.moon} />
          <circle cx={moonX - 3} cy={moonY - 3} r="2" fill="rgba(255,255,255,0.28)" />
          <circle cx={moonX + 2} cy={moonY + 3} r="1.4" fill="rgba(255,255,255,0.2)" />
          <text x={moonX} y={moonY - 16} textAnchor="middle" className={styles.svgLabel} fill={dc.inkSecondary}>
            月球
          </text>
          {tideMode === 'spring' ? (
            <text x="16" y="22" className={styles.svgLabel} fill={dc.inkSecondary}>
              日、月、地一线 → 潮差最大
            </text>
          ) : (
            <text x="16" y="22" className={styles.svgLabel} fill={dc.inkSecondary}>
              日、月、地垂直 → 潮差最小
            </text>
          )}
        </svg>
      )}
      {tab === 'tide' && (
        <Segmented
          value={tideMode}
          size="sm"
          options={tideModeOptions}
          aria-label="大潮或小潮"
          onChange={(value) => setTideMode(value as TideMode)}
        />
      )}
      {facts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
    </div>
  )
}

export default TideWavePanel
