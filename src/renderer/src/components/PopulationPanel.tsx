import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button, Segmented } from '@renderer/components/ui'
import { useClimateStore } from '@renderer/stores/climate'
import {
  POPULATION_CENSUS_YEAR,
  censusAgeStructure,
  huComparison,
  huLineFacts,
  migrationFacts,
  pyramid2020,
  pyramidAgeGroups,
  pyramidFacts,
  urbanizationFacts,
  urbanizationSeries
} from '@renderer/thematic/populationCensus'
import BarChart, { type BarSeries } from './charts/BarChart'
import LineChart, { type ChartSeries } from './charts/LineChart'
import styles from './PopulationPanel.module.css'

export interface PopulationPanelProps {
  onClose: () => void
}

type Tab = 'pyramid' | 'urbanization' | 'hu-line'

const tabOptions: Array<{ value: Tab; label: string }> = [
  { value: 'pyramid', label: '金字塔' },
  { value: 'urbanization', label: '城镇化' },
  { value: 'hu-line', label: '胡焕庸线' }
]

const pyramidCategories = [...pyramidAgeGroups]
const pyramidValueBound = Math.ceil(Math.max(...pyramid2020.male.map(Math.abs), ...pyramid2020.female) / 50) * 50
const pyramidSeries: BarSeries[] = [
  { name: '男', color: '#1677ff', values: pyramid2020.male.map((value) => -value) },
  { name: '女', color: '#f759ab', values: [...pyramid2020.female] }
]

const structureCategories = censusAgeStructure.map((item) => String(item.year))
const structureSeries: BarSeries[] = [
  { name: '0-14岁', color: '#1677ff', values: censusAgeStructure.map((item) => item.youngPct) },
  { name: '15-64岁', color: '#52c41a', values: censusAgeStructure.map((item) => item.workingPct) },
  { name: '65岁及以上', color: '#fa541c', values: censusAgeStructure.map((item) => item.elderlyPct) }
]

const urbanizationChartSeries: ChartSeries[] = [
  { name: '城镇化率', color: '#1677ff', points: urbanizationSeries, markY: [30, 70] }
]

const huCategories = ['面积占比', '人口占比']
const huSeries: BarSeries[] = [
  { name: '胡线以东', color: '#1677ff', values: [huComparison.eastAreaPct, huComparison.eastPopPct] },
  { name: '胡线以西', color: '#fa8c16', values: [huComparison.westAreaPct, huComparison.westPopPct] }
]

export function PopulationPanel({ onClose }: PopulationPanelProps) {
  const provincePopulationEnabled = useClimateStore((state) => state.overlays['province-population'])
  const huLineEnabled = useClimateStore((state) => state.overlays['hu-line'])
  const setOverlay = useClimateStore((state) => state.setOverlay)
  const [tab, setTab] = useState<Tab>('pyramid')

  return (
    <div className={styles.populationPanel} role="group" aria-label="人口">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>人口</span>
        <Segmented
          value={tab}
          size="sm"
          options={tabOptions}
          aria-label="人口面板标签"
          onChange={(value) => setTab(value as Tab)}
        />
        <Button variant="ghost" size="sm" aria-label="关闭人口面板" icon={<XIcon className="size-3.5" />} onClick={onClose} />
      </div>

      {tab === 'pyramid' ? (
        <>
          <div className={styles.chartTitle}>人口年龄结构（{POPULATION_CENSUS_YEAR} · 万人）</div>
          <BarChart
            categories={pyramidCategories}
            series={pyramidSeries}
            orientation="horizontal"
            showLegend
            absValues
            valueMin={-pyramidValueBound}
            valueMax={pyramidValueBound}
            xName="万人"
            height={252}
          />
          <div className={styles.chartTitle}>历次普查年龄结构（%）</div>
          <BarChart
            categories={structureCategories}
            series={structureSeries}
            stacked
            showLegend
            valueMin={0}
            valueMax={100}
            yName="%"
            height={150}
          />
          {pyramidFacts.map((fact) => (
            <div key={fact} className={styles.fact}>
              · {fact}
            </div>
          ))}
          <div className={styles.panelNote}>
            数据：国家统计局第七次全国人口普查公报与《中国统计年鉴 2021》表 2-17；年龄结构为历次普查公布数。
          </div>
        </>
      ) : tab === 'urbanization' ? (
        <>
          <div className={styles.chartTitle}>中国常住人口城镇化率（%）</div>
          <LineChart
            series={urbanizationChartSeries}
            xMin={1949}
            xMax={2023}
            yMin={0}
            yMax={80}
            xName="年份"
            yName="%"
            height={180}
          />
          {urbanizationFacts.map((fact) => (
            <div key={fact} className={styles.fact}>
              · {fact}
            </div>
          ))}
          <Button
            className={styles.panelAction}
            size="sm"
            block
            disabled={provincePopulationEnabled}
            onClick={() => setOverlay('province-population', true)}
          >
            {provincePopulationEnabled ? '省级人口密度图层已开启' : '在地球上查看省级人口密度'}
          </Button>
          <div className={styles.panelNote}>
            城镇人口比重 1949-2020 年取自《中国统计年鉴 2021》表 2-1，2023 年取自国家统计局公报。
          </div>
        </>
      ) : (
        <>
          <div className={styles.chartTitle}>胡焕庸线两侧对比（%）</div>
          <BarChart
            categories={huCategories}
            series={huSeries}
            showLegend
            valueMin={0}
            valueMax={100}
            yName="%"
            height={160}
          />
          {huLineFacts.map((fact) => (
            <div key={fact} className={styles.fact}>
              · {fact}
            </div>
          ))}
          <Button
            className={styles.panelAction}
            size="sm"
            block
            disabled={huLineEnabled}
            onClick={() => setOverlay('hu-line', true)}
          >
            {huLineEnabled ? '胡焕庸线图层已开启' : '在地球上查看胡焕庸线'}
          </Button>
          <div className={styles.panelNote}>
            两侧对比为常用教科书概算数字；切换到「胡焕庸线」图层可在地球上查看东西两侧标注。
          </div>
          <div className={styles.chartTitle}>省际迁移主线</div>
          {migrationFacts.map((fact) => (
            <div key={fact} className={styles.fact}>
              · {fact}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default PopulationPanel
