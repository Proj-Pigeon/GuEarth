import { useMemo } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui'
import LineChart, { type ChartSeries } from './charts/LineChart'
import styles from './OceanPropertyPanel.module.css'

export interface OceanPropertyPanelProps {
  onClose: () => void
}

const temperatureStops: Array<[number, number]> = [
  [-60, 2.5],
  [-50, 4.5],
  [-40, 9],
  [-30, 16],
  [-20, 24],
  [-10, 27.5],
  [0, 28.5],
  [10, 28.3],
  [20, 26.5],
  [30, 23],
  [40, 19],
  [50, 13],
  [60, 8]
]

const salinityStops: Array<[number, number]> = [
  [-60, 33.6],
  [-50, 33.9],
  [-40, 34.4],
  [-30, 35.6],
  [-23, 36.8],
  [-15, 36.2],
  [0, 34.6],
  [12, 35.6],
  [25, 36.9],
  [32, 36.4],
  [40, 35.2],
  [50, 34.4],
  [60, 33.8]
]

const facts = [
  '海水温度：自赤道（约 28~29℃）向两极递减，副热带海域因蒸发强、降水少，温度分布受洋流影响明显——暖流增温、寒流降温。',
  '海水盐度：从副热带海域（约 36.5‰）分别向赤道（降水多，约 34.5‰）和高纬（融冰稀释，约 33.5‰）递低，呈“马鞍形”双峰曲线。',
  '世界盐度最高：红海（约 41‰，蒸发极强、几乎无淡水注入）；最低：波罗的海（约 10‰ 以内，纬度高蒸发弱、河流注入多）。',
  '影响海水温度与盐度的主要因素：纬度（辐射）、降水量与蒸发量、洋流、河川径流与结融冰。'
]

export function OceanPropertyPanel({ onClose }: OceanPropertyPanelProps) {
  const temperatureSeries = useMemo<ChartSeries[]>(
    () => [{ name: '表层海水温度', color: '#fa541c', points: temperatureStops }],
    []
  )
  const salinitySeries = useMemo<ChartSeries[]>(
    () => [{ name: '表层海水盐度', color: '#1677ff', points: salinityStops, markY: [35] }],
    []
  )

  return (
    <div className={styles.oceanPanel} role="group" aria-label="海水温度与盐度">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>海水温度与盐度</span>
        <Button variant="ghost" size="sm" aria-label="关闭海水温度与盐度" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>
      <div className={styles.chartTitle}>表层海水温度随纬度分布</div>
      <LineChart series={temperatureSeries} xMin={-60} xMax={60} xName="纬度" yName="温度(℃)" yMin={0} yMax={32} height={150} />
      <div className={styles.chartTitle}>表层海水盐度随纬度分布</div>
      <LineChart series={salinitySeries} xMin={-60} xMax={60} xName="纬度" yName="盐度(‰)" yMin={33} yMax={38} height={150} />
      {facts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
    </div>
  )
}

export default OceanPropertyPanel
