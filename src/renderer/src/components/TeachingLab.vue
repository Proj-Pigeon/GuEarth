<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import { thematicLayerCatalog, useClimateStore, type ThematicLayerId } from '@renderer/stores/climate'
import { useSolarStore, type MotionPanel as SolarMotionPanel } from '@renderer/stores/solar'
import { useAtmosphereStore, type AtmospherePanel } from '@renderer/stores/atmosphere'
import { useHydrologyStore, type HydrologyPanel } from '@renderer/stores/hydrology'
import { useLandformStore, type LandformPanel } from '@renderer/stores/landform'
import { usePopulationStore } from '@renderer/stores/population'
import { useDrawingStore } from '@renderer/stores/drawing'

interface LabEntry {
  key: string
  name: string
  description: string
  active: () => boolean
  toggle: () => void
}

interface LabChapter {
  id: string
  title: string
  entries: LabEntry[]
}

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const climateStore = useClimateStore()
const solarStore = useSolarStore()
const atmosphereStore = useAtmosphereStore()
const hydrologyStore = useHydrologyStore()
const landformStore = useLandformStore()
const populationStore = usePopulationStore()
const drawingStore = useDrawingStore()

function closeAllPanels(): void {
  solarStore.setMotionPanel(null)
  atmosphereStore.setPanel(null)
  hydrologyStore.setPanel(null)
  landformStore.setPanel(null)
  populationStore.setPanel(null)
}

function layerEntry(id: ThematicLayerId): LabEntry {
  const layer = thematicLayerCatalog.find((item) => item.id === id)
  return {
    key: id,
    name: layer?.name ?? id,
    description: layer?.description ?? '',
    active: () => climateStore.overlays[id],
    toggle: () => climateStore.setOverlay(id, !climateStore.overlays[id])
  }
}

function solarPanelEntry(panel: SolarMotionPanel, name: string, description: string): LabEntry {
  return {
    key: panel,
    name,
    description,
    active: () => solarStore.motionPanel === panel,
    toggle: () => {
      const next = solarStore.motionPanel !== panel
      closeAllPanels()
      if (next) solarStore.setMotionPanel(panel)
    }
  }
}

function atmospherePanelEntry(panel: AtmospherePanel, name: string, description: string): LabEntry {
  return {
    key: panel,
    name,
    description,
    active: () => atmosphereStore.panel === panel,
    toggle: () => {
      const next = atmosphereStore.panel !== panel
      closeAllPanels()
      if (next) atmosphereStore.setPanel(panel)
    }
  }
}

function hydroPanelEntry(panel: HydrologyPanel, name: string, description: string): LabEntry {
  return {
    key: panel,
    name,
    description,
    active: () => hydrologyStore.panel === panel,
    toggle: () => {
      const next = hydrologyStore.panel !== panel
      closeAllPanels()
      if (next) hydrologyStore.setPanel(panel)
    }
  }
}

function landformPanelEntry(panel: LandformPanel, name: string, description: string): LabEntry {
  return {
    key: panel,
    name,
    description,
    active: () => landformStore.panel === panel,
    toggle: () => {
      const next = landformStore.panel !== panel
      closeAllPanels()
      if (next) landformStore.setPanel(panel)
    }
  }
}

function populationPanelEntry(name: string, description: string): LabEntry {
  return {
    key: 'population',
    name,
    description,
    active: () => populationStore.panel === 'population',
    toggle: () => {
      const next = populationStore.panel !== 'population'
      closeAllPanels()
      if (next) populationStore.setPanel('population')
    }
  }
}

function citiesPanelEntry(name: string, description: string): LabEntry {
  return {
    key: 'cities',
    name,
    description,
    active: () => populationStore.panel === 'cities',
    toggle: () => {
      const next = populationStore.panel !== 'cities'
      closeAllPanels()
      if (next) populationStore.setPanel('cities')
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
        active: () => solarStore.active,
        toggle: () => solarStore.setActive(!solarStore.active)
      },
      solarPanelEntry('solar-path', '太阳视运动轨迹', '站在地面看天空：日出日落方位与正午太阳方位'),
      solarPanelEntry('obliquity', '黄赤交角可调探究', '拖动交角，观察直射点范围与五带变化'),
      solarPanelEntry('rotation-speed', '自转速度与周期', '角速度线速度随纬度变化、恒星日与太阳日'),
      {
        key: 'temperature-zones',
        name: '五带与直射点回归',
        description: '五带划分与界线，直射点随日期时刻移动',
        active: () => climateStore.overlays['temperature-zones'],
        toggle: () => {
          const next = !climateStore.overlays['temperature-zones']
          climateStore.setOverlay('temperature-zones', next)
          if (next) solarStore.setActive(true)
        }
      },
      {
        key: 'timezone',
        name: '时区对比',
        description: '在地球上选取两地，对比地方时与区时',
        active: () => drawingStore.activeTool === 'timezone',
        toggle: () => drawingStore.setActiveTool(drawingStore.activeTool === 'timezone' ? null : 'timezone')
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
        active: () => climateStore.overlays['enso'],
        toggle: () => climateStore.setOverlay('enso', !climateStore.overlays['enso'])
      },
      hydroPanelEntry('water-cycle', '水循环', '海陆间循环环节动画，联动飞往西太平洋'),
      hydroPanelEntry('ocean-property', '海水温度与盐度', '表层海水温度、盐度随纬度分布曲线'),
      hydroPanelEntry('tide', '潮汐与波浪', '波浪水质点轨道运动、大小潮日地月示意'),
      hydroPanelEntry('water-bodies', '陆地水体与河流补给', '降水/冰川/地下水/湖泊补给与流量过程线'),
      {
        key: 'current-wind-link',
        name: '洋流成因联动',
        description: '同时点亮世界洋流与气压带风带，演示风海流成因',
        active: () => climateStore.overlays['ocean-currents'] && climateStore.overlays['pressure-belts'],
        toggle: () => {
          const next = !(climateStore.overlays['ocean-currents'] && climateStore.overlays['pressure-belts'])
          climateStore.setOverlay('ocean-currents', next)
          climateStore.setOverlay('pressure-belts', next)
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
    id: 'population',
    title: '必修二 · 人口与城镇',
    entries: [
      populationPanelEntry('人口数据面板', '人口金字塔、城镇化曲线与胡焕庸线对比'),
      layerEntry('province-population'),
      layerEntry('hu-line'),
      layerEntry('migration-flows'),
      citiesPanelEntry('城镇与中心地验证', '城市等级体系、中心地理论 POI 对比验证'),
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
  }
]

function selectEntry(entry: LabEntry): void {
  entry.toggle()
  emit('close')
}
</script>

<template>
  <div v-if="open" class="teaching-lab" role="dialog" aria-label="地理实验室">
    <div class="lab-header">
      <span class="lab-title">地理实验室</span>
      <a-button type="text" size="small" aria-label="关闭地理实验室" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <div class="lab-grid">
      <section v-for="chapter in chapters" :key="chapter.id" class="lab-chapter">
        <div class="lab-chapter-title">{{ chapter.title }}</div>
        <button
          v-for="entry in chapter.entries"
          :key="entry.key"
          type="button"
          class="lab-entry"
          :class="{ active: entry.active() }"
          @click="selectEntry(entry)"
        >
          <span class="lab-entry-dot" aria-hidden="true"></span>
          <span class="lab-entry-copy">
            <span class="lab-entry-name">{{ entry.name }}</span>
            <span class="lab-entry-desc">{{ entry.description }}</span>
          </span>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.teaching-lab {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 48px));
  max-height: min(440px, calc(100vh - 200px));
  overflow-y: auto;
  padding: 12px 16px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 12;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.lab-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.lab-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
}

.lab-chapter {
  display: flex;
  flex-direction: column;
}

.lab-chapter-title {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  margin: 6px 0 2px;
}

.lab-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.lab-entry:hover {
  background: rgba(0, 0, 0, 0.04);
}

.lab-entry-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
}

.lab-entry.active .lab-entry-dot {
  border-color: #1677ff;
  background: #1677ff;
}

.lab-entry-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lab-entry-name {
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  line-height: 20px;
}

.lab-entry.active .lab-entry-name {
  color: #1677ff;
  font-weight: 600;
}

.lab-entry-desc {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
