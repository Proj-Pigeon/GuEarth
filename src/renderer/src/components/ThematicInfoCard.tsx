import { Button, Tag } from 'antd'
import { CloseOutlined, InfoCircleOutlined, RobotOutlined } from '@ant-design/icons'
import { useAiStore } from '@renderer/stores/ai'
import { useFeatureFocusStore } from '@renderer/stores/featureFocus'
import { useGlobeStore } from '@renderer/stores/globe'
import styles from './ThematicInfoCard.module.css'

export interface ThematicInfoCardProps {}

export function ThematicInfoCard(_props: ThematicInfoCardProps) {
  const focused = useFeatureFocusStore((state) => state.focused)
  const clearFocus = useFeatureFocusStore((state) => state.clearFocus)
  const setAiPanelOpen = useAiStore((state) => state.setPanelOpen)
  const sendAi = useAiStore((state) => state.send)
  const isLayerPanelOpen = useGlobeStore((state) => state.isLayerPanelOpen)
  const setLayerPanelOpen = useGlobeStore((state) => state.setLayerPanelOpen)

  if (!focused) return null

  function explainWithAi(): void {
    if (!focused) return
    setAiPanelOpen(true)
    void sendAi(
      `请结合「${focused.layerName}」图层，讲解${focused.name}的成因、分布规律及其对地理环境的影响。参考信息：${focused.summary}`
    )
  }

  return (
    <>
      {isLayerPanelOpen && (
        <div className={styles.occlusionHint} role="status">
          <InfoCircleOutlined />
          <span>成因讲解卡片被图层面板遮挡，关闭面板后即可查看</span>
          <Button type="link" size="small" onClick={() => setLayerPanelOpen(false)}>
            关闭面板
          </Button>
        </div>
      )}
      <div className={styles.featureCard} role="status" aria-label="专题要素信息">
        <div className={styles.cardHead}>
          <Tag className={styles.cardTag}>{focused.layerName}</Tag>
          <Button
            type="text"
            size="small"
            aria-label="关闭"
            icon={<CloseOutlined />}
            onClick={clearFocus}
          />
        </div>
        <h3 className={styles.cardTitle}>{focused.name}</h3>
        <p className={styles.cardSummary}>{focused.summary}</p>
        <Button type="primary" size="small" block icon={<RobotOutlined />} onClick={explainWithAi}>
          让 AI 讲解成因
        </Button>
      </div>
    </>
  )
}

export default ThematicInfoCard
