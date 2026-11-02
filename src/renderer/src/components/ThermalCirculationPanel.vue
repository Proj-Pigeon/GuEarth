<script setup lang="ts">
import { computed, ref } from 'vue'

type SceneId = 'sea-land' | 'valley' | 'urban'
type Period = 'day' | 'night'

interface FlowArrow {
  d: string
  color: string
  label?: string
  labelAt?: [number, number]
}

interface GroundShape {
  d: string
  fill: string
}

interface SceneConfig {
  grounds: GroundShape[]
  arrows: FlowArrow[]
  placeLabels: Array<{ text: string; at: [number, number] }>
  caption: string
}

const scene = ref<SceneId>('sea-land')
const period = ref<Period>('day')

const RISING = '#f5222d'
const SINKING = '#1677ff'
const WIND = '#722ed1'

function seaLandConfig(current: Period): SceneConfig {
  const risingX = current === 'day' ? 232 : 92
  const sinkingX = current === 'day' ? 92 : 232
  const surfaceWind: FlowArrow = current === 'day'
    ? { d: `M ${sinkingX + 2} 142 Q 162 126 ${risingX - 2} 138`, color: WIND, label: '海风（海 → 陆）', labelAt: [162, 128] }
    : { d: `M ${sinkingX - 2} 138 Q 162 154 ${risingX + 2} 142`, color: WIND, label: '陆风（陆 → 海）', labelAt: [162, 156] }
  return {
    grounds: [
      { d: 'M0 152 L150 152 L150 210 L0 210 Z', fill: 'rgba(22, 119, 255, 0.18)' },
      { d: 'M150 148 L320 145 L320 210 L150 210 Z', fill: 'rgba(250, 140, 22, 0.16)' }
    ],
    arrows: [
      { d: `M ${risingX + 2} 140 C ${risingX + 5} 104 ${risingX - 1} 70 ${risingX - 4} 44`, color: RISING, label: '热空气上升', labelAt: [risingX + 12, 78] },
      { d: `M ${risingX - 4} 42 Q 162 18 ${sinkingX + 4} 42`, color: WIND },
      { d: `M ${sinkingX} 44 C ${sinkingX - 2} 80 ${sinkingX} 112 ${sinkingX} 136`, color: SINKING, label: '冷空气下沉', labelAt: [sinkingX - 12, 92] },
      surfaceWind
    ],
    placeLabels: [
      { text: '海洋', at: [75, 172] },
      { text: '陆地', at: [240, 172] },
      { text: current === 'day' ? '白天：陆地升温快' : '夜晚：陆地降温快', at: [240, 190] }
    ],
    caption: '海陆热力性质差异：白天陆地升温快、气温高，气流上升，近地面风从海洋吹向陆地（海风）；夜晚陆地降温快，风向反转吹向海洋（陆风）。'
  }
}

function valleyConfig(current: Period): SceneConfig {
  const upslope = current === 'day'
  const slopeArrows: FlowArrow[] = upslope
    ? [
      { d: 'M114 136 L26 102', color: RISING, label: '谷风', labelAt: [64, 130] },
      { d: 'M206 136 L294 102', color: RISING, label: '谷风', labelAt: [248, 130] }
    ]
    : [
      { d: 'M26 104 L112 138', color: SINKING, label: '山风', labelAt: [64, 130] },
      { d: 'M294 104 L208 138', color: SINKING, label: '山风', labelAt: [248, 130] }
    ]
  const aloftArrows: FlowArrow[] = upslope
    ? [
      { d: 'M28 96 Q 84 56 150 50', color: WIND },
      { d: 'M292 96 Q 236 56 170 50', color: WIND }
    ]
    : [
      { d: 'M150 50 Q 84 56 28 96', color: WIND },
      { d: 'M170 50 Q 236 56 292 96', color: WIND }
    ]
  const centerArrow: FlowArrow = upslope
    ? { d: 'M160 52 L160 126', color: SINKING }
    : { d: 'M160 126 L160 52', color: RISING, label: '谷中气流上升', labelAt: [172, 96] }
  return {
    grounds: [{ d: 'M0 96 L110 146 L210 146 L320 96 L320 210 L0 210 Z', fill: 'rgba(82, 196, 26, 0.16)' }],
    arrows: [...slopeArrows, ...aloftArrows, centerArrow],
    placeLabels: [
      { text: '山坡（白天受热快）', at: [28, 88] },
      { text: '山谷', at: [160, 168] }
    ],
    caption: '山谷风：白天山坡升温快，风从谷底沿坡向上吹（谷风）；夜晚山坡冷却快，冷空气沿坡下滑流入谷底（山风）。'
  }
}

function urbanConfig(): SceneConfig {
  return {
    grounds: [{ d: 'M0 152 L320 152 L320 210 L0 210 Z', fill: 'rgba(0, 0, 0, 0.06)' }],
    arrows: [
      { d: 'M160 132 L160 46', color: RISING, label: '热岛气流上升', labelAt: [172, 92] },
      { d: 'M154 44 Q 100 30 62 60', color: WIND },
      { d: 'M166 44 Q 220 30 258 60', color: WIND },
      { d: 'M62 62 L62 122', color: SINKING },
      { d: 'M258 62 L258 122', color: SINKING },
      { d: 'M62 128 Q 108 118 144 130', color: WIND, label: '城市风', labelAt: [92, 112] },
      { d: 'M258 128 Q 212 118 176 130', color: WIND, label: '城市风', labelAt: [232, 112] }
    ],
    placeLabels: [
      { text: '市区（热岛）', at: [160, 168] },
      { text: '郊区', at: [62, 172] },
      { text: '郊区', at: [258, 172] }
    ],
    caption: '城市风：城区人口与产业集中、人为热排放多，气温高于郊区形成热岛；近地面空气由郊区流向城市，上升后在高空回流郊区，形成城郊环流。'
  }
}

const sceneConfig = computed<SceneConfig>(() => {
  if (scene.value === 'sea-land') return seaLandConfig(period.value)
  if (scene.value === 'valley') return valleyConfig(period.value)
  return urbanConfig()
})

const sceneOptions = [
  { value: 'sea-land', label: '海陆风' },
  { value: 'valley', label: '山谷风' },
  { value: 'urban', label: '城市风' }
] as const

const periodOptions = [
  { value: 'day', label: '白天' },
  { value: 'night', label: '夜晚' }
] as const

const showPeriodToggle = computed(() => scene.value !== 'urban')

const BUILDINGS: Array<[number, number, number]> = [
  [128, 24, 14], [144, 34, 12], [160, 20, 16], [174, 30, 13], [188, 16, 11]
]

const SUBURB_HOUSES: Array<[number, number]> = [[30, 6], [46, 8], [248, 7], [268, 6], [288, 8]]
</script>

<template>
  <div class="circulation-panel" role="group" aria-label="热力环流演示">
    <div class="panel-header">
      <span class="panel-title">热力环流</span>
      <a-segmented v-model:value="scene" size="small" :options="[...sceneOptions]" aria-label="环流场景" />
    </div>
    <div v-if="showPeriodToggle" class="period-row">
      <span class="row-label">时间</span>
      <a-segmented v-model:value="period" size="small" :options="[...periodOptions]" aria-label="昼与夜" />
    </div>
    <svg viewBox="0 0 320 210" class="circulation-svg" role="img" :aria-label="`热力环流示意图：${scene === 'sea-land' ? '海陆风' : scene === 'valley' ? '山谷风' : '城市风'}`">
      <circle v-if="period === 'day'" cx="292" cy="26" r="9" fill="#faad14" />
      <g v-else>
        <circle cx="292" cy="26" r="9" fill="rgba(0, 0, 0, 0.25)" />
        <circle cx="296" cy="23" r="8" fill="#ffffff" />
      </g>
      <path v-for="(ground, index) in sceneConfig.grounds" :key="index" :d="ground.d" :fill="ground.fill" stroke="rgba(0, 0, 0, 0.35)" stroke-width="1.5" />
      <g v-if="scene === 'urban'">
        <rect v-for="[bx, bw, bh] in BUILDINGS" :key="`b-${bx}`" :x="bx" :y="152 - bh" :width="bw" :height="bh" fill="rgba(0, 0, 0, 0.3)" rx="1.5" />
        <rect v-for="[hx, hw] in SUBURB_HOUSES" :key="`h-${hx}`" :x="hx" :y="152 - hw" :width="hw" :height="hw" fill="rgba(0, 0, 0, 0.18)" rx="1" />
      </g>
      <g v-if="scene === 'sea-land'">
        <path d="M14 158 Q 21 155 28 158 M40 162 Q 47 159 54 162 M96 158 Q 103 155 110 158 M118 164 Q 125 161 132 164" fill="none" stroke="rgba(22, 119, 255, 0.5)" stroke-width="1.2" />
      </g>
      <g v-for="(arrow, index) in sceneConfig.arrows" :key="`a-${index}`">
        <path :d="arrow.d" fill="none" :stroke="arrow.color" stroke-width="2.5" class="flow-arrow" marker-end="url(#circ-arrowhead)" />
      </g>
      <defs>
        <marker id="circ-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(0,0,0,0.55)" />
        </marker>
      </defs>
      <g font-size="11" font-family='"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif'>
        <text v-for="(arrow, index) in sceneConfig.arrows.filter((item) => item.label && item.labelAt)" :key="`l-${index}`" :x="arrow.labelAt![0]" :y="arrow.labelAt![1]" text-anchor="middle" :fill="arrow.color" font-weight="600">{{ arrow.label }}</text>
        <text v-for="(place, index) in sceneConfig.placeLabels" :key="`p-${index}`" :x="place.at[0]" :y="place.at[1]" text-anchor="middle" fill="rgba(0,0,0,0.65)">{{ place.text }}</text>
      </g>
    </svg>
    <div class="panel-caption">{{ sceneConfig.caption }}</div>
  </div>
</template>

<style scoped>
.circulation-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 380px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 10;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-title {
  margin-right: auto;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.period-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-label {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.circulation-svg {
  width: 100%;
  height: auto;
}

.flow-arrow {
  stroke-dasharray: 7 5;
  animation: flow-dash 1.1s linear infinite;
}

@keyframes flow-dash {
  to {
    stroke-dashoffset: -12;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-arrow {
    animation: none;
  }
}

.panel-caption {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}
</style>
