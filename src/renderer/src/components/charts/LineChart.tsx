import { useMemo } from 'react'
import { use as registerEcharts } from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { LineChart as EChartsLineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { useGlobeStore } from '@renderer/stores/globe'
import EChartBase from './EChartBase'
import styles from './LineChart.module.css'

registerEcharts([EChartsLineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

export interface ChartSeries {
  name: string
  color: string
  points: [number, number][]
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
  const resolvedTheme = useGlobeStore((state) => state.resolvedTheme)

  const option = useMemo<EChartsCoreOption>(() => {
    const isDark = resolvedTheme === 'dark'
    const axisInk = isDark ? 'rgba(236, 236, 236, 0.55)' : 'rgba(13, 13, 13, 0.48)'
    const axisLine = isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(13, 13, 13, 0.32)'
    const splitLine = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
    const markLineColor = isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.25)'
    const tooltipBg = isDark ? '#262626' : '#0d0d0d'
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'transparent'

    return {
      animation: false,
      grid: { left: 48, right: 20, top: 30, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: isDark ? 1 : 0,
        padding: [4, 8],
        textStyle: { color: '#ffffff', fontSize: 12, lineHeight: 20 },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? (params as TooltipParam[]) : []
          if (list.length === 0) {return ''}
          const head = xFormatter ? xFormatter(list[0].value[0]) : String(list[0].value[0])
          const rows = list
            .map((item) => `${item.marker}${item.seriesName} ${Math.round(item.value[1] * 10) / 10}`)
            .join('<br/>')
          return `${head}<br/>${rows}`
        }
      },
      xAxis: {
        type: 'value',
        min: xMin,
        max: xMax,
        name: xName,
        nameTextStyle: { color: axisInk, fontSize: 11 },
        nameGap: 18,
        axisLabel: {
          color: axisInk,
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: number) => (xFormatter ? xFormatter(value) : String(value))
        },
        axisLine: { show: true, lineStyle: { color: axisLine } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        name: yName,
        nameTextStyle: { color: axisInk, fontSize: 11, align: 'left' },
        axisLabel: {
          color: axisInk,
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 11
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: splitLine } }
      },
      series: series.map((item) => ({
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
              lineStyle: { color: markLineColor, type: 'dashed', width: 1 },
              data: item.markY.map((y) => ({ yAxis: y }))
            }
          : undefined
      }))
    }
  }, [series, xName, xMin, xMax, xFormatter, yName, yMin, yMax, resolvedTheme])

  return <EChartBase className={styles.lineChart} option={option} style={{ height: `${height}px` }} />
}

export default LineChart
