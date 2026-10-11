<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons-vue'
import type * as Cesium from 'cesium'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useClimateStore } from '@renderer/stores/climate'

const store = useClimateStore()
const props = defineProps<{ viewer?: Cesium.Viewer }>()
const { month, isPlaying } = storeToRefs(store)

const displayMonth = computed(() => Math.min(12, Math.floor(month.value)))
const marks = { 1: '1月', 3: '3月', 5: '5月', 7: '7月', 9: '9月', 11: '11月', 12: '12月' }

const seasonText = computed(() => {
  if (store.summerStrength > 0.6) return '夏季风盛行'
  if (store.winterStrength > 0.6) return '冬季风强盛'
  return store.summerStrength >= store.winterStrength ? '夏季风增强' : '冬季风增强'
})

useVisibleAnimation(() => isPlaying.value && store.hasSeasonalOverlay, (dt) => {
  if (dt > 0) store.advance(dt)
  const viewer = props.viewer
  if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
})

watch(month, () => {
  const viewer = props.viewer
  if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
})

</script>

<template>
  <div v-if="store.hasSeasonalOverlay" class="month-timeline" role="group" aria-label="月份时间轴">
    <a-button
      :type="isPlaying ? 'primary' : 'default'"
      shape="circle"
      :aria-label="isPlaying ? '暂停月份播放' : '播放月份动画'"
      @click="store.togglePlaying()"
    >
      <PauseOutlined v-if="isPlaying" />
      <CaretRightOutlined v-else />
    </a-button>
    <div class="month-readout">
      <span class="month-value">{{ displayMonth }} 月</span>
      <span class="season-text">{{ seasonText }}</span>
    </div>
    <a-slider
      :value="displayMonth"
      :min="1"
      :max="12"
      :step="1"
      :marks="marks"
      class="month-slider"
      aria-label="月份选择"
      @change="(value: number) => store.setMonth(value)"
    />
  </div>
</template>

<style scoped>
.month-timeline {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  width: min(560px, calc(100vw - 700px));
  min-width: 340px;
  padding: 12px 16px 20px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
}

@media (max-width: 1320px) {
  .month-timeline {
    width: min(560px, calc(100vw - 720px));
  }
}

.month-readout {
  display: flex;
  flex-direction: column;
  min-width: 76px;
}

.month-value {
  color: rgba(0, 0, 0, 0.88);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.season-text {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.month-slider {
  flex: 1;
  margin: 0 10px 12px 10px;
}
</style>
