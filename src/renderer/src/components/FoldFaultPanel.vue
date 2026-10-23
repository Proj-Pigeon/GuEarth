<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined } from '@ant-design/icons-vue'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

type Tab = 'fold' | 'fault'
const tab = ref<Tab>('fold')

const tabOptions = [
  { value: 'fold', label: '褶皱' },
  { value: 'fault', label: '断层' }
] as const

const foldLayers = dc.strata.map((color, index) => ({ dy: index * 12, color }))

const foldFacts = [
  '褶皱：岩层受水平挤压发生弯曲变形。背斜岩层向上拱起（中心岩层老、两翼新），向斜岩层向下弯曲（中心岩层新、两翼老）。',
  '地形倒置：背斜顶部受张力易被侵蚀成谷地，向斜槽部坚实抗侵蚀反而成山——背斜成谷、向斜成山。',
  '应用：背斜是良好的储油构造（找油气），向斜盆地利于储水（找水），隧道、工程选址多选背斜（岩层向上拱起，结构稳定）。'
]

const faultFacts = [
  '断层：岩层受压力或张力超过强度发生断裂，并沿断裂面发生明显位移。',
  '地垒：两条断层之间岩块相对上升，常形成块状山地（华山、庐山、泰山）；地堑：中间岩块相对下降，常形成谷地或低地（渭河平原、汾河谷地、东非大裂谷）。',
  '断层线附近岩石破碎，易被风化侵蚀；泉水、湖泊常沿断层线分布，工程建设要避开断层。'
]

interface GlobeCase {
  name: string
  longitude: number
  latitude: number
  height: number
  summary: string
}

const cases = computed<GlobeCase[]>(() =>
  tab.value === 'fold'
    ? [
      { name: '喜马拉雅褶皱山系', longitude: 86.9, latitude: 27.9, height: 900000, summary: '板块碰撞挤压形成的典型褶皱山系' },
      { name: '欧洲阿尔卑斯山', longitude: 9.5, latitude: 46.5, height: 900000, summary: '非洲板块与亚欧板块挤压形成' }
    ]
    : [
      { name: '东非大裂谷（地堑）', longitude: 36, latitude: -3, height: 1200000, summary: '大陆断裂拉伸下陷形成的巨型地堑带' },
      { name: '华山（地垒）', longitude: 110.08, latitude: 34.48, height: 45000, summary: '秦岭北麓断层上升形成的块状山地' },
      { name: '渭河平原（地堑）', longitude: 109.2, latitude: 34.4, height: 260000, summary: '断陷下陷形成的地堑谷地' }
    ]
)

function flyToCase(item: GlobeCase): void {
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(item.longitude, item.latitude, item.height), duration: 1.4 })
}

const facts = computed(() => (tab.value === 'fold' ? foldFacts : faultFacts))
</script>

<template>
  <div class="fold-panel" role="group" aria-label="褶皱与断层演示">
    <div class="panel-header">
      <span class="panel-title">褶皱与断层</span>
      <a-segmented v-model:value="tab" size="small" :options="[...tabOptions]" aria-label="褶皱或断层" />
      <a-button type="text" size="small" aria-label="关闭褶皱与断层" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <svg v-if="tab === 'fold'" viewBox="0 0 340 180" class="fold-svg" role="img" aria-label="背斜与向斜剖面示意">
      <defs>
        <marker id="fold-head" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" :fill="dc.fault" opacity="0.85" />
        </marker>
      </defs>
      <rect x="0" y="0" width="340" height="180" rx="8" fill="#fbf7f2" />
      <g v-for="layer in foldLayers" :key="layer.dy">
        <path
          :d="`M 8 ${96 + layer.dy} C 70 ${52 + layer.dy}, 110 ${48 + layer.dy}, 150 ${86 + layer.dy} C 190 ${124 + layer.dy}, 230 ${128 + layer.dy}, 332 ${92 + layer.dy}`"
          fill="none"
          :stroke="layer.color"
          stroke-width="7"
          stroke-linecap="round"
          opacity="0.9"
        />
      </g>
      <path d="M 136 64 L 136 48 M 164 64 L 164 48" :stroke="dc.fault" stroke-width="1.8" opacity="0.85" marker-end="url(#fold-head)" class="fold-arrow" />
      <g :font-family="diagramFont">
        <text x="150" y="24" :fill="dc.ink" font-size="11" font-weight="600" text-anchor="middle">背斜（岩层上拱，中心老两翼新）</text>
        <text x="150" y="42" :fill="dc.fault" font-size="10" text-anchor="middle" opacity="0.9">顶部受张力 · 易侵蚀成谷</text>
        <text x="150" y="132" fill="#389e0d" font-size="10" text-anchor="middle" font-weight="600" class="svg-stroked">槽部坚实 · 抗侵蚀成山</text>
        <text x="150" y="166" :fill="dc.ink" font-size="11" font-weight="600" text-anchor="middle">向斜（岩层下弯，中心新两翼老）</text>
      </g>
    </svg>
    <svg v-else viewBox="0 0 340 180" class="fold-svg" role="img" aria-label="地垒与地堑剖面示意">
      <defs>
        <marker id="fault-head" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" :fill="dc.fault" opacity="0.9" />
        </marker>
        <linearGradient id="ff-horst" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e6d3b8" />
          <stop offset="100%" stop-color="#cbb08a" />
        </linearGradient>
        <linearGradient id="ff-graben" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c8b7a6" />
          <stop offset="100%" stop-color="#a8937c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="340" height="180" rx="8" fill="#fbf7f2" />
      <rect x="0" y="148" width="340" height="32" :fill="dc.strataBase" />
      <g stroke="rgba(0,0,0,0.28)" stroke-width="1">
        <path d="M 4 96 L 82 96 L 82 148 L 4 148 Z" fill="url(#ff-graben)" />
        <path d="M 118 60 L 222 60 L 222 148 L 118 148 Z" fill="url(#ff-horst)" />
        <path d="M 258 100 L 336 100 L 336 148 L 258 148 Z" fill="url(#ff-graben)" />
      </g>
      <g stroke="rgba(0,0,0,0.14)" stroke-width="1">
        <path d="M 8 116 L 78 116 M 8 132 L 78 132" />
        <path d="M 122 84 L 218 84 M 122 108 L 218 108 M 122 132 L 218 132" />
        <path d="M 262 118 L 332 118 M 262 134 L 332 134" />
      </g>
      <path d="M 94 34 L 82 148" :stroke="dc.fault" stroke-width="2.2" class="fault-line" />
      <path d="M 246 34 L 258 148" :stroke="dc.fault" stroke-width="2.2" class="fault-line" />
      <g :stroke="dc.fault" stroke-width="1.8" opacity="0.9" marker-end="url(#fault-head)">
        <path d="M 170 44 L 170 26" />
        <path d="M 44 66 L 44 82" />
        <path d="M 296 74 L 296 90" />
      </g>
      <g :font-family="diagramFont">
        <text x="170" y="18" :fill="dc.fault" font-size="11" text-anchor="middle" font-weight="600">地垒：相对上升 → 块状山地（华山）</text>
        <text x="44" y="60" :fill="dc.fault" font-size="10" text-anchor="middle" opacity="0.9">下降</text>
        <text x="296" y="68" :fill="dc.fault" font-size="10" text-anchor="middle" opacity="0.9">下降</text>
        <text x="44" y="166" :fill="dc.inkSecondary" font-size="10" text-anchor="middle">地堑：相对下降 → 谷地平原</text>
        <text x="296" y="166" :fill="dc.inkSecondary" font-size="10" text-anchor="middle">谷地平原（渭河平原）</text>
      </g>
    </svg>
    <div v-for="fact in facts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="section-title">在地球上观察</div>
    <div class="case-row">
      <a-button v-for="item in cases" :key="item.name" size="small" @click="flyToCase(item)">{{ item.name }}</a-button>
    </div>
    <div class="panel-note">点击按钮飞往真实地点，结合地形起伏观察褶皱山系、地垒山地与地堑谷地的形态差异。</div>
  </div>
</template>

<style scoped>
.fold-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  gap: 8px;
}

.panel-title {
  margin-right: auto;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.fold-svg {
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.svg-stroked {
  paint-order: stroke;
  stroke: rgba(251, 247, 242, 0.9);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.fold-arrow {
  stroke-dasharray: 4 4;
  animation: fold-dash 1s linear infinite;
}

.fault-line {
  stroke-dasharray: 7 5;
  animation: fold-dash 1.1s linear infinite;
}

@keyframes fold-dash {
  to {
    stroke-dashoffset: -12;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fold-arrow,
  .fault-line {
    animation: none;
  }
}

.fact {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 19px;
}

.section-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.case-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.panel-note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
}
</style>
