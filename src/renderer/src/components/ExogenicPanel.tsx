import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import * as Cesium from 'cesium'
import { Fragment, useState } from 'react'

import styles from './ExogenicPanel.module.css'

export interface ExogenicPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

interface ChainStage {
  id: string
  name: string
  force: string
  description: string
  color: string
  site?: { label: string; longitude: number; latitude: number; height: number }
}

const stages: ChainStage[] = [
  {
    id: 'weathering',
    name: '风化作用',
    force: '温差、冻融、水、生物',
    description: '岩石原地被破坏、崩解碎裂，不发生位移。花岗岩球状风化、石灰岩化学溶蚀都属于风化。',
    color: '#faad14',
    site: { label: '黄山球状风化', longitude: 118.17, latitude: 30.13, height: 30000 }
  },
  {
    id: 'erosion',
    name: '侵蚀作用',
    force: '流水、风力、冰川、海浪',
    description:
      '风化产物与岩石被外力破坏并搬离原地：流水下切成 V 形谷、风蚀雅丹、冰川刨蚀 U 形谷、海浪蚀出海蚀崖。',
    color: '#fa8c16',
    site: { label: '虎跳峡流水侵蚀', longitude: 100.05, latitude: 27.25, height: 45000 }
  },
  {
    id: 'transportation',
    name: '搬运作用',
    force: '流水、风力、冰川',
    description:
      '外力将碎屑物质搬运离开：河流挟带泥沙（黄河“一碗水半碗沙”）、风沙运移、冰川携带冰碛物。',
    color: '#722ed1',
    site: { label: '黄河中游泥沙搬运', longitude: 110.5, latitude: 35.5, height: 400000 }
  },
  {
    id: 'deposition',
    name: '堆积作用',
    force: '流速/风速降低、冰川消融',
    description:
      '外力减弱，物质沉积：山前冲积扇、河流三角洲、风积沙丘、冰碛垄。粒径大的先沉积、小的后沉积，出现分选性。',
    color: '#13c2c2',
    site: { label: '长江三角洲堆积', longitude: 120.7, latitude: 31.6, height: 300000 }
  },
  {
    id: 'lithification',
    name: '固结成岩',
    force: '压实、胶结',
    description:
      '松散堆积物经漫长地质时期压实胶结，重新变成沉积岩（砂岩、页岩、石灰岩），完成岩石循环。',
    color: '#595959'
  }
]

export function ExogenicPanel({ viewer, onClose }: ExogenicPanelProps) {
  const [activeId, setActiveId] = useState('weathering')

  function selectStage(stage: ChainStage): void {
    setActiveId(stage.id)
  }

  function flyToSite(stage: ChainStage): void {
    if (!stage.site) return
    if (viewer && !viewer.isDestroyed()) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          stage.site.longitude,
          stage.site.latitude,
          stage.site.height
        ),
        duration: 1.4
      })
    }
  }

  const activeStage = stages.find(item => item.id === activeId)

  return (
    <div className={styles.exogenicPanel} role='group' aria-label='外力作用过程'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>外力作用过程</span>
        <Button
          type='text'
          size='small'
          aria-label='关闭外力作用过程'
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </div>
      <div className={styles.chain}>
        {stages.map((stage, index) => (
          <Fragment key={stage.id}>
            <button
              type='button'
              className={
                stage.id === activeId
                  ? `${styles.chainNode} ${styles.chainActive}`
                  : styles.chainNode
              }
              style={{ borderColor: stage.color }}
              onClick={() => selectStage(stage)}
            >
              <span className={styles.chainDot} style={{ background: stage.color }} />
              <span className={styles.chainName}>{stage.name}</span>
            </button>
            {index < stages.length - 1 && <span className={styles.chainArrow}>→</span>}
          </Fragment>
        ))}
      </div>
      {activeStage && (
        <div key={activeStage.id} className={styles.stageCard}>
          <div className={styles.stageForce}>主要动力：{activeStage.force}</div>
          <div className={styles.stageDesc}>{activeStage.description}</div>
          {activeStage.site && (
            <Button size='small' onClick={() => flyToSite(activeStage)}>
              在地球上查看：{activeStage.site.label}
            </Button>
          )}
        </div>
      )}
      <div className={styles.panelNote}>
        外力作用与内力作用共同塑造地表形态：内力作用（地壳运动、岩浆活动、变质作用）奠定宏观格局并使地表高低不平，外力作用则削高填低、使地表趋于平缓。湿润半湿润区以流水作用为主，干旱半干旱区以风力作用为主，高纬高山以冰川作用为主，沿海以海浪作用为主。
      </div>
    </div>
  )
}

export default ExogenicPanel
