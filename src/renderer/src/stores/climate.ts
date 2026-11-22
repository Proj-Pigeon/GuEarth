import type { EnsoPhase } from '@renderer/thematic/ensoPhases'
import { summerFactor, winterFactor } from '@renderer/thematic/windField'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

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
  {
    id: 'pressure-belts',
    name: '气压带与风带',
    description: '七压六风及其季节移动（1月/7月）',
    seasonal: true
  },
  { id: 'koppen-zones', name: '世界气候类型', description: '全球气候类型分布与成因' },
  { id: 'frontal-cyclone', name: '锋面气旋', description: '北半球温带气旋结构示意' },
  { id: 'rain-belt', name: '降水雨带', description: '东部雨带随月份推进', seasonal: true },
  { id: 'summer-monsoon', name: '夏季风风向', description: '偏南气流路径' },
  { id: 'winter-monsoon', name: '冬季风风向', description: '偏北气流路径' },
  { id: 'ocean-currents', name: '世界洋流', description: '暖流与寒流分布', seasonal: true },
  { id: 'climate-zones', name: '中国气候区', description: '五大气候区示意' },
  {
    id: 'coriolis-demo',
    name: '地转偏向力演示',
    description: '水平运动物体的偏转轨迹（北右南左）'
  },
  {
    id: 'plate-tectonics',
    name: '板块运动与地震火山',
    description: '板块边界、典型火山与近期地震'
  },
  { id: 'temperature-zones', name: '五带与直射点回归', description: '五带划分与直射点周年移动' },
  { id: 'typhoon', name: '台风（热带气旋）', description: '实时台风路径与预报，支持查看历史案例' },
  { id: 'enso', name: 'ENSO（厄尔尼诺与拉尼娜）', description: '海温变化与沃克环流示意' },
  { id: 'province-population', name: '省级人口密度', description: '第七次人口普查分省人口密度' },
  { id: 'hu-line', name: '胡焕庸线', description: '黑河—腾冲线与东西两侧人口对比' },
  { id: 'migration-flows', name: '人口迁移流动', description: '主要省际人口迁移流向' },
  { id: 'city-tiers', name: '中国城市等级', description: '五级城市体系与服务范围示意' },
  {
    id: 'functional-zones',
    name: '城市功能分区',
    description: '七座城市功能区分布，可在图例中切换城市'
  },
  { id: 'agri-regions', name: '农业区划', description: '主要商品粮基地与经济作物产区分布' },
  { id: 'industrial-bases', name: '四大工业基地', description: '四大工业基地位置与主导区位' },
  {
    id: 'industrial-transfers',
    name: '产业转移流向',
    description: '东部沿海向中西部与海外的产业转移'
  },
  { id: 'hsr-network', name: '高铁网络生长', description: '2008 年以来高铁干线随年份动态延伸' },
  {
    id: 'sea-level-rise',
    name: '海平面上升淹没模拟',
    description: '模拟不同上升高度下沿海低地的淹没范围'
  }
]

const MONTHS_PER_SECOND = 0.5
const MONTH_MAX = 13

function createDefaultOverlays(): Record<ThematicLayerId, boolean> {
  return {
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
    typhoon: false,
    enso: false,
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
  }
}

export interface ClimateState {
  month: number
  isPlaying: boolean
  overlays: Record<ThematicLayerId, boolean>
  ensoPhase: EnsoPhase
  seaLevelRise: number
  functionalZoneCityId: string
  summerStrength: number
  winterStrength: number
  hasActiveOverlay: boolean
  hasSeasonalOverlay: boolean
}

export interface ClimateActions {
  setOverlay: (id: ThematicLayerId, enabled: boolean) => void
  setEnsoPhase: (value: EnsoPhase) => void
  setSeaLevelRise: (value: number) => void
  setFunctionalZoneCity: (value: string) => void
  setMonth: (value: number) => void
  togglePlaying: () => void
  advance: (dtSeconds: number) => void
}

export type ClimateStore = ClimateState & ClimateActions

export function selectSummerStrength(state: Pick<ClimateState, 'month'>): number {
  return summerFactor(state.month)
}

export function selectWinterStrength(state: Pick<ClimateState, 'month'>): number {
  return winterFactor(state.month)
}

export function selectHasActiveOverlay(state: Pick<ClimateState, 'overlays'>): boolean {
  return Object.values(state.overlays).some(Boolean)
}

export function selectHasSeasonalOverlay(state: Pick<ClimateState, 'overlays'>): boolean {
  return thematicLayerCatalog.some(layer => layer.seasonal === true && state.overlays[layer.id])
}

export function createInitialClimateState(): ClimateState {
  const month = 7
  const overlays = createDefaultOverlays()
  return {
    month,
    isPlaying: false,
    overlays,
    ensoPhase: 'normal',
    seaLevelRise: 1,
    functionalZoneCityId: 'wuhan',
    summerStrength: summerFactor(month),
    winterStrength: winterFactor(month),
    hasActiveOverlay: false,
    hasSeasonalOverlay: false
  }
}

export const useClimateStore = create<ClimateStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialClimateState(),
    setOverlay(id: ThematicLayerId, enabled: boolean): void {
      set(state => {
        const overlays = { ...state.overlays, [id]: enabled }
        return {
          overlays,
          hasActiveOverlay: selectHasActiveOverlay({ overlays }),
          hasSeasonalOverlay: selectHasSeasonalOverlay({ overlays })
        }
      })
    },
    setEnsoPhase(value: EnsoPhase): void {
      set({ ensoPhase: value })
    },
    setSeaLevelRise(value: number): void {
      set({ seaLevelRise: value })
    },
    setFunctionalZoneCity(value: string): void {
      set({ functionalZoneCityId: value })
    },
    setMonth(value: number): void {
      const month = Math.min(12, Math.max(1, Math.round(value)))
      set({
        month,
        summerStrength: summerFactor(month),
        winterStrength: winterFactor(month)
      })
    },
    togglePlaying(): void {
      set(state => ({ isPlaying: !state.isPlaying }))
    },
    advance(dtSeconds: number): void {
      const state = get()
      if (!state.isPlaying) return
      const next = state.month + dtSeconds * MONTHS_PER_SECOND
      const month = next >= MONTH_MAX ? next - 12 : next
      set({
        month,
        summerStrength: summerFactor(month),
        winterStrength: winterFactor(month)
      })
    }
  }))
)

export function resetClimateStore(): void {
  useClimateStore.setState(createInitialClimateState())
}
