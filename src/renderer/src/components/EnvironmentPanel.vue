<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, EnvironmentOutlined } from '@ant-design/icons-vue'
import { useClimateStore } from '@renderer/stores/climate'
import { SEA_LEVEL_SCENARIOS, coastalZones, inundationByZone, sampleVersion, seaLevelFacts, scenarioSummary, totalInundatedAreaKm2, type SeaLevelScenario } from '@renderer/thematic/seaLevelRise'
import BarChart, { type BarSeries } from '@renderer/components/charts/BarChart.vue'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

const climateStore = useClimateStore()

const flying = ref(false)

const rise = computed(() => climateStore.seaLevelRise)
const sampledCount = computed(() => sampleVersion.value)
const stats = computed(() => inundationByZone(rise.value))
const totalArea = computed(() => totalInundatedAreaKm2(rise.value))
const samplingDone = computed(() => stats.value.some((item) => item.sampled > 0))

const categories = computed(() => stats.value.map((item) => item.zone.name.split('（')[0]))
const series = computed<BarSeries[]>(() => [
  { name: `淹没面积（+${rise.value} m）`, color: '#1677ff', values: stats.value.map((item) => item.areaKm2) }
])

const scenarioOptions = SEA_LEVEL_SCENARIOS.map((value) => ({ label: `+${value} m`, value }))

function setScenario(value: unknown): void {
  climateStore.setSeaLevelRise(value as SeaLevelScenario)
}

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

    <div class="chart-title">各沿海低地淹没面积估算（km²）</div>
    <BarChart v-if="samplingDone" :categories="[...categories]" :series="series" :value-min="0" y-name="km²" :height="170" />
    <div v-else class="panel-note">正在对沿海格网做地形采样，首次开启约需数秒……若提示地形不可用，请先在「图层管理 → 地形」中开启真实地形源。</div>

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
    <div class="panel-note">淹没面积为教学估算：以格网地形高程与情景值比较得出，未考虑海堤、河流与地面沉降的局部影响。</div>
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
