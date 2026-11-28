import { Button, Segmented, Spinner } from '@renderer/components/ui'
import type { SegmentedOption } from '@renderer/components/ui'
import type { PlayerState } from '@renderer/composables/useScenePlayer'
import { useGlobeStore } from '@renderer/stores/globe'
import { useScenesStore } from '@renderer/stores/scenes'
import type { RecordingPrewarmQuality } from '@renderer/stores/scenes'
import { SkipForwardIcon } from 'lucide-react'
import { useEffect } from 'react'

import { performanceBudget } from '../../../common/performanceBudget'

import styles from './ScenePlayerOverlay.module.css'

export interface ScenePlayerOverlayProps {
  player: PlayerState
  onNext: () => void
  onStop: () => void
}

const prewarmRank: Record<RecordingPrewarmQuality, number> = { standard: 0, high: 1, ultra: 2 }

export function ScenePlayerOverlay({ player, onNext, onStop }: ScenePlayerOverlayProps) {
  const recording = useScenesStore(state => state.recording)
  const setRecording = useScenesStore(state => state.setRecording)
  const skipRecordingPrewarm = useScenesStore(state => state.skipRecordingPrewarm)
  const performanceMode = useGlobeStore(state => state.performanceMode)
  const prewarmCap = performanceBudget(performanceMode).maxPrewarmQuality
  const prewarmQualityOptions: SegmentedOption<RecordingPrewarmQuality>[] = [
    { label: '标准', value: 'standard' },
    { label: '高清', value: 'high', disabled: prewarmRank.high > prewarmRank[prewarmCap] },
    { label: '极清', value: 'ultra', disabled: prewarmRank.ultra > prewarmRank[prewarmCap] }
  ]

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if (!player.active) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onStop()
        return
      }
      if (event.code === 'Space' || event.key === 'ArrowRight') {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [player.active, onNext, onStop])

  if (!player.active) {
    return null
  }

  const recordingActive = recording.state === 'recording' || recording.state === 'preparing'
  const isRecordingPreparing = recording.state === 'preparing'
  const prewarmNotice = recording.prewarmMessage || '正在准备录制…'
  const prewarmTotal = recording.prewarmTotal || player.prewarmTotal
  const prewarmStep = recording.prewarmStep || player.prewarmIndex
  const prewarmProgress =
    prewarmTotal > 0 ? `${Math.min(prewarmStep, prewarmTotal)} / ${prewarmTotal}` : ''
  const prewarmWarning = recording.prewarmTimedOut
    ? recording.prewarmMessage || '网络较慢，部分地图细节将在录制时继续加载。'
    : ''

  let recordNotice = ''
  if (recording.state === 'preparing') {
    recordNotice = '正在准备录制…'
  } else if (recording.state === 'recording') {
    recordNotice = `录制中 ${recording.currentStep}/${recording.totalSteps}`
  } else if (recording.state === 'saving') {
    recordNotice = '正在保存视频…'
  } else if (recording.state === 'error') {
    recordNotice = `录制失败：${recording.error}`
  }

  return (
    <div className={styles.sceneOverlay}>
      {player.prewarming ? (
        <div className={styles.prewarmMask}>
          <Spinner size='md' />
          <div className={styles.prewarmText}>
            {isRecordingPreparing ? prewarmNotice : '正在准备课程资源…'}
          </div>
          {prewarmProgress && <div className={styles.prewarmProgress}>{prewarmProgress}</div>}
          {isRecordingPreparing && (
            <div className={styles.prewarmQuality}>
              <div className={styles.prewarmQualityLabel}>画质</div>
              <Segmented<RecordingPrewarmQuality>
                value={recording.prewarmQuality}
                options={prewarmQualityOptions}
                size='sm'
                onChange={value => {
                  const requested = value === 'ultra' || value === 'standard' ? value : 'high'
                  const quality =
                    prewarmRank[requested] > prewarmRank[prewarmCap] ? prewarmCap : requested
                  setRecording({ prewarmQuality: quality })
                }}
              />
            </div>
          )}
          {prewarmWarning && <div className={styles.prewarmWarning}>{prewarmWarning}</div>}
          {isRecordingPreparing && (
            <div className={styles.prewarmActions}>
              <Button
                size='sm'
                onClick={event => {
                  event.stopPropagation()
                  skipRecordingPrewarm()
                }}
              >
                跳过预加载
              </Button>
              <Button
                size='sm'
                danger
                onClick={event => {
                  event.stopPropagation()
                  onStop()
                }}
              >
                取消录制
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.stageHit} aria-label='下一幕' onClick={onNext} />
          <div className={styles.sceneTop}>
            {recordingActive && <span className={styles.recDot} aria-hidden='true' />}
            <span className={styles.sceneTitle}>{player.title || '教学演示'}</span>
            <span className={styles.sceneCounter}>
              {player.currentIndex + 1} / {player.total}
            </span>
            {player.mode === 'manual' && <span className={styles.sceneMode}>手动模式</span>}
          </div>
          {(player.narration || player.sceneName) && (
            <div className={styles.sceneCaption}>
              {player.sceneName && <div className={styles.captionName}>{player.sceneName}</div>}
              {player.narration && <div className={styles.captionText}>{player.narration}</div>}
            </div>
          )}
          {recordNotice && <div className={styles.recordNotice}>{recordNotice}</div>}
          <div className={styles.sceneControls}>
            <Button
              icon={<SkipForwardIcon className='size-4' />}
              onClick={event => {
                event.stopPropagation()
                onNext()
              }}
            >
              下一幕
            </Button>
            <Button
              danger
              onClick={event => {
                event.stopPropagation()
                onStop()
              }}
            >
              退出演示
            </Button>
          </div>
          <div className={styles.sceneHint}>
            {player.mode === 'manual'
              ? '空格 / 点击画面 · 下一幕　Esc · 退出'
              : '自动播放中 · 点击提前下一幕　Esc · 退出'}
          </div>
        </>
      )}
    </div>
  )
}

export default ScenePlayerOverlay
