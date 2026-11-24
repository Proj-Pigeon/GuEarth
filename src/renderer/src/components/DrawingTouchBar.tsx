import { CheckOutlined, CloseOutlined, UndoOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { DrawTool } from '@renderer/stores/drawing'
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
  if (!activeTool) return null

  const canUndo = activeTool === 'line' || activeTool === 'polygon' || activeTool === 'arrow'
  const canFinish = activeTool === 'line' || activeTool === 'polygon'
  const minimumPoints = activeTool === 'polygon' ? 3 : 2
  const finishDisabled = draftCount < minimumPoints
  const undoDisabled = draftCount === 0

  return (
    <div className={styles.drawingTouchBar} role="toolbar" aria-label="触摸绘图操作">
      {canUndo && (
        <Button
          className={styles.touchBarBtn}
          disabled={undoDisabled}
          icon={<UndoOutlined />}
          aria-label="撤销上一个点"
          onClick={onUndo}
        >
          撤销
        </Button>
      )}
      {canFinish && (
        <Button
          type="primary"
          className={styles.touchBarBtn}
          disabled={finishDisabled}
          icon={<CheckOutlined />}
          aria-label="完成绘制"
          onClick={onFinish}
        >
          完成
        </Button>
      )}
      <Button
        className={styles.touchBarBtn}
        danger
        icon={<CloseOutlined />}
        aria-label="取消绘制"
        onClick={onCancel}
      >
        取消
      </Button>
    </div>
  )
}

export default DrawingTouchBar
