<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, EnvironmentOutlined } from '@ant-design/icons-vue'
import { useClimateStore } from '@renderer/stores/climate'
import {
  SEA_LEVEL_SCENARIOS, coastalZones, inundationByZone, landMask, seaSamplingStatus, seaLevelFacts,
  scenarioSummary, totalGridCellCount, totalInundatedAreaKm2, type SeaLevelScenario
} from '@renderer/thematic/seaLevelRise'
import { ensureSeaLevelSamples } from '@renderer/composables/seaLevelSampling'
import BarChart, { type BarSeries } from '@renderer/components/charts/BarChart.vue'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

const climateStore = useClimateStore()

const flying = ref(false)

const rise = computed(() => climateStore.seaLevelRise)
const stats = computed(() => inundationByZone(rise.value))
const totalArea = computed(() => totalInundatedAreaKm2(rise.value))
const sampledReady = computed(() => seaSamplingStatus.value === 'ready')
const hasSamples = computed(() => stats.value.some((item) => item.sampled > 0))
const sampledCount = computed(() => stats.value.reduce((sum, item) => sum + item.sampled, 0))
const maskFallback = computed(() => sampledReady.value && landMask.value === null)

const categories = computed(() => stats.value.map((item) => item.zone.name.split('（')[0]))
const series = computed<BarSeries[]>(() => [
  { name: `淹没面积（+${rise.value} m）`, color: '#1677ff', values: stats.value.map((item) => item.areaKm2) }
])

const scenarioOptions = SEA_LEVEL_SCENARIOS.map((value) => ({ label: `+${value} m`, value }))

function setScenario(value: unknown): void {
  climateStore.setSeaLevelRise(value as SeaLevelScenario)
}

async function beginSampling(): Promise<void> {
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  if (!current) return
  await ensureSeaLevelSamples(current)
}

onMounted(() => {
  void beginSampling()
})

watch(
  () => props.viewer,
  () => {
    void beginSampling()
  }
)

async function flyToZone(index: number): Promise<void> {
  if (flying.value) return
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  if (!current) return
  flying.value = true
  try {
    const zone = coastalZones[index]
    current.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(zone.center[0], zone.center[1], zone.center[2]), duration: 1.5 })
  } finally {
    flying.value = false
  }
}
</script>

<template>
  <div class="environment-panel" role="group" aria-label="环境与发展">
    <div class="panel-header">
      <span class="panel-title">环境与发展 · 海平面上升</span>
      <a-button type="text" size="small" aria-label="关闭环境面板" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>

    <div class="chart-title">上升情景（模拟地面高程低于情景值的沿海陆地）</div>
    <a-segmented :value="rise" :options="scenarioOptions" class="scenario-picker" @change="setScenario" />

    <template v-if="sampledReady">
      <div class="chart-title">各沿海低地淹没面积估算（km²，仅沿海陆地格网）</div>
      <BarChart v-if="hasSamples" :categories="[...categories]" :series="series" :value-min="0" y-name="km²" :height="170" />
      <div v-if="sampledCount < totalGridCellCount" class="panel-note">地形格网已采样 {{ sampledCount }}/{{ totalGridCellCount }}，缺口处估算偏保守，可稍后重开本面板补齐。</div>
      <div v-if="maskFallback" class="panel-note">省界海陆判定数据不可用，已按高程阈值粗略排除海面，结果可能偏差较大。</div>
    </template>
    <div v-else-if="seaSamplingStatus === 'terrain-required'" class="panel-note">未检测到真实地形源。请到「图层管理 → 地形」选择「全球 3D 地形」，切换后本面板会自动重新采样。</div>
    <div v-else-if="seaSamplingStatus === 'sampling'" class="panel-note">正在对沿海格网做地形采样，首次约需数秒……</div>
    <div v-else class="panel-note">
      地形采样尚未完成。
      <a-button type="link" size="small" @click="beginSampling">重试</a-button>
    </div>

    <div class="fact">
      +{{ rise }} 米情景下，五大沿海低地合计淹没面积约 {{ totalArea.toLocaleString() }} km²（格网估算）。{{ scenarioSummary(rise) }}
    </div>

    <div class="chart-title">实地察看沿海低地</div>
    <div class="zone-grid">
      <a-button v-for="(zone, index) in coastalZones" :key="zone.id" size="small" class="zone-button" @click="flyToZone(index)">
        <EnvironmentOutlined /> {{ zone.name.split('（')[0] }}
      </a-button>
    </div>

    <a-button
      class="panel-action"
      size="small"
      block
      :disabled="climateStore.overlays['sea-level-rise']"
      @click="climateStore.setOverlay('sea-level-rise', true)"
    >
      {{ climateStore.overlays['sea-level-rise'] ? '淹没模拟图层已开启' : '在地球上查看淹没模拟' }}
    </a-button>

    <div v-for="fact in seaLevelFacts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="panel-note">淹没面积为教学估算：陆地格网由省界与地形高程联合判定，与情景值比较得出，未考虑海堤、河流与地面沉降的局部影响。</div>
  </div>
</template>

<style scoped>
.environment-panel {
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

.environment-panel > * {
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

.scenario-picker {
  width: fit-content;
}

.zone-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.zone-button {
  width: 100%;
  font-size: 12px;
  padding-inline-start: 4px;
  padding-inline-end: 4px;
}
</style>
