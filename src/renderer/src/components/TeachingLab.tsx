import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { thematicLayerCatalog, useClimateStore, type ThematicLayerId } from '@renderer/stores/climate'
import { useSolarStore, type MotionPanel as SolarMotionPanel } from '@renderer/stores/solar'
import { useAtmosphereStore, type AtmospherePanel } from '@renderer/stores/atmosphere'
import { useHydrologyStore, type HydrologyPanel } from '@renderer/stores/hydrology'
import { useLandformStore, type LandformPanel } from '@renderer/stores/landform'
import { usePopulationStore } from '@renderer/stores/population'
import { useTransportStore } from '@renderer/stores/transport'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useDecisionStore } from '@renderer/stores/decision'
import { useZonationStore } from '@renderer/stores/zonation'
import { useDrawingStore } from '@renderer/stores/drawing'
import { captureTelemetryEvent } from '@renderer/posthog'
import styles from './TeachingLab.module.css'

export interface TeachingLabProps {
  open: boolean
  onClose: () => void
}

interface LabEntry {
  key: string
  name: string
  description: string
  active: boolean
  toggle: () => boolean
}

interface LabChapter {
  id: string
  title: string
  entries: LabEntry[]
}

function closeAllPanels(): void {
  useSolarStore.getState().setMotionPanel(null)
  useAtmosphereStore.getState().setPanel(null)
  useHydrologyStore.getState().setPanel(null)
  useLandformStore.getState().setPanel(null)
  usePopulationStore.getState().setPanel(null)
  useTransportStore.getState().setPanel(null)
  useEnvironmentStore.getState().setPanel(null)
  useDecisionStore.getState().setPanel(null)
  useZonationStore.getState().setPanel(null)
  useDrawingStore.getState().setActiveTool(null)
}

export function TeachingLab({ open, onClose }: TeachingLabProps) {
  const overlays = useClimateStore((state) => state.overlays)
  const solarActive = useSolarStore((state) => state.active)
  const solarMotionPanel = useSolarStore((state) => state.motionPanel)
  const atmospherePanel = useAtmosphereStore((state) => state.panel)
  const hydrologyPanel = useHydrologyStore((state) => state.panel)
  const landformPanel = useLandformStore((state) => state.panel)
  const populationPanel = usePopulationStore((state) => state.panel)
  const transportPanel = useTransportStore((state) => state.panel)
  const environmentPanel = useEnvironmentStore((state) => state.panel)
  const decisionPanel = useDecisionStore((state) => state.panel)
  const zonationPanel = useZonationStore((state) => state.panel)
  const drawingActiveTool = useDrawingStore((state) => state.activeTool)

  if (!open) return null

  function layerEntry(id: ThematicLayerId): LabEntry {
    const layer = thematicLayerCatalog.find((item) => item.id === id)
    return {
      key: id,
      name: layer?.name ?? id,
      description: layer?.description ?? '',
      active: overlays[id],
      toggle: () => {
        const next = !useClimateStore.getState().overlays[id]
        useClimateStore.getState().setOverlay(id, next)
        return next
      }
    }
  }

  function solarPanelEntry(panel: SolarMotionPanel, name: string, description: string): LabEntry {
    return {
      key: panel,
      name,
      description,
      active: solarMotionPanel === panel,
      toggle: () => {
        const next = useSolarStore.getState().motionPanel !== panel
        closeAllPanels()
        if (next) useSolarStore.getState().setMotionPanel(panel)
        return next
      }
    }
  }

  function atmospherePanelEntry(panel: AtmospherePanel, name: string, description: string): LabEntry {
    return {
      key: panel,
      name,
      description,
      active: atmospherePanel === panel,
      toggle: () => {
        const next = useAtmosphereStore.getState().panel !== panel
        closeAllPanels()
        if (next) useAtmosphereStore.getState().setPanel(panel)
        return next
      }
    }
  }

  function hydroPanelEntry(panel: HydrologyPanel, name: string, description: string): LabEntry {
    return {
      key: panel,
      name,
      description,
      active: hydrologyPanel === panel,
      toggle: () => {
        const next = useHydrologyStore.getState().panel !== panel
        closeAllPanels()
        if (next) useHydrologyStore.getState().setPanel(panel)
        return next
      }
    }
  }

  function landformPanelEntry(panel: LandformPanel, name: string, description: string): LabEntry {
    return {
      key: panel,
      name,
      description,
      active: landformPanel === panel,
      toggle: () => {
        const next = useLandformStore.getState().panel !== panel
        closeAllPanels()
        if (next) useLandformStore.getState().setPanel(panel)
        return next
      }
    }
  }

  function populationPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'population',
      name,
      description,
      active: populationPanel === 'population',
      toggle: () => {
        const next = usePopulationStore.getState().panel !== 'population'
        closeAllPanels()
        if (next) usePopulationStore.getState().setPanel('population')
        return next
      }
    }
  }

  function citiesPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'cities',
      name,
      description,
      active: populationPanel === 'cities',
      toggle: () => {
        const next = usePopulationStore.getState().panel !== 'cities'
        closeAllPanels()
        if (next) usePopulationStore.getState().setPanel('cities')
        return next
      }
    }
  }

  function transportPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'transport',
      name,
      description,
      active: transportPanel === 'transport',
      toggle: () => {
        const next = useTransportStore.getState().panel !== 'transport'
        closeAllPanels()
        if (next) useTransportStore.getState().setPanel('transport')
        return next
      }
    }
  }

  function environmentPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'environment',
      name,
      description,
      active: environmentPanel === 'environment',
      toggle: () => {
        const next = useEnvironmentStore.getState().panel !== 'environment'
        closeAllPanels()
        if (next) useEnvironmentStore.getState().setPanel('environment')
        return next
      }
    }
  }

  function decisionPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'decision',
      name,
      description,
      active: decisionPanel === 'location',
      toggle: () => {
        const next = useDecisionStore.getState().panel !== 'location'
        closeAllPanels()
        if (next) useDecisionStore.getState().setPanel('location')
        return next
      }
    }
  }

  function zonationPanelEntry(name: string, description: string): LabEntry {
    return {
      key: 'zonation',
      name,
      description,
      active: zonationPanel === 'zonation-profile',
      toggle: () => {
        const next = useZonationStore.getState().panel !== 'zonation-profile'
        closeAllPanels()
        if (next) useZonationStore.getState().setPanel('zonation-profile')
        return next
      }
    }
  }

  const chapters: LabChapter[] = [
    {
      id: 'earth-motion',
      title: '第一章 · 地球的运动',
      entries: [
        {
          key: 'solar',
          name: '太阳光照与晨昏线',
          description: '调日期与时刻，演示昼夜交替与极昼极夜',
          active: solarActive,
          toggle: () => {
            const next = !useSolarStore.getState().active
            useSolarStore.getState().setActive(next)
            return next
          }
        },
        solarPanelEntry('solar-path', '太阳视运动轨迹', '站在地面看天空：日出日落方位与正午太阳方位'),
        solarPanelEntry('obliquity', '黄赤交角可调探究', '拖动交角，观察直射点范围与五带变化'),
        solarPanelEntry('rotation-speed', '自转速度与周期', '角速度线速度随纬度变化、恒星日与太阳日'),
        {
          key: 'temperature-zones',
          name: '五带与直射点回归',
          description: '五带划分与界线，直射点随日期时刻移动',
          active: overlays['temperature-zones'],
          toggle: () => {
            const next = !useClimateStore.getState().overlays['temperature-zones']
            useClimateStore.getState().setOverlay('temperature-zones', next)
            if (next) useSolarStore.getState().setActive(true)
            return next
          }
        },
        {
          key: 'timezone',
          name: '时区对比',
          description: '在地球上选取两地，对比地方时与区时',
          active: drawingActiveTool === 'timezone',
          toggle: () => {
            const next = useDrawingStore.getState().activeTool !== 'timezone'
            closeAllPanels()
            if (next) useDrawingStore.getState().setActiveTool('timezone')
            return next
          }
        },
        layerEntry('coriolis-demo')
      ]
    },
    {
      id: 'atmosphere',
      title: '第二章 · 地球上的大气',
      entries: [
        atmospherePanelEntry('circulation', '热力环流', '海陆风、山谷风、城市风动画'),
        atmospherePanelEntry('heating', '大气受热过程', '削弱作用与保温作用（温室效应）'),
        atmospherePanelEntry('layers', '大气垂直分层', '各层高度-气温曲线与特征'),
        layerEntry('typhoon'),
        layerEntry('pressure-belts'),
        layerEntry('wind-particles'),
        layerEntry('summer-monsoon'),
        layerEntry('winter-monsoon'),
        layerEntry('rain-belt'),
        layerEntry('frontal-cyclone'),
        layerEntry('koppen-zones'),
        layerEntry('climate-zones')
      ]
    },
    {
      id: 'water',
      title: '第三章 · 地球上的水',
      entries: [
        {
          key: 'enso',
          name: 'ENSO（厄尔尼诺与拉尼娜）',
          description: '三相位海温距平着色 + 沃克环流剖面，点击海区看影响',
          active: overlays['enso'],
          toggle: () => {
            const next = !useClimateStore.getState().overlays['enso']
            useClimateStore.getState().setOverlay('enso', next)
            return next
          }
        },
        hydroPanelEntry('water-cycle', '水循环', '海陆间循环环节动画，联动飞往西太平洋'),
        hydroPanelEntry('ocean-property', '海水温度与盐度', '表层海水温度、盐度随纬度分布曲线'),
        hydroPanelEntry('tide', '潮汐与波浪', '波浪水质点轨道运动、大小潮日地月示意'),
        hydroPanelEntry('water-bodies', '陆地水体与河流补给', '降水/冰川/地下水/湖泊补给与流量过程线'),
        {
          key: 'current-wind-link',
          name: '洋流成因联动',
          description: '同时点亮世界洋流与气压带风带，演示风海流成因',
          active: overlays['ocean-currents'] && overlays['pressure-belts'],
          toggle: () => {
            const state = useClimateStore.getState()
            const next = !(state.overlays['ocean-currents'] && state.overlays['pressure-belts'])
            state.setOverlay('ocean-currents', next)
            state.setOverlay('pressure-belts', next)
            return next
          }
        },
        layerEntry('ocean-currents')
      ]
    },
    {
      id: 'landform',
      title: '第四章 · 地表形态的塑造',
      entries: [
        landformPanelEntry('fold-fault', '褶皱与断层', '背斜向斜、地垒地堑剖面，飞往华山/东非裂谷'),
        landformPanelEntry('river', '河流地貌发育', 'V形谷→河曲→三角洲，沿河飞览+真实高程剖面'),
        landformPanelEntry('landform-guide', '典型地貌识别', '喀斯特/雅丹/冰川/海岸/黄土，实地观察'),
        landformPanelEntry('exogenic', '外力作用过程', '风化→侵蚀→搬运→堆积→固结成岩链条'),
        landformPanelEntry('earth-layers', '地球的圈层结构', '地壳/地幔/地核切球剖面与地震波界线'),
        layerEntry('plate-tectonics')
      ]
    },
    {
      id: 'zonation',
      title: '第五章 · 自然环境的整体性与差异性',
      entries: [
        zonationPanelEntry('山地垂直带谱剖面', '珠峰/天山/乞力马扎罗等南北坡带谱、雪线与真实剖面，支持沿剖面飞行')
      ]
    },
    {
      id: 'population',
      title: '必修二 · 人口与城镇',
      entries: [
        populationPanelEntry('人口数据面板', '人口金字塔、城镇化曲线与胡焕庸线对比'),
        layerEntry('province-population'),
        layerEntry('hu-line'),
        layerEntry('migration-flows'),
        citiesPanelEntry('城镇与中心地验证', '城市等级与中心地理论验证'),
        layerEntry('city-tiers'),
        layerEntry('functional-zones')
      ]
    },
    {
      id: 'industry',
      title: '必修二 · 产业区位',
      entries: [
        layerEntry('agri-regions'),
        layerEntry('industrial-bases'),
        layerEntry('industrial-transfers')
      ]
    },
    {
      id: 'transport',
      title: '必修二 · 交通运输',
      entries: [
        transportPanelEntry('交通运输布局', '高铁网络生长时间轴、营业里程与线路察看'),
        layerEntry('hsr-network')
      ]
    },
    {
      id: 'environment',
      title: '必修二 · 环境与发展',
      entries: [
        environmentPanelEntry('海平面上升淹没模拟', '模拟不同上升高度下的沿海低地淹没范围'),
        layerEntry('sea-level-rise')
      ]
    },
    {
      id: 'sandbox',
      title: '决策沙盘 · 复习评价',
      entries: [
        decisionPanelEntry('区位决策沙盘', '工业与农业选址模拟，并由 AI 点评')
      ]
    }
  ]

  function selectEntry(entry: LabEntry): void {
    const enabled = entry.toggle()
    captureTelemetryEvent('teaching_module_selected', { module_id: entry.key, enabled })
    onClose()
  }

  return (
    <div className={styles.teachingLab} role="dialog" aria-label="地理实验室">
      <div className={styles.labHeader}>
        <span className={styles.labTitle}>地理实验室</span>
        <Button type="text" size="small" aria-label="关闭地理实验室" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <div className={styles.labGrid}>
        {chapters.map((chapter) => (
          <section key={chapter.id} className={styles.labChapter}>
            <div className={styles.labChapterTitle}>{chapter.title}</div>
            {chapter.entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={entry.active ? `${styles.labEntry} ${styles.labEntryActive}` : styles.labEntry}
                onClick={() => selectEntry(entry)}
              >
                <span className={styles.labEntryDot} aria-hidden="true" />
                <span className={styles.labEntryCopy}>
                  <span className={styles.labEntryName}>{entry.name}</span>
                  <span className={styles.labEntryDesc}>{entry.description}</span>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

export default TeachingLab
