import { Button } from '@renderer/components/ui'
import type { DrawTool } from '@renderer/stores/drawing'
import { CheckIcon, Undo2Icon, XIcon } from 'lucide-react'

import styles from './DrawingTouchBar.module.css'

export interface DrawingTouchBarProps {
  activeTool: DrawTool | null
  draftCount: number
  onCancel: () => void
  onUndo: () => void
  onFinish: () => void
}

export function DrawingTouchBar({
  activeTool,
  draftCount,
  onCancel,
  onUndo,
  onFinish
}: DrawingTouchBarProps) {
  if (!activeTool) {
    return null
  }

  const canUndo = activeTool === 'line' || activeTool === 'polygon' || activeTool === 'arrow'
  const canFinish = activeTool === 'line' || activeTool === 'polygon'
  const minimumPoints = activeTool === 'polygon' ? 3 : 2
  const finishDisabled = draftCount < minimumPoints
  const undoDisabled = draftCount === 0

  return (
    <div className={styles.drawingTouchBar} role='toolbar' aria-label='触摸绘图操作'>
      {canUndo && (
        <Button
          className={styles.touchBarBtn}
          disabled={undoDisabled}
          icon={<Undo2Icon className='size-4' />}
          aria-label='撤销上一个点'
          onClick={onUndo}
        >
          撤销
        </Button>
      )}
      {canFinish && (
        <Button
          variant='primary'
          className={styles.touchBarBtn}
          disabled={finishDisabled}
          icon={<CheckIcon className='size-4' />}
          aria-label='完成绘制'
          onClick={onFinish}
        >
          完成
        </Button>
      )}
      <Button
        className={styles.touchBarBtn}
        danger
        icon={<XIcon className='size-4' />}
        aria-label='取消绘制'
        onClick={onCancel}
      >
        取消
      </Button>
    </div>
  )
}

export default DrawingTouchBar
