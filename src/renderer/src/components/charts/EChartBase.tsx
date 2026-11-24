import { useEffect, useRef, type CSSProperties } from 'react'
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

use([SVGRenderer])

export interface EChartBaseProps {
  option: EChartsCoreOption
  className?: string
  style?: CSSProperties
  notMerge?: boolean
}

export function EChartBase({ option, className, style, notMerge = true }: EChartBaseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const chart = init(element, undefined, { renderer: 'svg' })
    chartRef.current = chart
    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge })
  }, [option, notMerge])

  return <div ref={containerRef} className={className} style={style} />
}

export default EChartBase
