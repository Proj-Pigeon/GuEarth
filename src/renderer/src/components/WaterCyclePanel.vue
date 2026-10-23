<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined } from '@ant-design/icons-vue'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

const animationStep = ref(0)
const STEPS = ['蒸发', '水汽输送', '降水', '径流与下渗']
let timer: ReturnType<typeof setInterval> | undefined

function startTimer(): void {
  timer = setInterval(() => {
    animationStep.value = (animationStep.value + 1) % (STEPS.length + 1)
  }, 1600)
}

function togglePlay(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  } else {
    startTimer()
  }
}

const playing = ref(true)

function onPlayClick(): void {
  togglePlay()
  playing.value = timer !== undefined
}

onMounted(() => {
  startTimer()
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(128, 22, 7200000), duration: 1.2 })
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
})

watch(
  () => props.viewer,
  (viewer) => {
    if (!timer) return
    const current = viewer && !viewer.isDestroyed() ? toRaw(viewer) : undefined
    if (current) current.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(128, 22, 7200000), duration: 1.2 })
  }
)

const highlights = ['蒸发', '水汽输送', '降水', '地表径流', '下渗', '地下径流', '蒸腾']

function stepActive(step: number): boolean {
  if (animationStep.value === 0) return false
  if (animationStep.value === 4) return true
  return animationStep.value >= step
}

const notes = [
  '太阳辐射使海洋表面水分蒸发，是水循环最主要的动力与起点。',
  '海面蒸发的水汽随季风与盛行风输送到陆地上空，沟通海洋与陆地。',
  '水汽在迎风坡抬升冷却凝结，形成地形雨，是陆地淡水的主要来源。',
  '降水一部分沿地表汇入江河回到海洋（地表径流），一部分下渗成为地下水（地下径流），最终也回到海洋，完成海陆间循环。'
]
</script>

<template>
  <div class="water-cycle-panel" role="group" aria-label="水循环演示">
    <div class="panel-header">
      <span class="panel-title">水循环（海陆间循环）</span>
      <a-button size="small" @click="onPlayClick">{{ playing ? '暂停' : '播放' }}</a-button>
      <a-button type="text" size="small" aria-label="关闭水循环演示" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <svg viewBox="0 0 340 200" class="cycle-svg" role="img" aria-label="海陆间水循环环节示意图">
      <defs>
        <linearGradient id="wc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e6f4ff" />
          <stop offset="100%" stop-color="#ffffff" />
        </linearGradient>
        <linearGradient id="wc-ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="dc.oceanShallow" />
          <stop offset="100%" :stop-color="dc.oceanDeep" />
        </linearGradient>
        <linearGradient id="wc-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="dc.landHigh" />
          <stop offset="100%" stop-color="#d9f7be" />
        </linearGradient>
        <marker id="cycle-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="dc.neutralArrow" />
        </marker>
      </defs>
      <rect x="0" y="0" width="340" height="200" rx="8" fill="url(#wc-sky)" />
      <path d="M0 158 L150 158 L150 200 L0 200 Z" fill="url(#wc-ocean)" />
      <path d="M150 158 L206 158 L256 108 L340 66 L340 200 L150 200 Z" fill="url(#wc-land)" />
      <path d="M150 158 L206 158 L256 108 L340 66" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.2" />
      <g :class="{ 'stage-on': stepActive(1) }" class="stage">
        <path d="M 66 148 C 62 122 70 102 82 90" fill="none" :stroke="dc.rain" stroke-width="2.5" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <path d="M 88 150 C 86 128 92 112 100 102" fill="none" :stroke="dc.rain" stroke-width="1.6" marker-end="url(#cycle-head)" class="cycle-arrow" opacity="0.7" />
        <text x="52" y="106" class="stage-label" :fill="dc.rain" text-anchor="middle">蒸发</text>
      </g>
      <g :class="{ 'stage-on': stepActive(2) }" class="stage">
        <path d="M 104 82 Q 172 40 244 60" fill="none" :stroke="dc.vaporFlow" stroke-width="2.5" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="172" y="40" class="stage-label" :fill="dc.vaporFlow" text-anchor="middle">水汽输送</text>
      </g>
      <g :class="{ 'stage-on': stepActive(3) }" class="stage">
        <path d="M 242 68 L 236 92 M 258 64 L 252 90 M 274 60 L 268 86" :stroke="dc.rain" stroke-width="2" stroke-linecap="round" class="rain-streak" />
        <text x="290" y="70" class="stage-label" :fill="dc.rain">降水</text>
      </g>
      <g :class="{ 'stage-on': stepActive(4) }" class="stage">
        <path d="M 262 116 C 230 134 196 144 162 150" fill="none" :stroke="dc.waterFlow" stroke-width="2.5" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="268" y="112" class="stage-label" :fill="dc.waterFlow">地表径流</text>
        <path d="M 268 136 C 258 156 220 170 184 174" fill="none" :stroke="dc.waterFlow" stroke-width="1.6" stroke-dasharray="4 4" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="246" y="166" class="stage-label" :fill="dc.waterFlow">下渗·地下径流</text>
      </g>
      <g font-size="11" :font-family="diagramFont">
        <text x="70" y="184" fill="rgba(255,255,255,0.95)" text-anchor="middle" font-weight="600">海洋</text>
        <text x="304" y="150" :fill="dc.inkSecondary" text-anchor="middle">陆地（山地）</text>
      </g>
    </svg>
    <div class="note-row">
      <span v-for="(note, index) in notes" :key="note" class="note" :class="{ 'note-on': animationStep === 0 || animationStep === index + 1 }">{{ note }}</span>
    </div>
    <div class="chips">
      <span v-for="item in highlights" :key="item" class="chip">{{ item }}</span>
    </div>
    <div class="panel-note">三类水循环：海陆间循环（图中所示，使陆地淡水不断更新）、陆地内循环、海上内循环。人类活动主要影响环节是地表径流（修建水库、跨流域调水、植树造林增加下渗等）。当前视角已飞往西太平洋—东亚，可对照地球观察海洋蒸发与季风水汽输送的真实尺度。</div>
  </div>
</template>

<style scoped>
.water-cycle-panel {
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

.cycle-svg {
  width: 100%;
  height: auto;
}

.stage {
  opacity: 0.28;
  transition: opacity 0.5s ease;
}

.stage-on {
  opacity: 1;
}

.cycle-arrow {
  stroke-dasharray: 8 6;
  animation: cycle-dash 1.1s linear infinite;
}

@keyframes cycle-dash {
  to {
    stroke-dashoffset: -14;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cycle-arrow,
  .rain-streak {
    animation: none;
  }
}

.stage-label {
  font-size: 11px;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.rain-streak {
  animation: rain-fall 0.9s ease-in infinite alternate;
}

@keyframes rain-fall {
  to {
    transform: translateY(3px);
    opacity: 0.6;
  }
}

.note-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
  transition: color 0.4s ease;
}

.note-on {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  padding: 0 8px;
  font-size: 12px;
  line-height: 22px;
  color: rgba(0, 0, 0, 0.65);
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
}

.panel-note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
}
</style>
