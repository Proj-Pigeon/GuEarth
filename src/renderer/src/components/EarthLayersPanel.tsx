import { useState } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'
import styles from './EarthLayersPanel.module.css'

export interface EarthLayersPanelProps {
  onClose: () => void
}

type LayerId = 'crust' | 'mantle' | 'outer-core' | 'inner-core'

interface LayerMeta {
  name: string
  depth: string
  color: string
  facts: string[]
}

const layers: Record<LayerId, LayerMeta> = {
  crust: {
    name: '地壳',
    depth: '平均约 17 千米（大陆 35~40 千米、大洋 5~10 千米）',
    color: dc.crust,
    facts: [
      '由岩石组成的坚硬外壳，大陆地壳厚、大洋地壳薄',
      '硅铝层（上层）与硅镁层（下层），大洋地壳往往缺失硅铝层',
      '地震波速度变化——莫霍面（莫霍洛维奇不连续面）是其与地幔的分界'
    ]
  },
  mantle: {
    name: '地幔',
    depth: '17~2900 千米',
    color: dc.mantle,
    facts: [
      '占地球体积约 80%，上地幔上部存在软流层（软流圈），一般认为是岩浆的主要发源地',
      '岩石圈 = 地壳 + 上地幔顶部（软流层以上），在软流层上“漂移”运动，是板块构造学说的基础',
      '下地幔物质致密、温度压力极高；与地核的分界为古登堡面'
    ]
  },
  'outer-core': {
    name: '外地核',
    depth: '2900~5150 千米',
    color: dc.outerCore,
    facts: [
      '横波（S 波）不能通过外地核，推断其为液态（熔融态铁镍）',
      '液态金属铁镍的流动形成地球磁场',
      '与内地核的分界为莱曼面（5150 千米）'
    ]
  },
  'inner-core': {
    name: '内地核',
    depth: '5150~6371 千米',
    color: dc.innerCore,
    facts: [
      '纵波在内地核传播时速度加快，推断其为固态（超高压下铁镍固化）',
      '温度约 4000~6000℃，与太阳表面相当',
      '地心压力约为大气压的 300 多万倍'
    ]
  }
}

const layerEntries = Object.entries(layers) as Array<[LayerId, LayerMeta]>

const arcs: Array<{ id: LayerId; r: number }> = [
  { id: 'inner-core', r: 40 },
  { id: 'outer-core', r: 86 },
  { id: 'mantle', r: 138 },
  { id: 'crust', r: 158 }
]

const reversedArcs = [...arcs].reverse()

const callouts: Array<{ id: LayerId; x: number; y: number; anchorX: number; anchorY: number; side: 'left' | 'right' }> = [
  { id: 'crust', x: 44, y: 40, anchorX: 100, anchorY: 40, side: 'left' },
  { id: 'mantle', x: 40, y: 96, anchorX: 82, anchorY: 118, side: 'left' },
  { id: 'outer-core', x: 306, y: 84, anchorX: 262, anchorY: 116, side: 'right' },
  { id: 'inner-core', x: 300, y: 148, anchorX: 206, anchorY: 172, side: 'right' }
]

const boundaryNotes = [
  '莫霍面（地下约 17 千米）：纵波与横波速度都明显加快——地壳与地幔的分界',
  '古登堡面（地下约 2900 千米）：纵波速度骤降、横波消失——地幔与外地核的分界，据此推断外地核为液态',
  '地震波：纵波（P 波）可通过固液气三态，横波（S 波）只能通过固体，是研究地球内部的“探照灯”'
]

export function EarthLayersPanel({ onClose }: EarthLayersPanelProps) {
  const [active, setActive] = useState<LayerId>('crust')
  const meta = layers[active]

  return (
    <div className={styles.layersPanel} role="group" aria-label="地球圈层结构">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>地球的圈层结构</span>
        <Button type="text" size="small" aria-label="关闭地球圈层结构" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <svg viewBox="0 0 340 210" className={styles.earthSvg} role="img" aria-label="地球内部圈层切球剖面示意">
        <defs>
          <radialGradient id="el-crust" cx="50%" cy="100%" r="100%">
            <stop offset="88%" stopColor={dc.crust} stopOpacity="0.55" />
            <stop offset="100%" stopColor={dc.crust} stopOpacity="0.85" />
          </radialGradient>
          <radialGradient id="el-mantle" cx="50%" cy="100%" r="100%">
            <stop offset="60%" stopColor={dc.mantle} stopOpacity="0.55" />
            <stop offset="100%" stopColor={dc.mantle} stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id="el-outer-core" cx="50%" cy="100%" r="160%">
            <stop offset="40%" stopColor={dc.outerCore} stopOpacity="0.65" />
            <stop offset="100%" stopColor={dc.outerCore} stopOpacity="1" />
          </radialGradient>
          <radialGradient id="el-inner-core" cx="50%" cy="100%" r="220%">
            <stop offset="30%" stopColor="#ff7a45" />
            <stop offset="100%" stopColor={dc.innerCore} />
          </radialGradient>
        </defs>
        {reversedArcs.map((arc) => (
          <g key={arc.id}>
            <path
              d={`M ${170 - arc.r} 178 A ${arc.r} ${arc.r} 0 0 1 ${170 + arc.r} 178 Z`}
              fill={`url(#el-${arc.id})`}
              opacity={active === arc.id ? 1 : 0.42}
              stroke={
                active === arc.id
                  ? arc.id === 'crust' || arc.id === 'mantle'
                    ? 'rgba(0,0,0,0.3)'
                    : 'rgba(0,0,0,0.2)'
                  : 'rgba(0,0,0,0.12)'
              }
              strokeWidth={active === arc.id ? 1.4 : 0.8}
              className={styles.layerArc}
              onClick={() => setActive(arc.id)}
            />
          </g>
        ))}
        <line x1="0" y1="178" x2="340" y2="178" stroke="rgba(0,0,0,0.32)" strokeWidth="1.5" />
        <g fontFamily={diagramFont} fontSize="10">
          {callouts.map((c) => (
            <g key={c.id} className={styles.callout} onClick={() => setActive(c.id)}>
              <path d={`M ${c.x} ${c.y} L ${c.anchorX} ${c.anchorY}`} stroke={layers[c.id].color} strokeWidth="1" opacity="0.7" />
              <circle cx={c.anchorX} cy={c.anchorY} r="2.2" fill={layers[c.id].color} />
              <text
                x={c.x}
                y={c.y - 5}
                textAnchor={c.side === 'left' ? 'start' : 'end'}
                fill={active === c.id ? dc.ink : dc.inkSecondary}
                fontWeight={active === c.id ? 600 : 400}
              >
                {layers[c.id].name}
              </text>
            </g>
          ))}
          <text x="12" y="192" fill={dc.inkTertiary}>
            莫霍面
          </text>
          <text x="328" y="192" textAnchor="end" fill={dc.inkTertiary}>
            古登堡面
          </text>
          <path d="M 40 186 L 60 178 M 300 186 L 256 178" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
          <text x="170" y="206" textAnchor="middle" fill={dc.inkTertiary}>
            剖面比例经夸张示意（真实地壳仅约地球半径 1/375）
          </text>
        </g>
      </svg>
      <div className={styles.layerTabs}>
        {layerEntries.map(([id, value]) => (
          <button
            key={id}
            type="button"
            className={active === id ? `${styles.layerTab} ${styles.layerTabActive}` : styles.layerTab}
            style={{ borderColor: value.color }}
            onClick={() => setActive(id)}
          >
            <span className={styles.tabDot} style={{ background: value.color }} />
            {value.name}
          </button>
        ))}
      </div>
      <div className={styles.layerDepth}>
        {meta.name} · 深度范围：{meta.depth}
      </div>
      {meta.facts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.sectionTitle}>两个不连续面与地震波</div>
      {boundaryNotes.map((note) => (
        <div key={note} className={styles.fact}>
          {note}
        </div>
      ))}
    </div>
  )
}

export default EarthLayersPanel
