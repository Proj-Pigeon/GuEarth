<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons-vue'
import { useTransportStore } from '@renderer/stores/transport'
import { HSR_END_YEAR, HSR_START_YEAR, hsrMileageAt } from '@renderer/thematic/hsrLines'

const store = useTransportStore()
const { year, isPlaying } = storeToRefs(store)

const displayYear = computed(() => Math.floor(year.value))
const marks: Record<number, string> = { 2008: '2008', 2012: '2012', 2016: '2016', 2020: '2020', 2025: '2025' }
const mileageText = computed(() => `约 ${(hsrMileageAt(displayYear.value) / 10000).toFixed(2)} 万公里`)

let rafId = 0
let lastTime = 0

function tick(now: number): void {
  rafId = requestAnimationFrame(tick)
  const dt = lastTime > 0 ? Math.min(0.05, (now - lastTime) / 1000) : 0
  lastTime = now
  if (dt > 0) store.advance(dt)
}

onMounted(() => {
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  rafId = 0
})
</script>

<template>
  <div class="year-timeline" role="group" aria-label="年份时间轴">
    <a-button
      :type="isPlaying ? 'primary' : 'default'"
      shape="circle"
      :aria-label="isPlaying ? '暂停年份播放' : '播放年份动画'"
      @click="store.togglePlaying()"
    >
      <PauseOutlined v-if="isPlaying" />
      <CaretRightOutlined v-else />
    </a-button>
    <div class="year-readout">
      <span class="year-value">{{ displayYear }} 年</span>
      <span class="mileage-text">{{ mileageText }}</span>
    </div>
    <a-slider
      :value="displayYear"
      :min="HSR_START_YEAR"
      :max="HSR_END_YEAR"
      :step="1"
      :marks="marks"
      class="year-slider"
      aria-label="年份选择"
      :tooltip-open="false"
      @change="(value: number) => store.setYear(value)"
    />
  </div>
</template>

<style scoped>
.year-timeline {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 4px 2px 6px;
}

.year-readout {
  display: flex;
  flex-direction: column;
  min-width: 96px;
}

.year-value {
  color: rgba(0, 0, 0, 0.88);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  font-variant-numeric: tabular-nums;
}

.mileage-text {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.year-slider {
  flex: 1;
  margin: 0 10px 12px 10px;
}
</style>
