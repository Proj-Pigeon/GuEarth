import { LineChart as EChartsLineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use, type EChartsCoreOption } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useMemo } from 'react'

import EChartBase from './EChartBase'

import styles from './LineChart.module.css'

use([EChartsLineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

export interface ChartSeries {
  name: string
  color: string
  points: Array<[number, number]>
  dashed?: boolean
  markY?: number[]
}

export interface LineChartProps {
  series: ChartSeries[]
  xName?: string
  xMin?: number
  xMax?: number
  xFormatter?: (value: number) => string
  yName?: string
  yMin?: number
  yMax?: number
  height?: number
}

interface TooltipParam {
  marker: string
  seriesName: string
  value: [number, number]
}

export function LineChart({
  series,
  xName,
  xMin,
  xMax,
  xFormatter,
  yName,
  yMin,
  yMax,
  height = 180
}: LineChartProps) {
  const option = useMemo<EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 48, right: 20, top: 30, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderWidth: 0,
        padding: [4, 8],
        textStyle: { color: '#ffffff', fontSize: 12, lineHeight: 20 },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? (params as TooltipParam[]) : []
          if (!list.length) return ''
          const head = xFormatter ? xFormatter(list[0].value[0]) : String(list[0].value[0])
          const rows = list
            .map(item => `${item.marker}${item.seriesName} ${Math.round(item.value[1] * 10) / 10}`)
            .join('<br/>')
          return `${head}<br/>${rows}`
        }
      },
      xAxis: {
        type: 'value',
        min: xMin,
        max: xMax,
        name: xName,
        nameTextStyle: { color: 'rgba(0, 0, 0, 0.45)', fontSize: 11 },
        nameGap: 18,
        axisLabel: {
          color: 'rgba(0, 0, 0, 0.45)',
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: number) => (xFormatter ? xFormatter(value) : String(value))
        },
        axisLine: { show: true, lineStyle: { color: 'rgba(0, 0, 0, 0.45)' } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        name: yName,
        nameTextStyle: { color: 'rgba(0, 0, 0, 0.45)', fontSize: 11, align: 'left' },
        axisLabel: {
          color: 'rgba(0, 0, 0, 0.45)',
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 11
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(5, 5, 5, 0.06)' } }
      },
      series: series.map(item => ({
        type: 'line',
        name: item.name,
        data: item.points,
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 2, color: item.color, type: item.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: item.color },
        emphasis: { disabled: true },
        markLine: item.markY
          ? {
              silent: true,
              symbol: ['none', 'none'],
              label: { show: false },
              lineStyle: { color: 'rgba(0, 0, 0, 0.25)', type: 'dashed', width: 1 },
              data: item.markY.map(y => ({ yAxis: y }))
            }
          : undefined
      }))
    }),
    [series, xName, xMin, xMax, xFormatter, yName, yMin, yMax]
  )

  return (
    <EChartBase className={styles.lineChart} option={option} style={{ height: `${height}px` }} />
  )
}

export default LineChart
