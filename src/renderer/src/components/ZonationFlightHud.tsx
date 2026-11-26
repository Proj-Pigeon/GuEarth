import { Button, Progress } from '@renderer/components/ui'
import { useZonationStore } from '@renderer/stores/zonation';
import type { ZonationFlightStage } from '@renderer/stores/zonation';
import { cancelTransectFlight } from '@renderer/composables/useTransectFlight'
import styles from './ZonationFlightHud.module.css'

export interface ZonationFlightHudProps {}

const stageText: Record<ZonationFlightStage, string> = {
  sampling: '正在规划飞行高度…',
  prewarm: '正在加载沿线地图…',
  flying: '剖面飞行中'
}

export function ZonationFlightHud(_props: ZonationFlightHudProps) {
  const flightHud = useZonationStore((state) => state.flightHud)

  if (!flightHud) {return null}

  const percent =
    flightHud.total > 0 ? Math.min(100, Math.round((flightHud.completed / flightHud.total) * 100)) : 0

  const metaText =
    flightHud.stage === 'sampling'
      ? '请稍候…'
      : flightHud.stage === 'flying' && flightHud.altitudeM !== undefined
        ? `高度 ${Math.round(flightHud.altitudeM).toLocaleString()} 米`
        : `${flightHud.completed} / ${flightHud.total}`

  return (
    <div className={styles.flightHud} role="status" aria-label="剖面飞行进度">
      <div className={styles.hudTitle}>剖面飞行</div>
      <div className={styles.hudStage}>{stageText[flightHud.stage]}</div>
      {flightHud.stage !== 'sampling' && (
        <Progress percent={percent} showInfo={false} />
      )}
      <div className={styles.hudMeta}>
        <span className={styles.hudCount}>{metaText}</span>
        <Button size="sm" onClick={cancelTransectFlight}>
          停止
        </Button>
      </div>
    </div>
  )
}

export default ZonationFlightHud
