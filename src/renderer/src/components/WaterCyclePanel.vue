<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined } from '@ant-design/icons-vue'

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
      <path d="M0 158 L150 158 L150 200 L0 200 Z" fill="rgba(22, 119, 255, 0.18)" />
      <path d="M150 158 L206 158 L256 108 L340 66 L340 200 L150 200 Z" fill="rgba(82, 196, 26, 0.16)" />
      <g :class="{ 'stage-on': stepActive(1) }" class="stage">
        <path d="M 74 150 C 70 124 78 104 88 92" fill="none" stroke="#1677ff" stroke-width="3" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="74" y="136" class="stage-label" fill="#1677ff">蒸发</text>
      </g>
      <g :class="{ 'stage-on': stepActive(2) }" class="stage">
        <path d="M 96 84 Q 168 44 246 66" fill="none" stroke="#722ed1" stroke-width="3" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="168" y="52" class="stage-label" fill="#722ed1" text-anchor="middle">水汽输送</text>
      </g>
      <g :class="{ 'stage-on': stepActive(3) }" class="stage">
        <path d="M 232 76 L 228 98 M 248 72 L 244 96 M 264 68 L 260 92" stroke="#1677ff" stroke-width="2" stroke-linecap="round" />
        <text x="268" y="86" class="stage-label" fill="#1677ff">降水</text>
      </g>
      <g :class="{ 'stage-on': stepActive(4) }" class="stage">
        <path d="M 252 118 C 216 138 188 146 158 150" fill="none" stroke="#13c2c2" stroke-width="3" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="206" y="146" class="stage-label" fill="#13c2c2" text-anchor="middle">地表径流</text>
        <path d="M 262 130 C 252 152 210 168 176 172" fill="none" stroke="#13c2c2" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#cycle-head)" class="cycle-arrow" />
        <text x="216" y="182" class="stage-label" fill="#13c2c2" text-anchor="middle">下渗·地下径流</text>
      </g>
      <defs>
        <marker id="cycle-head" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(0,0,0,0.55)" />
        </marker>
      </defs>
      <g font-size="11" font-family='"Microsoft YaHei", "PingFang SC", sans-serif'>
        <text x="66" y="180" fill="rgba(0,0,0,0.65)" text-anchor="middle">海洋</text>
        <text x="296" y="180" fill="rgba(0,0,0,0.65)" text-anchor="middle">陆地（山地）</text>
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
  .cycle-arrow {
    animation: none;
  }
}

.stage-label {
  font-size: 11px;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-weight: 600;
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
