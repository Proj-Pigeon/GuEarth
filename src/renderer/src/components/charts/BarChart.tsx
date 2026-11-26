import { useMemo } from 'react'
import { use } from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { BarChart as EChartsBarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { useGlobeStore } from '@renderer/stores/globe'
import EChartBase from './EChartBase'
import styles from './BarChart.module.css'

use([EChartsBarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer])

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

export interface BarChartProps {
  categories: string[]
  series: BarSeries[]
  orientation?: 'vertical' | 'horizontal'
  stacked?: boolean
  showLegend?: boolean
  absValues?: boolean
  valueMin?: number
  valueMax?: number
  xName?: string
  yName?: string
  height?: number
}

interface TooltipParam {
  marker: string
  seriesName: string
  value: number
  name: string
}

const MONO_FONT = 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'

function formatNumber(value: number): string {
  const magnitude = Math.abs(value)
  const text = Number.isInteger(magnitude) ? String(magnitude) : (Math.round(magnitude * 10) / 10).toString()
  return value < 0 ? `-${text}` : text
}

export function BarChart({
  categories,
  series,
  orientation = 'vertical',
  stacked = false,
  showLegend = false,
  absValues = false,
  valueMin,
  valueMax,
  xName,
  yName,
  height = 180
}: BarChartProps) {
  const resolvedTheme = useGlobeStore((state) => state.resolvedTheme)

  const option = useMemo<EChartsCoreOption>(() => {
    const isDark = resolvedTheme === 'dark'
    const axisInk = isDark ? 'rgba(236, 236, 236, 0.55)' : 'rgba(13, 13, 13, 0.48)'
    const axisLine = isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(13, 13, 13, 0.32)'
    const splitLine = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
    const legendInk = isDark ? 'rgba(236, 236, 236, 0.72)' : 'rgba(13, 13, 13, 0.65)'
    const tooltipBg = isDark ? '#262626' : '#0d0d0d'
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'transparent'

    const horizontal = orientation === 'horizontal'
    const valueAxis = {
      type: 'value',
      min: valueMin,
      max: valueMax,
      name: horizontal ? xName : yName,
      nameTextStyle: { color: axisInk, fontSize: 11, align: 'left' },
      axisLabel: {
        color: axisInk,
        fontFamily: MONO_FONT,
        fontSize: 11,
        formatter: (value: number) => (absValues ? formatNumber(Math.abs(value)) : formatNumber(value))
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitLine } }
    }
    const categoryAxis = {
      type: 'category',
      data: categories,
      axisLabel: { color: axisInk, fontFamily: MONO_FONT, fontSize: 11, hideOverlap: true },
      axisLine: { show: true, lineStyle: { color: axisLine } },
      axisTick: { show: false },
      splitLine: { show: false }
    }
    return {
      animation: false,
      grid: { left: 48, right: 20, top: 30, bottom: 30 },
      legend: showLegend
        ? {
            top: 0,
            left: 'center',
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 12,
            textStyle: { color: legendInk, fontSize: 11 }
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: isDark ? 1 : 0,
        padding: [4, 8],
        textStyle: { color: '#ffffff', fontSize: 12, lineHeight: 20 },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? (params as TooltipParam[]) : [params as TooltipParam]
          if (list.length === 0) {return ''}
          const rows = list
            .filter((item) => item && item.seriesName)
            .map(
              (item) =>
                `${item.marker}${item.seriesName} ${absValues ? formatNumber(Math.abs(item.value)) : formatNumber(item.value)}`
            )
            .join('<br/>')
          return `${list[0].name}<br/>${rows}`
        }
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis } : { ...valueAxis },
      series: series.map((item) => ({
        type: 'bar',
        name: item.name,
        data: item.values,
        stack: stacked ? 'total' : undefined,
        barMaxWidth: 22,
        itemStyle: { color: item.color },
        emphasis: { disabled: true }
      }))
    }
  }, [categories, series, orientation, stacked, showLegend, absValues, valueMin, valueMax, xName, yName, resolvedTheme])

  return <EChartBase className={styles.barChart} option={option} style={{ height: `${height}px` }} />
}

export default BarChart
