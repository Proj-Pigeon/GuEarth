import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCwIcon, XIcon } from 'lucide-react'
import { Button, Select } from '@renderer/components/ui'
import { useClimateStore } from '@renderer/stores/climate'
import { useGlobeStore } from '@renderer/stores/globe'
import type { PoiStatisticsResult } from '../../../preload'
import {
  CENTRAL_PLACE_CASES,
  CITY_TIER_META,
  centralPlaceFacts,
  urbanCities,
  type CentralPlaceCase
} from '@renderer/thematic/urbanCities'
import BarChart, { type BarSeries } from './charts/BarChart'
import styles from './CitiesPanel.module.css'

export interface CitiesPanelProps {
  onClose: () => void
}

const VERIFICATION_RADIUS_KM = 3

const verificationCases = CENTRAL_PLACE_CASES.filter((item) => item.level !== 'low')
const initialHighCase = verificationCases.find((item) => item.level === 'high') ?? verificationCases[0]
const initialLowCase =
  verificationCases.find((item) => item.level === 'middle') ?? verificationCases[verificationCases.length - 1]
const caseOptions = CENTRAL_PLACE_CASES.map((item) => ({ label: item.name, value: item.name }))
const displayedFacts = centralPlaceFacts.slice(0, 3)

export function CitiesPanel({ onClose }: CitiesPanelProps) {
  const cityTiersEnabled = useClimateStore((state) => state.overlays['city-tiers'])
  const setOverlay = useClimateStore((state) => state.setOverlay)
  const missingKey = useGlobeStore((state) => !state.providerCredentials.amap?.configured)

  const [selectedHigh, setSelectedHigh] = useState<CentralPlaceCase>(initialHighCase)
  const [selectedLow, setSelectedLow] = useState<CentralPlaceCase>(initialLowCase)
  const [running, setRunning] = useState(false)
  const [highResult, setHighResult] = useState<PoiStatisticsResult | null>(null)
  const [lowResult, setLowResult] = useState<PoiStatisticsResult | null>(null)
  const [statusText, setStatusText] = useState('')
  const requestSeqRef = useRef(0)

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1
    }
  }, [])

  function selectCase(tier: 'high' | 'low', name: string): void {
    const item = CENTRAL_PLACE_CASES.find((candidate) => candidate.name === name)
    if (!item) return
    requestSeqRef.current += 1
    if (tier === 'high') {
      if (item.name === selectedLow.name) setSelectedLow(selectedHigh)
      setSelectedHigh(item)
    } else {
      if (item.name === selectedHigh.name) setSelectedHigh(selectedLow)
      setSelectedLow(item)
    }
    setRunning(false)
    setHighResult(null)
    setLowResult(null)
    setStatusText('')
  }

  async function runVerification(): Promise<void> {
    if (running) return
    requestSeqRef.current += 1
    const seq = requestSeqRef.current
    setRunning(true)
    setHighResult(null)
    setLowResult(null)
    setStatusText('正在统计，请稍候…')
    try {
      const [high, low] = await Promise.all([
        window.guEarth.places.poiStatistics({
          centerName: selectedHigh.name,
          city: selectedHigh.city,
          radiusMeters: VERIFICATION_RADIUS_KM * 1000,
          maxSamples: 400
        }),
        window.guEarth.places.poiStatistics({
          centerName: selectedLow.name,
          city: selectedLow.city,
          radiusMeters: VERIFICATION_RADIUS_KM * 1000,
          maxSamples: 400
        })
      ])
      if (requestSeqRef.current !== seq) return
      setHighResult(high)
      setLowResult(low)
      if (high.error || low.error) {
        setStatusText([high.error, low.error].filter(Boolean).join('；'))
        return
      }
      const highCategories = high.categories.length
      const lowCategories = low.categories.length
      setStatusText(
        `高级中心地：${high.sampled} 条 / ${highCategories} 类；低级中心地：${low.sampled} 条 / ${lowCategories} 类。${
          highCategories >= lowCategories && high.sampled >= low.sampled
            ? '结果符合中心地理论：等级越高，服务数量越多、类别越齐全。'
            : '本次对比差异不明显，可更换城市后重试。'
        }`
      )
    } catch (error) {
      if (requestSeqRef.current !== seq) return
      setStatusText(error instanceof Error ? error.message : '数据请求失败，请重试')
    } finally {
      if (requestSeqRef.current === seq) setRunning(false)
    }
  }

  const topCategories = useMemo(() => {
    const union = new Map<string, string>()
    for (const item of highResult?.categories ?? []) union.set(item.code, item.label)
    for (const item of lowResult?.categories ?? []) union.set(item.code, item.label)
    const rank = (code: string, result: PoiStatisticsResult | null): number =>
      result?.categories.find((item) => item.code === code)?.count ?? 0
    return [...union.entries()]
      .map(([code, label]) => ({ code, label, high: rank(code, highResult), low: rank(code, lowResult) }))
      .sort((a, b) => b.high + b.low - (a.high + a.low))
      .slice(0, 8)
  }, [highResult, lowResult])

  const categories = useMemo(() => topCategories.map((item) => item.label), [topCategories])
  const series = useMemo<BarSeries[]>(
    () => [
      { name: `高级：${selectedHigh.name}`, color: '#d4380d', values: topCategories.map((item) => item.high) },
      { name: `低级：${selectedLow.name}`, color: '#52c41a', values: topCategories.map((item) => item.low) }
    ],
    [selectedHigh.name, selectedLow.name, topCategories]
  )

  const uniqueHighLabels = topCategories
    .filter((item) => item.high > 0 && item.low === 0)
    .map((item) => item.label)
    .join('、')

  return (
    <div className={styles.citiesPanel} role="group" aria-label="城镇与中心地">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>城镇体系与中心地</span>
        <Button variant="ghost" size="sm" aria-label="关闭城镇面板" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>

      <div className={styles.chartTitle}>城市等级体系（{CITY_TIER_META.length} 级）</div>
      <div className={styles.tierTable}>
        <div className={`${styles.tierRow} ${styles.tierHead}`}>
          <span>等级</span>
          <span>数量</span>
          <span>示例</span>
          <span>服务半径</span>
        </div>
        {CITY_TIER_META.map((meta) => (
          <div key={meta.id} className={styles.tierRow}>
            <span className={styles.tierName}>
              <span className={styles.tierDot} style={{ background: meta.color }} />
              {meta.name}
            </span>
            <span className={styles.tierNum}>{urbanCities.filter((city) => city.tier === meta.id).length}</span>
            <span>{urbanCities.find((city) => city.tier === meta.id)?.name ?? '—'}</span>
            <span className={styles.tierNum}>≈ {meta.serviceRadiusKm} km</span>
          </div>
        ))}
      </div>
      {displayedFacts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}

      <div className={styles.chartTitle}>中心地验证（同半径 {VERIFICATION_RADIUS_KM} km POI 对比）</div>
      <div className={styles.casePickers}>
        <Select
          value={selectedHigh.name}
          size="sm"
          className={styles.caseSelect}
          options={caseOptions}
          onChange={(value) => {
            if (value) selectCase('high', String(value))
          }}
        />
        <span className={styles.vs}>vs</span>
        <Select
          value={selectedLow.name}
          size="sm"
          className={styles.caseSelect}
          options={caseOptions}
          onChange={(value) => {
            if (value) selectCase('low', String(value))
          }}
        />
      </div>
      {missingKey && <div className={styles.panelNote}>请先在「设置 → 地图」中配置高德地图密钥。</div>}
      <Button
        className={styles.panelAction}
        size="sm"
        block
        disabled={running || missingKey}
        icon={<RefreshCwIcon className={running ? 'size-3.5 animate-spin' : 'size-3.5'} />}
        onClick={() => void runVerification()}
      >
        {running ? '统计中…' : '开始对比统计'}
      </Button>
      {statusText && <p className={styles.fact}>{statusText}</p>}
      {highResult && lowResult && !highResult.error && !lowResult.error && (
        <>
          {categories.length > 0 && (
            <BarChart categories={categories} series={series} showLegend valueMin={0} yName="条" height={176} />
          )}
          {topCategories.length > 0 && (
            <>
              <div className={styles.chartTitle}>高级职能类别（仅高等级中心地出现）</div>
              <div className={styles.fact}>
                高级类别差异：{uniqueHighLabels || '本次抽样未见独有高级职能'}
              </div>
            </>
          )}
        </>
      )}
      <Button
        className={styles.panelAction}
        size="sm"
        block
        disabled={cityTiersEnabled}
        onClick={() => setOverlay('city-tiers', true)}
      >
        {cityTiersEnabled ? '城市等级图层已开启' : '在地球上查看城市等级体系'}
      </Button>
      <div className={styles.panelNote}>数据来源：第七次人口普查、高德地图</div>
    </div>
  )
}

export default CitiesPanel
