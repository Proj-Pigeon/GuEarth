import { Button } from '@renderer/components/ui'
import { resolveFlightDestination } from '@renderer/composables/terrainFlight'
import { useClimateStore } from '@renderer/stores/climate'
import { useTransportStore } from '@renderer/stores/transport'
import {
  HSR_END_YEAR,
  hsrFacts,
  hsrGrowthSeries,
  hsrLines,
  hsrLinesUpTo,
  hsrMileageAt
} from '@renderer/thematic/hsrLines'
import type { HsrLine } from '@renderer/thematic/hsrLines'
import type * as Cesium from 'cesium'
import { MapPinIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'

import LineChart from './charts/LineChart'
import type { ChartSeries } from './charts/LineChart'
import YearTimeline from './YearTimeline'

import styles from './TransportPanel.module.css'

export interface TransportPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

const growthSeries: ChartSeries[] = [
  {
    name: '营业里程',
    color: '#d4380d',
    points: hsrGrowthSeries.map(([year, km]) => [year, Math.round(km / 100) / 100])
  }
]

const caseLines: HsrLine[] = [
  '京津城际',
  '京沪高铁',
  '京广高铁',
  '兰新高铁',
  '沪昆高铁',
  '西成高铁'
]
  .map(name => hsrLines.find(line => line.name === name))
  .filter((line): line is HsrLine => Boolean(line))

export function TransportPanel({ viewer, onClose }: TransportPanelProps) {
  const hsrOverlayEnabled = useClimateStore(state => state.overlays['hsr-network'])
  const setOverlay = useClimateStore(state => state.setOverlay)
  const year = useTransportStore(state => state.year)

  const flyingRef = useRef(false)

  const displayYear = Math.floor(year)
  const mileageWan = (hsrMileageAt(displayYear) / 10_000).toFixed(2)
  const openedCount = hsrLinesUpTo(displayYear).length

  async function flyToLine(line: HsrLine): Promise<void> {
    if (flyingRef.current) {
      return
    }
    if (!viewer || viewer.isDestroyed()) {
      return
    }
    flyingRef.current = true
    try {
      const mid = line.path[Math.floor(line.path.length / 2)]
      const span = Math.min(1_200_000, Math.max(250_000, line.lengthKm * 420))
      const destination = await resolveFlightDestination(viewer.scene, mid[0], mid[1], span)
      if (!destination || viewer.isDestroyed()) {
        return
      }
      viewer.camera.flyTo({ destination, duration: 1.6 })
    } finally {
      flyingRef.current = false
    }
  }

  return (
    <div className={styles.transportPanel} role='group' aria-label='交通运输布局'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>交通运输布局 · 高铁网络</span>
        <Button
          variant='ghost'
          size='sm'
          aria-label='关闭交通运输面板'
          icon={<XIcon className='size-3.5' />}
          onClick={onClose}
        />
      </div>

      <YearTimeline />

      <div className={styles.chartTitle}>高铁营业里程增长（万公里）</div>
      <LineChart
        series={growthSeries}
        xMin={2008}
        xMax={HSR_END_YEAR}
        xName='年份'
        yName='万公里'
        height={170}
      />

      <div className={styles.fact}>
        截至 {displayYear} 年：全国高铁营业里程约 {mileageWan} 万公里；图中已开通干线 {openedCount}{' '}
        / {hsrLines.length} 条。拖动时间轴或播放动画，观察高铁网络如何从京津城际生长为「八纵八横」。
      </div>

      <div className={styles.chartTitle}>典型线路实地察看</div>
      <div className={styles.caseGrid}>
        {caseLines.map(line => (
          <Button
            key={line.name}
            size='sm'
            className={styles.caseButton}
            disabled={line.openedYear > displayYear}
            icon={<MapPinIcon className='size-3.5' />}
            onClick={() => void flyToLine(line)}
          >
            {line.name.split('（')[0]} · {line.openedYear}
          </Button>
        ))}
      </div>

      <Button
        className={styles.panelAction}
        size='sm'
        block
        disabled={hsrOverlayEnabled}
        onClick={() => setOverlay('hsr-network', true)}
      >
        {hsrOverlayEnabled ? '高铁网络图层已开启' : '在地球上查看高铁网络生长'}
      </Button>

      {hsrFacts.map(fact => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.panelNote}>
        营业里程为国家铁路局年度公报约数；线路走向为教学示意，点击线路可查看说明。
      </div>
    </div>
  )
}

export default TransportPanel
