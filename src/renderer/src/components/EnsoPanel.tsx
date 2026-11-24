import { CloseOutlined } from '@ant-design/icons'
import { Button, Segmented } from 'antd'
import { useClimateStore } from '@renderer/stores/climate'
import { ensoPhaseMeta, ensoPhaseOptions, type EnsoPhase } from '@renderer/thematic/ensoPhases'
import styles from './EnsoPanel.module.css'

export interface EnsoPanelProps {
  onClose: () => void
}

export function EnsoPanel({ onClose }: EnsoPanelProps) {
  const phase = useClimateStore((state) => state.ensoPhase)
  const setEnsoPhase = useClimateStore((state) => state.setEnsoPhase)
  const meta = ensoPhaseMeta[phase]

  return (
    <div className={styles.ensoPanel} role="group" aria-label="ENSO 演示">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>ENSO：厄尔尼诺与拉尼娜</span>
        <Button type="text" size="small" aria-label="关闭 ENSO 演示" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <Segmented
        value={phase}
        options={ensoPhaseOptions}
        size="small"
        aria-label="ENSO 相位"
        onChange={(value) => setEnsoPhase(value as EnsoPhase)}
      />
      <div className={styles.phaseSummary}>{meta.summary}</div>
      <div className={styles.walkerLine}>
        <span className={styles.sectionTitle}>沃克环流变化</span> {meta.walker}
      </div>
      <div className={styles.sectionTitle}>对地理格局的主要影响</div>
      {meta.impacts.map((impact) => (
        <div key={impact} className={styles.impactItem}>
          · {impact}
        </div>
      ))}
      <div className={styles.panelNote}>
        在地球上：沿赤道的着色带为海温距平（红=偏暖、蓝=偏冷），紫色框为 Niño3.4 关键监测区，太平洋上空的叠加图为沃克环流剖面。点击着色带可查看讲解。
      </div>
    </div>
  )
}

export default EnsoPanel
