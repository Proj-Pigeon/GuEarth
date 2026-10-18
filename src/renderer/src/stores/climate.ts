import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { summerFactor, winterFactor } from '@renderer/thematic/windField'
import type { EnsoPhase } from '@renderer/thematic/ensoPhases'
import type { ThematicLayerId } from '../../../common/thematicLayers'

export type { ThematicLayerId }

export interface ThematicLayerMeta {
  id: ThematicLayerId
  name: string
  description: string
  seasonal?: boolean
}

export const thematicLayerCatalog: ThematicLayerMeta[] = [
  { id: 'wind-particles', name: '季风粒子动画', description: '示意风场随月份演变', seasonal: true },
  { id: 'pressure-belts', name: '气压带与风带', description: '七压六风及其季节移动（1月/7月）', seasonal: true },
  { id: 'koppen-zones', name: '世界气候类型', description: '全球气候类型分布示意（可点击查看成因）' },
  { id: 'frontal-cyclone', name: '锋面气旋', description: '北半球温带气旋结构示意' },
  { id: 'rain-belt', name: '降水雨带', description: '东部雨带随月份推进', seasonal: true },
  { id: 'summer-monsoon', name: '夏季风风向', description: '偏南气流路径' },
  { id: 'winter-monsoon', name: '冬季风风向', description: '偏北气流路径' },
  { id: 'ocean-currents', name: '世界洋流', description: '暖流与寒流分布', seasonal: true },
  { id: 'climate-zones', name: '中国气候区', description: '五大气候区示意' },
  { id: 'coriolis-demo', name: '地转偏向力演示', description: '水平运动物体的偏转轨迹（北右南左）' },
  { id: 'plate-tectonics', name: '板块运动与地震火山', description: '三大类板块边界、典型火山与近期地震（可点击查看成因）' },
  { id: 'temperature-zones', name: '五带与直射点回归', description: '五带划分与回归线、极圈界线，直射点标记随日期时刻移动' },
  { id: 'typhoon', name: '台风（热带气旋）', description: '台风眼、眼墙与螺旋雨带结构，叠加历史真实台风路径（可点击查看）' },
  { id: 'enso', name: 'ENSO（厄尔尼诺与拉尼娜）', description: '赤道太平洋海温距平三相位着色与沃克环流示意（可点击查看影响）' },
  { id: 'province-population', name: '省级人口密度', description: '第七次人口普查分省人口密度分级设色（可点击查看各省数据）' },
  { id: 'hu-line', name: '胡焕庸线', description: '黑河—腾冲线与东西两侧人口对比' },
  { id: 'migration-flows', name: '人口迁移流动', description: '主要省际人口迁移流向示意（可点击查看）' },
  { id: 'city-tiers', name: '中国城市等级', description: '全国/区域/省会/地级/县级五级城市与服务范围示意（可点击查看）' },
  { id: 'functional-zones', name: '城市功能分区（武汉）', description: '武汉真实功能分区锚定：江汉路商圈、武钢青山区、沌口汽车城、光谷等（可点击查看）' },
  { id: 'agri-regions', name: '农业区划', description: '九大商品粮基地与商品棉、甘蔗、甜菜产区分布（可点击查看区位）' },
  { id: 'industrial-bases', name: '四大工业基地', description: '辽中南、京津唐、沪宁杭、珠三角基地与主导区位（可点击查看）' },
  { id: 'industrial-transfers', name: '产业转移流向', description: '东部沿海向中西部与海外的产业转移弧线（可点击查看）' },
  { id: 'hsr-network', name: '高铁网络生长', description: '2008 年以来主要高铁干线随年份生长（配合面板时间轴播放）' },
  { id: 'sea-level-rise', name: '海平面上升淹没模拟', description: '沿海低地格网地形采样，按上升情景着色被淹没陆地（可点击查看）' }
]

const MONTHS_PER_SECOND = 0.5
const MONTH_MAX = 13

export const useClimateStore = defineStore('climate', () => {
  const month = ref(7)
  const isPlaying = ref(false)
  const overlays = ref<Record<ThematicLayerId, boolean>>({
    'wind-particles': false,
    'pressure-belts': false,
    'koppen-zones': false,
    'frontal-cyclone': false,
    'rain-belt': false,
    'summer-monsoon': false,
    'winter-monsoon': false,
    'ocean-currents': false,
    'climate-zones': false,
    'coriolis-demo': false,
    'plate-tectonics': false,
    'temperature-zones': false,
    'typhoon': false,
    'enso': false,
    'province-population': false,
    'hu-line': false,
    'migration-flows': false,
    'city-tiers': false,
    'functional-zones': false,
    'agri-regions': false,
    'industrial-bases': false,
    'industrial-transfers': false,
    'hsr-network': false,
    'sea-level-rise': false
  })
  const ensoPhase = ref<EnsoPhase>('normal')
  const seaLevelRise = ref<number>(1)

  const summerStrength = computed(() => summerFactor(month.value))
  const winterStrength = computed(() => winterFactor(month.value))
  const hasActiveOverlay = computed(() => Object.values(overlays.value).some(Boolean))
  const hasSeasonalOverlay = computed(() => thematicLayerCatalog.some((layer) => layer.seasonal === true && overlays.value[layer.id]))

  function setOverlay(id: ThematicLayerId, enabled: boolean): void {
    overlays.value[id] = enabled
  }

  function setEnsoPhase(value: EnsoPhase): void {
    ensoPhase.value = value
  }

  function setSeaLevelRise(value: number): void {
    seaLevelRise.value = value
  }

  function setMonth(value: number): void {
    month.value = Math.min(12, Math.max(1, Math.round(value)))
  }

  function togglePlaying(): void {
    isPlaying.value = !isPlaying.value
  }

  function advance(dtSeconds: number): void {
    if (!isPlaying.value) return
    const next = month.value + dtSeconds * MONTHS_PER_SECOND
    month.value = next >= MONTH_MAX ? next - 12 : next
  }

  return { month, isPlaying, overlays, ensoPhase, seaLevelRise, summerStrength, winterStrength, hasActiveOverlay, hasSeasonalOverlay, setOverlay, setEnsoPhase, setSeaLevelRise, setMonth, togglePlaying, advance }
})
