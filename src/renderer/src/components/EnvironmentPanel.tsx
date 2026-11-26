import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as Cesium from 'cesium'
import { MapPinIcon, XIcon } from 'lucide-react'
import { Button, Segmented } from '@renderer/components/ui'
import { useClimateStore } from '@renderer/stores/climate'
import {
  SEA_LEVEL_SCENARIOS,
  coastalZones,
  inundationByZone,
  scenarioSummary,
  seaLevelFacts,
  totalGridCellCount,
  useSeaLevelStore,
  type SeaLevelScenario
} from '@renderer/thematic/seaLevelRise'
import { ensureSeaLevelSamples } from '@renderer/composables/seaLevelSampling'
import BarChart, { type BarSeries } from './charts/BarChart'
import styles from './EnvironmentPanel.module.css'

export interface EnvironmentPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

const scenarioOptions = SEA_LEVEL_SCENARIOS.map((value) => ({ label: `+${value} m`, value }))

export function EnvironmentPanel({ viewer, onClose }: EnvironmentPanelProps) {
  const rise = useClimateStore((state) => state.seaLevelRise)
  const setSeaLevelRise = useClimateStore((state) => state.setSeaLevelRise)
  const seaLevelOverlayEnabled = useClimateStore((state) => state.overlays['sea-level-rise'])
  const setOverlay = useClimateStore((state) => state.setOverlay)

  const sampleVersion = useSeaLevelStore((state) => state.version)
  const landMask = useSeaLevelStore((state) => state.landMask)
  const samplingStatus = useSeaLevelStore((state) => state.samplingStatus)

  const flyingRef = useRef(false)

  const stats = useMemo(() => {
    void sampleVersion
    void landMask
    return inundationByZone(rise)
  }, [rise, sampleVersion, landMask])

  const totalArea = useMemo(() => stats.reduce((sum, item) => sum + item.areaKm2, 0), [stats])
  const sampledReady = samplingStatus === 'ready'
  const hasSamples = stats.some((item) => item.sampled > 0)
  const sampledCount = stats.reduce((sum, item) => sum + item.sampled, 0)
  const partialSamples = sampledReady && sampledCount < totalGridCellCount
  const maskFallback = sampledReady && landMask === null

  const categories = useMemo(() => stats.map((item) => item.zone.name.split('（')[0]), [stats])
  const series = useMemo<BarSeries[]>(
    () => [{ name: `淹没面积（+${rise} m）`, color: '#1677ff', values: stats.map((item) => item.areaKm2) }],
    [rise, stats]
  )

  const beginSampling = useCallback(async (): Promise<void> => {
    if (!viewer || viewer.isDestroyed()) return
    await ensureSeaLevelSamples(viewer)
  }, [viewer])

  useEffect(() => {
    void beginSampling()
  }, [beginSampling])

  function flyToZone(index: number): void {
    if (flyingRef.current) return
    if (!viewer || viewer.isDestroyed()) return
    flyingRef.current = true
    try {
      const zone = coastalZones[index]
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(zone.center[0], zone.center[1], zone.center[2]),
        duration: 1.5
      })
    } finally {
      flyingRef.current = false
    }
  }

  return (
    <div className={styles.environmentPanel} role="group" aria-label="环境与发展">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>环境与发展 · 海平面上升</span>
        <Button variant="ghost" size="sm" aria-label="关闭环境面板" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>

      <div className={styles.chartTitle}>海平面上升高度</div>
      <Segmented
        value={rise}
        options={scenarioOptions}
        className={styles.scenarioPicker}
        onChange={(value) => setSeaLevelRise(value as SeaLevelScenario)}
      />

      {sampledReady ? (
        <>
          <div className={styles.chartTitle}>沿海低地预计淹没面积（km²）</div>
          {hasSamples && <BarChart categories={categories} series={series} valueMin={0} yName="km²" height={170} />}
          {partialSamples && (
            <div className={styles.panelNote}>
              部分地形数据未加载，当前估算偏保守。
              <Button variant="link" size="sm" onClick={() => void beginSampling()}>
                重试
              </Button>
            </div>
          )}
          {maskFallback && <div className={styles.panelNote}>海陆边界加载失败，当前估算仅供参考。</div>}
        </>
      ) : samplingStatus === 'terrain-required' ? (
        <div className={styles.panelNote}>请先在「图层管理 → 3D 地形」中开启「全球 3D 地形」。</div>
      ) : samplingStatus === 'sampling' ? (
        <div className={styles.panelNote}>正在计算沿海地形高度，请稍候…</div>
      ) : (
        <div className={styles.panelNote}>
          地形数据加载未完成。
          <Button variant="link" size="sm" onClick={() => void beginSampling()}>
            重试
          </Button>
        </div>
      )}

      <div className={styles.fact}>
        {sampledReady ? (
          <>
            海平面上升 {rise} 米时，五大沿海低地预计淹没约 {totalArea.toLocaleString()} km²。{scenarioSummary(rise)}
          </>
        ) : (
          <>
            海平面上升 {rise} 米时，淹没面积将在地形数据加载完成后显示。{scenarioSummary(rise)}
          </>
        )}
      </div>

      <div className={styles.chartTitle}>实地察看沿海低地</div>
      <div className={styles.zoneGrid}>
        {coastalZones.map((zone, index) => (
          <Button
            key={zone.id}
            size="sm"
            className={styles.zoneButton}
            icon={<MapPinIcon className="size-3.5" />}
            onClick={() => flyToZone(index)}
          >
            {zone.name.split('（')[0]}
          </Button>
        ))}
      </div>

      <Button
        className={styles.panelAction}
        size="sm"
        block
        disabled={seaLevelOverlayEnabled}
        onClick={() => setOverlay('sea-level-rise', true)}
      >
        {seaLevelOverlayEnabled ? '淹没模拟图层已开启' : '在地球上查看淹没模拟'}
      </Button>

      {seaLevelFacts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.panelNote}>注：以上为教学模拟估算，未计入海堤防护等人工措施。</div>
    </div>
  )
}

export default EnvironmentPanel
