import { Button, Slider } from 'antd'
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useTransportStore } from '@renderer/stores/transport'
import { HSR_END_YEAR, HSR_START_YEAR, hsrMileageAt } from '@renderer/thematic/hsrLines'
import styles from './YearTimeline.module.css'

export interface YearTimelineProps {}

const marks: Record<number, string> = {
  2008: '2008',
  2012: '2012',
  2016: '2016',
  2020: '2020',
  2025: '2025'
}

export function YearTimeline(_props: YearTimelineProps) {
  const year = useTransportStore((state) => state.year)
  const isPlaying = useTransportStore((state) => state.isPlaying)
  const togglePlaying = useTransportStore((state) => state.togglePlaying)
  const setYear = useTransportStore((state) => state.setYear)
  const advance = useTransportStore((state) => state.advance)

  useVisibleAnimation(isPlaying, (dt) => {
    if (dt > 0) advance(dt)
  })

  const displayYear = Math.floor(year)
  const mileageText = `约 ${(hsrMileageAt(displayYear) / 10000).toFixed(2)} 万公里`

  return (
    <div className={styles.yearTimeline} role="group" aria-label="年份时间轴">
      <Button
        type={isPlaying ? 'primary' : 'default'}
        shape="circle"
        aria-label={isPlaying ? '暂停年份播放' : '播放年份动画'}
        icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
        onClick={togglePlaying}
      />
      <div className={styles.yearReadout}>
        <span className={styles.yearValue}>{displayYear} 年</span>
        <span className={styles.mileageText}>{mileageText}</span>
      </div>
      <Slider
        value={displayYear}
        min={HSR_START_YEAR}
        max={HSR_END_YEAR}
        step={1}
        marks={marks}
        className={styles.yearSlider}
        ariaLabelForHandle="年份选择"
        tooltip={{ open: false }}
        onChange={(value: number) => setYear(value)}
      />
    </div>
  )
}

export default YearTimeline
