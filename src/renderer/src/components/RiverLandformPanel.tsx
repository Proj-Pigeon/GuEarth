import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { Loader2Icon, XIcon } from 'lucide-react'
import { Alert, Button } from '@renderer/components/ui'
import LineChart from './charts/LineChart';
import type { ChartSeries } from './charts/LineChart';
import styles from './RiverLandformPanel.module.css'

export interface RiverLandformPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

interface RiverReach {
  id: string
  name: string
  stage: string
  center: [number, number, number]
  waypoints: [number, number][]
  landform: string
  facts: string[]
}

const reaches: RiverReach[] = [
  {
    id: 'upper',
    name: '上游 · 金沙江虎跳峡',
    stage: '上游：V 形谷',
    center: [100.05, 27.25, 46_000],
    waypoints: [
      [99.8, 27.48],
      [99.92, 27.37],
      [100.02, 27.3],
      [100.12, 27.18],
      [100.26, 27.02]
    ],
    landform: 'V 形谷（峡谷）：落差大、流速快，以下切侵蚀为主',
    facts: [
      '河流上游落差大、流速快，垂直下切侵蚀为主，形成深邃的 V 形峡谷',
      '虎跳峡两岸为玉龙、哈巴雪山，谷坡陡峻，江面与峰顶高差达 3000 多米',
      '峡谷内水量丰富、落差集中，水能资源极为丰富，适合梯级开发'
    ]
  },
  {
    id: 'middle',
    name: '中游 · 荆江河曲',
    stage: '中游：河曲',
    center: [112.5, 29.75, 150_000],
    waypoints: [
      [111.8, 29.9],
      [112.1, 29.72],
      [112.4, 29.82],
      [112.7, 29.62],
      [113, 29.72]
    ],
    landform: '河曲：侧蚀为主，凹岸侵蚀、凸岸堆积',
    facts: [
      '进入中下游平原，流速减慢，侧向侵蚀增强，河流左右摆动形成河曲（蛇曲）',
      '凹岸（侵蚀岸）水深，可建港口；凸岸（堆积岸）沙滩发育，可淘金、建聚落与农业区',
      '荆江“九曲回肠”，历史上多次自然裁弯取直，留下牛轭湖遗迹'
    ]
  },
  {
    id: 'lower',
    name: '下游 · 长江三角洲',
    stage: '下游：三角洲',
    center: [120.7, 31.6, 300_000],
    waypoints: [
      [118.8, 31.95],
      [119.8, 31.75],
      [120.6, 31.58],
      [121.4, 31.42],
      [122, 31.3]
    ],
    landform: '三角洲：流速骤降，泥沙堆积为主',
    facts: [
      '河流入海时流速骤降、泥沙大量堆积，形成三角洲与冲积平原',
      '长江三角洲由河流泥沙不断向海推进而成，地势低平、河网密布，是典型的堆积地貌',
      '上游水土流失加剧会使泥沙增多、三角洲伸展加快；水库拦沙则使其变缓'
    ]
  }
]

function interpolate(waypoints: [number, number][]): [number, number][] {
  const points: [number, number][] = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const [x0, y0] = waypoints[index]
    const [x1, y1] = waypoints[index + 1]
    for (let step = 0; step < 4; step += 1) {
      points.push([x0 + ((x1 - x0) * step) / 4, y0 + ((y1 - y0) * step) / 4])
    }
  }
  points.push(waypoints[waypoints.length - 1])
  return points
}

export function RiverLandformPanel({ viewer, onClose }: RiverLandformPanelProps) {
  const [activeReach, setActiveReach] = useState<RiverReach>(reaches[0])
  const [profile, setProfile] = useState<[number, number][]>([])
  const [sampling, setSampling] = useState(false)
  const [degraded, setDegraded] = useState(false)

  const activeReachRef = useRef<RiverReach>(reaches[0])
  const sampleSeqRef = useRef(0)

  const series = useMemo<ChartSeries[]>(() => [{ name: '沿河高程剖面', color: '#722ed1', points: profile }], [profile])

  const sampleProfile = useCallback(async (reach: RiverReach, targetViewer: Cesium.Viewer | undefined): Promise<void> => {
    sampleSeqRef.current += 1
    const seq = sampleSeqRef.current
    setProfile([])
    if (!targetViewer || targetViewer.isDestroyed()) {return}
    setSampling(true)
    setDegraded(false)
    try {
      const points = interpolate(reach.waypoints)
      const cartographics = points.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat))
      let heights: number[]
      let isDegraded = false
      try {
        const sampled = await Cesium.sampleTerrainMostDetailed(targetViewer.terrainProvider, cartographics)
        if (sampleSeqRef.current !== seq || targetViewer.isDestroyed()) {return}
        heights = sampled.map((item) =>
          Number.isFinite(item.height)
            ? item.height
            : targetViewer.scene.globe.getHeight(
                Cesium.Cartographic.fromDegrees((item.longitude * 180) / Math.PI, (item.latitude * 180) / Math.PI)
              ) ?? 0
        )
        isDegraded = sampled.some((item) => !Number.isFinite(item.height))
      } catch {
        if (sampleSeqRef.current !== seq || targetViewer.isDestroyed()) {return}
        heights = cartographics.map((item) => targetViewer.scene.globe.getHeight(item) ?? 0)
        isDegraded = true
      }
      if (sampleSeqRef.current !== seq) {return}
      setDegraded(isDegraded)
      let distance = 0
      setProfile(
        points.map((point, index) => {
          if (index > 0) {
            const [px, py] = points[index - 1]
            distance += Math.hypot((point[0] - px) * 111 * Math.cos((py * Math.PI) / 180), (point[1] - py) * 111)
          }
          return [Math.round(distance * 10) / 10, Math.round((heights[index] ?? 0) * 10) / 10]
        })
      )
    } finally {
      if (sampleSeqRef.current === seq) {
        setSampling(false)
      }
    }
  }, [])

  const runReach = useCallback(
    (reach: RiverReach, targetViewer: Cesium.Viewer | undefined): void => {
      if (targetViewer && !targetViewer.isDestroyed()) {
        targetViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(reach.center[0], reach.center[1], reach.center[2]),
          duration: 1.4
        })
      }
      void sampleProfile(reach, targetViewer)
    },
    [sampleProfile]
  )

  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) {
      runReach(activeReachRef.current, viewer)
    }
    return () => {
      sampleSeqRef.current += 1
    }
  }, [viewer, runReach])

  function selectReach(reach: RiverReach): void {
    activeReachRef.current = reach
    setActiveReach(reach)
    runReach(reach, viewer)
  }

  const xMax = Math.max(60, Math.ceil(profile[profile.length - 1]?.[0] ?? 60))
  const yMin = Math.min(0, Math.floor((profile.length > 0 ? Math.min(...profile.map((p) => p[1])) : 0) / 500) * 500)
  const yMax = Math.ceil((profile.length > 0 ? Math.max(...profile.map((p) => p[1])) : 1000) / 500) * 500

  return (
    <div className={styles.riverPanel} role="group" aria-label="河流地貌发育">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>河流地貌发育</span>
        <Button variant="ghost" size="sm" aria-label="关闭河流地貌" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>
      <div className={styles.reachRow}>
        {reaches.map((reach) => (
          <Button
            key={reach.id}
            size="sm"
            variant={reach.id === activeReach.id ? 'primary' : 'default'}
            onClick={() => selectReach(reach)}
          >
            {reach.stage}
          </Button>
        ))}
      </div>
      <div className={styles.stageName}>{activeReach.name}</div>
      <div className={styles.landformLine}>{activeReach.landform}</div>
      <div className={styles.chartTitle}>
        沿河真实高程剖面
        {sampling && <Loader2Icon className={`${styles.loadingIcon} size-3.5 animate-spin`} />}
      </div>
      <LineChart
        series={series}
        xMin={0}
        xMax={xMax}
        xName="沿河距离(千米)"
        yName="海拔(米)"
        yMin={yMin}
        yMax={yMax}
        height={150}
      />
      {degraded && <Alert type="warning" showIcon title="地形源不可用或部分格网未取到，本剖面为粗略估算值" />}
      {activeReach.facts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.panelNote}>上游 V 形谷下切、中游河曲侧蚀、下游三角洲堆积，外力作用沿程演变。</div>
    </div>
  )
}

export default RiverLandformPanel
