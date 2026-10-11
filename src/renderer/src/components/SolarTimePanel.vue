<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs, { type Dayjs } from 'dayjs'
import { CaretRightOutlined, LineChartOutlined, PauseOutlined, RetweetOutlined } from '@ant-design/icons-vue'
import type * as Cesium from 'cesium'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useSolarStore } from '@renderer/stores/solar'
import { useClimateStore } from '@renderer/stores/climate'
import SolarChartPanel from '@renderer/components/SolarChartPanel.vue'

const store = useSolarStore()
const climateStore = useClimateStore()
const props = defineProps<{ viewer?: Cesium.Viewer }>()
const { hour, isPlaying, isAnnualPlaying } = storeToRefs(store)
const chartOpen = ref(false)

const dateValue = computed(() => dayjs(store.date))

const presets = [
  { key: 'spring-equinox', label: '春分' },
  { key: 'summer-solstice', label: '夏至' },
  { key: 'autumn-equinox', label: '秋分' },
  { key: 'winter-solstice', label: '冬至' }
] as const

const marks = { 0: '0时', 6: '6时', 12: '12时', 18: '18时', 24: '24时' }

useVisibleAnimation(() => store.active && (isPlaying.value || isAnnualPlaying.value), (dt) => {
  if (dt > 0) store.advance(dt)
  const viewer = props.viewer
  if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
})

watch([() => store.date, hour, () => store.active], () => {
  const viewer = props.viewer
  if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
})

</script>

<template>
  <div v-if="store.active" class="solar-panel" :class="{ stacked: climateStore.hasActiveOverlay }" role="group" aria-label="太阳光照时间轴">
    <a-button
      :type="isPlaying ? 'primary' : 'default'"
      shape="circle"
      :aria-label="isPlaying ? '暂停时间流逝' : '播放昼夜交替'"
      @click="store.togglePlaying()"
    >
      <PauseOutlined v-if="isPlaying" />
      <CaretRightOutlined v-else />
    </a-button>
    <a-tooltip title="直射点回归运动（按年推进日期）">
      <a-button
        :type="isAnnualPlaying ? 'primary' : 'default'"
        shape="circle"
        :aria-label="isAnnualPlaying ? '暂停直射点回归运动' : '播放直射点回归运动'"
        @click="store.toggleAnnualPlaying()"
      >
        <PauseOutlined v-if="isAnnualPlaying" />
        <RetweetOutlined v-else />
      </a-button>
    </a-tooltip>
    <a-date-picker
      :value="dateValue"
      size="small"
      format="M月D日"
      :allow-clear="false"
      aria-label="模拟日期"
      @change="(value: Dayjs | null) => value && store.setDate(value.format('YYYY-MM-DD'))"
    />
    <a-button v-for="preset in presets" :key="preset.key" size="small" @click="store.setPreset(preset.key)">
      {{ preset.label }}
    </a-button>
    <div class="clock-readout">
      <span class="clock-primary">北京 {{ store.beijingClock }}</span>
      <span class="clock-secondary">UTC {{ store.utcClock }}</span>
    </div>
    <a-tooltip title="昼夜规律曲线">
      <a-button
        type="text"
        size="small"
        class="chart-toggle"
        :class="{ active: chartOpen }"
        aria-label="昼夜规律曲线"
        @click="chartOpen = !chartOpen"
      >
        <LineChartOutlined />
      </a-button>
    </a-tooltip>
    <a-slider
      :value="hour"
      :min="0"
      :max="24"
      :step="0.25"
      :marks="marks"
      class="hour-slider"
      aria-label="模拟时刻（北京时间）"
      @change="(value: number) => store.setHour(value)"
    />
    <SolarChartPanel v-if="chartOpen" class="chart-anchor" @close="chartOpen = false" />
  </div>
</template>

<style scoped>
.solar-panel {
  position: absolute;
  bottom: 88px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  width: min(680px, calc(100vw - 600px));
  min-width: 480px;
  padding: 12px 20px 8px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 10;
}

.solar-panel.stacked {
  bottom: 160px;
}

@media (max-width: 1320px) {
  .solar-panel {
    bottom: 160px;
  }

  .solar-panel.stacked {
    bottom: 240px;
  }
}

.clock-readout {
  display: flex;
  flex-direction: column;
  margin-left: auto;
  line-height: 20px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.clock-primary {
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
}

.clock-secondary {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
}

.chart-toggle.active {
  color: #1677ff;
}

.hour-slider {
  flex-basis: 100%;
  margin: 2px 12px 20px 12px;
}

.chart-anchor {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, 100%);
}
</style>
