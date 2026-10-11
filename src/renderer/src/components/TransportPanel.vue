<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useClimateStore } from '@renderer/stores/climate'
import { useTransportStore } from '@renderer/stores/transport'
import { HSR_END_YEAR, hsrFacts, hsrGrowthSeries, hsrLines, hsrLinesUpTo, hsrMileageAt, type HsrLine } from '@renderer/thematic/hsrLines'
import { resolveFlightDestination } from '@renderer/composables/terrainFlight'
import LineChart, { type ChartSeries } from '@renderer/components/charts/LineChart.vue'
import YearTimeline from '@renderer/components/YearTimeline.vue'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

const climateStore = useClimateStore()
const transportStore = useTransportStore()

const flying = ref(false)

const displayYear = computed(() => Math.floor(transportStore.year))
const mileageWan = computed(() => (hsrMileageAt(displayYear.value) / 10000).toFixed(2))
const openedCount = computed(() => hsrLinesUpTo(displayYear.value).length)

const growthSeries = computed<ChartSeries[]>(() => [
  { name: '营业里程', color: '#d4380d', points: hsrGrowthSeries.map(([year, km]) => [year, Math.round(km / 100) / 100]) }
])

const caseLines: HsrLine[] = ['京津城际', '京沪高铁', '京广高铁', '兰新高铁', '沪昆高铁', '西成高铁']
  .map((name) => hsrLines.find((line) => line.name === name))
  .filter((line): line is HsrLine => Boolean(line))

async function flyToLine(line: HsrLine): Promise<void> {
  if (flying.value) return
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  if (!current) return
  flying.value = true
  try {
    const mid = line.path[Math.floor(line.path.length / 2)]
    const span = Math.min(1200000, Math.max(250000, line.lengthKm * 420))
    const destination = await resolveFlightDestination(current.scene, mid[0], mid[1], span)
    current.camera.flyTo({ destination, duration: 1.6 })
  } finally {
    flying.value = false
  }
}
</script>

<template>
  <div class="transport-panel" role="group" aria-label="交通运输布局">
    <div class="panel-header">
      <span class="panel-title">交通运输布局 · 高铁网络</span>
      <a-button type="text" size="small" aria-label="关闭交通运输面板" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>

    <YearTimeline />

    <div class="chart-title">高铁营业里程增长（万公里）</div>
    <LineChart :series="growthSeries" :x-min="2008" :x-max="HSR_END_YEAR" x-name="年份" y-name="万公里" :height="170" />

    <div class="fact">
      截至 {{ displayYear }} 年：全国高铁营业里程约 {{ mileageWan }} 万公里；图中已开通干线 {{ openedCount }} / {{ hsrLines.length }} 条。拖动时间轴或播放动画，观察高铁网络如何从京津城际生长为「八纵八横」。
    </div>

    <div class="chart-title">典型线路实地察看</div>
    <div class="case-grid">
      <a-button
        v-for="line in caseLines"
        :key="line.name"
        size="small"
        class="case-button"
        :disabled="line.openedYear > displayYear"
        @click="flyToLine(line)"
      >
        <EnvironmentOutlined /> {{ line.name.split('（')[0] }} · {{ line.openedYear }}
      </a-button>
    </div>

    <a-button class="panel-action" size="small" block :disabled="climateStore.overlays['hsr-network']" @click="climateStore.setOverlay('hsr-network', true)">
      {{ climateStore.overlays['hsr-network'] ? '高铁网络图层已开启' : '在地球上查看高铁网络生长' }}
    </a-button>

    <div v-for="fact in hsrFacts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="panel-note">营业里程为国家铁路局年度公报约数；线路走向为教学示意，点击线路可查看说明。</div>
  </div>
</template>

<style scoped>
.transport-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 400px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 10;
}

.transport-panel > * {
  flex: none;
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

.chart-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.fact {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 19px;
}

.panel-note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
}

.panel-action {
  margin-top: 2px;
}

.case-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.case-button {
  width: 100%;
  font-size: 12px;
  padding-inline-start: 4px;
  padding-inline-end: 4px;
}
</style>
