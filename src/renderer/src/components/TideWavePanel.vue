<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const emit = defineEmits<{ close: [] }>()

type Tab = 'wave' | 'tide'
const tab = ref<Tab>('wave')
const tideMode = ref<'spring' | 'neap'>('spring')

const tabOptions = [
  { value: 'wave', label: '波浪' },
  { value: 'tide', label: '潮汐' }
] as const

const tideModeOptions = [
  { value: 'spring', label: '大潮（朔望）' },
  { value: 'neap', label: '小潮（上下弦）' }
] as const

const moonAngle = computed(() => (tideMode.value === 'spring' ? 0 : 90))
const moonX = computed(() => 170 + 74 * Math.cos((moonAngle.value * Math.PI) / 180))
const moonY = computed(() => 96 - 74 * Math.sin((moonAngle.value * Math.PI) / 180))

const bulgeRotation = computed(() => (tideMode.value === 'spring' ? 0 : -18))

const waveParticles: Array<{ cx: number; cy: number; r: number; delay: number }> = [
  { cx: 62, cy: 100, r: 7, delay: 0 },
  { cx: 122, cy: 100, r: 7, delay: -0.7 },
  { cx: 182, cy: 100, r: 7, delay: -1.4 },
  { cx: 242, cy: 100, r: 6, delay: -2.1 },
  { cx: 292, cy: 100, r: 4.5, delay: -2.8 }
]

const waveFacts = [
  '波浪：风摩擦海面将能量传给海水，水质点大致沿圆形轨道运动，波形向前传播而水质点几乎不随波前进。',
  '深水区水质点轨道接近圆形；浅水区受海底摩擦，轨道变扁，波高增大，最终波峰前倾破碎形成拍岸浪。',
  '波浪是塑造海岸地貌（海蚀崖、海蚀柱、沙滩）的主要外力之一。'
]

const tideFacts = computed(() =>
  tideMode.value === 'spring'
    ? [
        '大潮：日、月、地三者大致呈直线（农历初一朔、十五望），太阳潮与太阴潮叠加，潮差最大。',
        '对月一侧因月球引力直接吸引海水隆起，背月一侧因惯性离心力隆起，全球同时出现两个潮汐隆起。',
        '钱塘江大潮（农历八月十八前后）即天文大潮叠加上宽下窄喇叭口地形的放大效果。'
      ]
    : [
        '小潮：日、月、地三者呈直角（农历初八上弦、廿三下弦），太阳潮削弱太阴潮，潮差最小。',
        '月球引潮力约为太阳引潮力的 2.2 倍，月球是潮汐的主导因素。',
        '潮汐昼夜两涨两落；渔港赶海、潮汐发电、大型舰船趁潮进出港都是对潮汐规律的利用。'
      ]
)
</script>

<template>
  <div class="tide-panel" role="group" aria-label="潮汐与波浪演示">
    <div class="panel-header">
      <span class="panel-title">潮汐与波浪</span>
      <a-segmented v-model:value="tab" size="small" :options="[...tabOptions]" aria-label="波浪或潮汐" />
      <a-button type="text" size="small" aria-label="关闭潮汐与波浪" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <svg v-if="tab === 'wave'" viewBox="0 0 340 200" class="tide-svg" role="img" aria-label="波浪与水质点运动示意">
      <defs>
        <linearGradient id="tw-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="dc.oceanShallow" stop-opacity="0.45" />
          <stop offset="100%" :stop-color="dc.oceanDeep" stop-opacity="0.5" />
        </linearGradient>
        <linearGradient id="tw-bed" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#d3c0a3" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#d3c0a3" stop-opacity="0.2" />
        </linearGradient>
        <marker id="tide-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="dc.neutralArrow" />
        </marker>
      </defs>
      <rect x="0" y="0" width="340" height="200" rx="8" fill="#f6fbff" />
      <path d="M0 132 L340 132 L340 200 L0 200 Z" fill="url(#tw-bed)" />
      <path d="M0 96 L340 96 L340 132 L0 132 Z" fill="url(#tw-sea)" />
      <g class="wave-move">
        <path d="M-170 96 Q -127.5 66 -85 96 T 0 96 T 85 96 T 170 96 T 255 96 T 340 96 T 425 96 T 510 96" fill="none" :stroke="dc.primary" stroke-width="2.5" stroke-linecap="round" />
      </g>
      <g v-for="p in waveParticles" :key="p.cx">
        <circle :cx="p.cx" :cy="p.cy" :r="p.r" fill="none" stroke="rgba(250, 84, 28, 0.35)" stroke-width="1" stroke-dasharray="2 3" />
        <g class="particle-orbit" :style="{ transformOrigin: `${p.cx}px ${p.cy}px`, animationDelay: `${p.delay}s` }">
          <circle :cx="p.cx" :cy="p.cy - p.r" r="3" fill="#fa541c" />
        </g>
      </g>
      <path d="M 200 118 C 216 130 232 134 248 134" fill="none" :stroke="dc.neutralArrow" stroke-width="1.6" marker-end="url(#tide-head)" />
      <g :font-family="diagramFont">
        <text x="16" y="22" font-size="11" :fill="dc.inkSecondary">风向 →</text>
        <text x="304" y="60" font-size="11" :fill="dc.primary" font-weight="600" text-anchor="middle">波形向前传播</text>
        <path d="M 258 64 L 274 70" :stroke="dc.primary" stroke-width="1" opacity="0.5" />
        <text x="168" y="152" font-size="11" fill="#fa541c" text-anchor="middle" font-weight="600" class="svg-stroked">水质点沿轨道运动（不随波前进）</text>
        <text x="88" y="146" font-size="10" :fill="dc.inkSecondary" text-anchor="middle">浅水区轨道变扁、波高增大</text>
      </g>
    </svg>
    <svg v-else viewBox="0 0 340 200" class="tide-svg" role="img" aria-label="潮汐日地月示意">
      <defs>
        <radialGradient id="tw-earth" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#69b1ff" />
          <stop offset="100%" stop-color="#1677ff" />
        </radialGradient>
        <radialGradient id="tw-sun" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#ffd666" />
          <stop offset="100%" :stop-color="dc.sun" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="340" height="200" rx="8" fill="#f8f9fb" />
      <line x1="8" y1="96" x2="332" y2="96" stroke="rgba(0,0,0,0.14)" stroke-dasharray="4 5" />
      <circle cx="318" cy="96" r="14" fill="url(#tw-sun)" />
      <text x="318" y="128" text-anchor="middle" class="svg-label" :fill="dc.inkSecondary">太阳</text>
      <g :transform="`rotate(${bulgeRotation} 170 96)`" class="bulge-shift">
        <ellipse cx="170" cy="96" rx="68" ry="27" fill="rgba(22, 119, 255, 0.16)" stroke="rgba(22, 119, 255, 0.4)" stroke-width="1" stroke-dasharray="4 3" />
      </g>
      <circle cx="170" cy="96" r="20" fill="url(#tw-earth)" />
      <circle cx="170" cy="96" r="4.5" fill="rgba(255,255,255,0.9)" />
      <text x="170" y="150" text-anchor="middle" class="svg-label" :fill="dc.inkSecondary">地球</text>
      <text x="116" y="66" class="svg-label" :fill="dc.primary" font-weight="600" text-anchor="middle">潮汐隆起</text>
      <text x="228" y="132" class="svg-label" :fill="dc.primary" font-weight="600" text-anchor="middle">潮汐隆起</text>
      <circle cx="170" cy="96" r="74" fill="none" stroke="rgba(0,0,0,0.1)" stroke-dasharray="2 5" />
      <circle :cx="moonX" :cy="moonY" r="9" :fill="dc.moon" />
      <circle :cx="moonX - 3" :cy="moonY - 3" r="2" fill="rgba(255,255,255,0.28)" />
      <circle :cx="moonX + 2" :cy="moonY + 3" r="1.4" fill="rgba(255,255,255,0.2)" />
      <text :x="moonX" :y="moonY - 16" text-anchor="middle" class="svg-label" :fill="dc.inkSecondary">月球</text>
      <text v-if="tideMode === 'spring'" x="16" y="22" class="svg-label" :fill="dc.inkSecondary">日、月、地一线 → 潮差最大</text>
      <text v-else x="16" y="22" class="svg-label" :fill="dc.inkSecondary">日、月、地垂直 → 潮差最小</text>
    </svg>
    <a-segmented v-if="tab === 'tide'" v-model:value="tideMode" size="small" :options="[...tideModeOptions]" aria-label="大潮或小潮" />
    <div v-for="fact in tab === 'wave' ? waveFacts : tideFacts" :key="fact" class="fact">· {{ fact }}</div>
  </div>
</template>

<style scoped>
.tide-panel {
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

.tide-svg {
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.svg-label {
  font-size: 11px;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

.svg-stroked {
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.wave-move {
  animation: wave-slide 4.5s linear infinite;
}

@keyframes wave-slide {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-170px);
  }
}

.particle-orbit {
  animation: particle-spin 2.8s linear infinite;
}

@keyframes particle-spin {
  to {
    transform: rotate(360deg);
  }
}

.bulge-shift {
  transition: transform 0.6s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .wave-move,
  .particle-orbit {
    animation: none;
  }

  .bulge-shift {
    transition: none;
  }
}

.fact {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 19px;
}
</style>
