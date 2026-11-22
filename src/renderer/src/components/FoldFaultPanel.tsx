import { CloseOutlined } from '@ant-design/icons'
import { Button, Segmented } from 'antd'
import * as Cesium from 'cesium'
import { useState } from 'react'

import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

import styles from './FoldFaultPanel.module.css'

export interface FoldFaultPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

type Tab = 'fold' | 'fault'

interface GlobeCase {
  name: string
  longitude: number
  latitude: number
  height: number
  summary: string
}

const tabOptions = [
  { value: 'fold', label: '褶皱' },
  { value: 'fault', label: '断层' }
]

const foldLayers = dc.strata.map((color, index) => ({ dy: index * 12, color }))

const foldFacts = [
  '褶皱：岩层受水平挤压发生弯曲变形。背斜岩层向上拱起（中心岩层老、两翼新），向斜岩层向下弯曲（中心岩层新、两翼老）。',
  '地形倒置：背斜顶部受张力易被侵蚀成谷地，向斜槽部坚实抗侵蚀反而成山——背斜成谷、向斜成山。',
  '应用：背斜是良好的储油构造（找油气），向斜盆地利于储水（找水），隧道、工程选址多选背斜（岩层向上拱起，结构稳定）。'
]

const faultFacts = [
  '断层：岩层受压力或张力超过强度发生断裂，并沿断裂面发生明显位移。',
  '地垒：两条断层之间岩块相对上升，常形成块状山地（华山、庐山、泰山）；地堑：中间岩块相对下降，常形成谷地或低地（渭河平原、汾河谷地、东非大裂谷）。',
  '断层线附近岩石破碎，易被风化侵蚀；泉水、湖泊常沿断层线分布，工程建设要避开断层。'
]

const foldCases: GlobeCase[] = [
  {
    name: '喜马拉雅褶皱山系',
    longitude: 86.9,
    latitude: 27.9,
    height: 900000,
    summary: '板块碰撞挤压形成的典型褶皱山系'
  },
  {
    name: '欧洲阿尔卑斯山',
    longitude: 9.5,
    latitude: 46.5,
    height: 900000,
    summary: '非洲板块与亚欧板块挤压形成'
  }
]

const faultCases: GlobeCase[] = [
  {
    name: '东非大裂谷（地堑）',
    longitude: 36,
    latitude: -3,
    height: 1200000,
    summary: '大陆断裂拉伸下陷形成的巨型地堑带'
  },
  {
    name: '华山（地垒）',
    longitude: 110.08,
    latitude: 34.48,
    height: 45000,
    summary: '秦岭北麓断层上升形成的块状山地'
  },
  {
    name: '渭河平原（地堑）',
    longitude: 109.2,
    latitude: 34.4,
    height: 260000,
    summary: '断陷下陷形成的地堑谷地'
  }
]

export function FoldFaultPanel({ viewer, onClose }: FoldFaultPanelProps) {
  const [tab, setTab] = useState<Tab>('fold')

  const cases = tab === 'fold' ? foldCases : faultCases
  const facts = tab === 'fold' ? foldFacts : faultFacts

  function flyToCase(item: GlobeCase): void {
    if (viewer && !viewer.isDestroyed()) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(item.longitude, item.latitude, item.height),
        duration: 1.4
      })
    }
  }

  return (
    <div className={styles.foldPanel} role='group' aria-label='褶皱与断层演示'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>褶皱与断层</span>
        <Segmented
          value={tab}
          size='small'
          options={tabOptions}
          aria-label='褶皱或断层'
          onChange={value => setTab(value as Tab)}
        />
        <Button
          type='text'
          size='small'
          aria-label='关闭褶皱与断层'
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </div>
      {tab === 'fold' ? (
        <svg
          viewBox='0 0 340 180'
          className={styles.foldSvg}
          role='img'
          aria-label='背斜与向斜剖面示意'
        >
          <defs>
            <marker
              id='fold-head'
              markerWidth='6'
              markerHeight='6'
              refX='4.5'
              refY='3'
              orient='auto'
            >
              <path d='M0,0 L6,3 L0,6 Z' fill={dc.fault} opacity='0.85' />
            </marker>
          </defs>
          <rect x='0' y='0' width='340' height='180' rx='8' fill='#fbf7f2' />
          {foldLayers.map(layer => (
            <g key={layer.dy}>
              <path
                d={`M 8 ${96 + layer.dy} C 70 ${52 + layer.dy}, 110 ${48 + layer.dy}, 150 ${86 + layer.dy} C 190 ${124 + layer.dy}, 230 ${128 + layer.dy}, 332 ${92 + layer.dy}`}
                fill='none'
                stroke={layer.color}
                strokeWidth='7'
                strokeLinecap='round'
                opacity='0.9'
              />
            </g>
          ))}
          <path
            d='M 136 64 L 136 48 M 164 64 L 164 48'
            stroke={dc.fault}
            strokeWidth='1.8'
            opacity='0.85'
            markerEnd='url(#fold-head)'
            className={styles.foldArrow}
          />
          <g fontFamily={diagramFont}>
            <text x='150' y='24' fill={dc.ink} fontSize='11' fontWeight='600' textAnchor='middle'>
              背斜（岩层上拱，中心老两翼新）
            </text>
            <text x='150' y='42' fill={dc.fault} fontSize='10' textAnchor='middle' opacity='0.9'>
              顶部受张力 · 易侵蚀成谷
            </text>
            <text
              x='150'
              y='132'
              fill='#389e0d'
              fontSize='10'
              textAnchor='middle'
              fontWeight='600'
              className={styles.svgStroked}
            >
              槽部坚实 · 抗侵蚀成山
            </text>
            <text x='150' y='166' fill={dc.ink} fontSize='11' fontWeight='600' textAnchor='middle'>
              向斜（岩层下弯，中心新两翼老）
            </text>
          </g>
        </svg>
      ) : (
        <svg
          viewBox='0 0 340 180'
          className={styles.foldSvg}
          role='img'
          aria-label='地垒与地堑剖面示意'
        >
          <defs>
            <marker
              id='fault-head'
              markerWidth='6'
              markerHeight='6'
              refX='4.5'
              refY='3'
              orient='auto'
            >
              <path d='M0,0 L6,3 L0,6 Z' fill={dc.fault} opacity='0.9' />
            </marker>
            <linearGradient id='ff-horst' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#e6d3b8' />
              <stop offset='100%' stopColor='#cbb08a' />
            </linearGradient>
            <linearGradient id='ff-graben' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#c8b7a6' />
              <stop offset='100%' stopColor='#a8937c' />
            </linearGradient>
          </defs>
          <rect x='0' y='0' width='340' height='180' rx='8' fill='#fbf7f2' />
          <rect x='0' y='148' width='340' height='32' fill={dc.strataBase} />
          <g stroke='rgba(0,0,0,0.28)' strokeWidth='1'>
            <path d='M 4 96 L 82 96 L 82 148 L 4 148 Z' fill='url(#ff-graben)' />
            <path d='M 118 60 L 222 60 L 222 148 L 118 148 Z' fill='url(#ff-horst)' />
            <path d='M 258 100 L 336 100 L 336 148 L 258 148 Z' fill='url(#ff-graben)' />
          </g>
          <g stroke='rgba(0,0,0,0.14)' strokeWidth='1'>
            <path d='M 8 116 L 78 116 M 8 132 L 78 132' />
            <path d='M 122 84 L 218 84 M 122 108 L 218 108 M 122 132 L 218 132' />
            <path d='M 262 118 L 332 118 M 262 134 L 332 134' />
          </g>
          <path
            d='M 94 34 L 82 148'
            stroke={dc.fault}
            strokeWidth='2.2'
            className={styles.faultLine}
          />
          <path
            d='M 246 34 L 258 148'
            stroke={dc.fault}
            strokeWidth='2.2'
            className={styles.faultLine}
          />
          <g stroke={dc.fault} strokeWidth='1.8' opacity='0.9' markerEnd='url(#fault-head)'>
            <path d='M 170 44 L 170 26' />
            <path d='M 44 66 L 44 82' />
            <path d='M 296 74 L 296 90' />
          </g>
          <g fontFamily={diagramFont}>
            <text x='170' y='18' fill={dc.fault} fontSize='11' textAnchor='middle' fontWeight='600'>
              地垒：相对上升 → 块状山地（华山）
            </text>
            <text x='44' y='60' fill={dc.fault} fontSize='10' textAnchor='middle' opacity='0.9'>
              下降
            </text>
            <text x='296' y='68' fill={dc.fault} fontSize='10' textAnchor='middle' opacity='0.9'>
              下降
            </text>
            <text x='44' y='166' fill={dc.inkSecondary} fontSize='10' textAnchor='middle'>
              地堑：相对下降 → 谷地平原
            </text>
            <text x='296' y='166' fill={dc.inkSecondary} fontSize='10' textAnchor='middle'>
              谷地平原（渭河平原）
            </text>
          </g>
        </svg>
      )}
      {facts.map(fact => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.sectionTitle}>在地球上观察</div>
      <div className={styles.caseRow}>
        {cases.map(item => (
          <Button key={item.name} size='small' onClick={() => flyToCase(item)}>
            {item.name}
          </Button>
        ))}
      </div>
      <div className={styles.panelNote}>
        点击按钮飞往真实地点，结合地形起伏观察褶皱山系、地垒山地与地堑谷地的形态差异。
      </div>
    </div>
  )
}

export default FoldFaultPanel
