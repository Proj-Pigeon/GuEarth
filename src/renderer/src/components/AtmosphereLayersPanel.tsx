import { useMemo } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui'
import LineChart from './charts/LineChart';
import type { ChartSeries } from './charts/LineChart';
import styles from './AtmosphereLayersPanel.module.css'

export interface AtmosphereLayersPanelProps {
  onClose: () => void
}

const TEMP_COLOR = '#1677ff'

const profilePoints: [number, number][] = []
for (let h = 0; h <= 12; h += 1) {profilePoints.push([15 - (h * 70) / 12, h])}
for (let h = 13; h <= 50; h += 1) {profilePoints.push([-55 + ((h - 12) * 52) / 38, h])}
for (let h = 51; h <= 85; h += 1) {profilePoints.push([-3 - ((h - 50) * 87) / 35, h])}

const layers = [
  {
    name: '对流层（0~12 千米）',
    facts: [
      '气温随高度升高而降低，每上升 100 米约降 0.6℃',
      '集中了大气质量的 3/4 与几乎全部水汽、杂质',
      '对流运动显著，天气现象复杂多变，与人类关系最密切'
    ]
  },
  {
    name: '平流层（12~50 千米）',
    facts: [
      '臭氧大量吸收紫外线，气温随高度升高而升高',
      '上热下冷，大气以平流运动为主',
      '水汽杂质少、天气晴朗能见度好，适合高空飞行'
    ]
  },
  {
    name: '高层大气（50 千米以上）',
    facts: [
      '空气密度极小，气压很低',
      '80~500 千米存在若干电离层，能反射无线电短波',
      '对无线电通信具有重要作用'
    ]
  }
]

export function AtmosphereLayersPanel({ onClose }: AtmosphereLayersPanelProps) {
  const series = useMemo<ChartSeries[]>(
    () => [{ name: '大气垂直温度廓线', color: TEMP_COLOR, points: profilePoints, markY: [12, 50, 85] }],
    []
  )

  return (
    <div className={styles.layersPanel} role="group" aria-label="大气垂直分层">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>大气垂直分层</span>
        <Button variant="ghost" size="sm" aria-label="关闭大气垂直分层" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>
      <div className={styles.chartTitle}>气温随高度的分布（横轴：气温，纵轴：高度）</div>
      <LineChart
        series={series}
        xMin={-100}
        xMax={20}
        xName="气温(℃)"
        yName="高度(千米)"
        yMin={0}
        yMax={100}
        height={210}
      />
      {layers.map((layer) => (
        <div key={layer.name} className={styles.layerItem}>
          <div className={styles.layerName}>{layer.name}</div>
          {layer.facts.map((fact) => (
            <div key={fact} className={styles.layerFact}>
              · {fact}
            </div>
          ))}
        </div>
      ))}
      <div className={styles.panelNote}>
        曲线折点即分层界线：对流层顶约 12 千米、平流层顶约 50 千米、中间层顶约 85 千米；气温在界线处变化趋势反转。
      </div>
    </div>
  )
}

export default AtmosphereLayersPanel
