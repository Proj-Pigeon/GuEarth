<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useClimateStore } from '@renderer/stores/climate'
import { useGlobeStore } from '@renderer/stores/globe'
import type { PoiStatisticsResult } from '../../../preload'
import { CENTRAL_PLACE_CASES, CITY_TIER_META, centralPlaceFacts, urbanCities, type CentralPlaceCase } from '@renderer/thematic/urbanCities'
import BarChart, { type BarSeries } from '@renderer/components/charts/BarChart.vue'

const emit = defineEmits<{ close: [] }>()

const climateStore = useClimateStore()
const globeStore = useGlobeStore()

const VERIFICATION_RADIUS_KM = 3

const verificationCases = CENTRAL_PLACE_CASES.filter((item) => item.level !== 'low')
const highCase = verificationCases.find((item) => item.level === 'high') ?? verificationCases[0]
const lowCase = verificationCases.find((item) => item.level === 'middle') ?? verificationCases[verificationCases.length - 1]

const selectedHigh = ref<CentralPlaceCase>(highCase)
const selectedLow = ref<CentralPlaceCase>(lowCase)
const running = ref(false)
const highResult = ref<PoiStatisticsResult | null>(null)
const lowResult = ref<PoiStatisticsResult | null>(null)
const statusText = ref('')

const missingKey = computed(() => !globeStore.providerCredentials.amap?.configured)

function selectCase(tier: 'high' | 'low', name: string): void {
  const item = CENTRAL_PLACE_CASES.find((candidate) => candidate.name === name)
  if (!item) return
  if (tier === 'high') {
    if (item.name === selectedLow.value.name) selectedLow.value = selectedHigh.value
    selectedHigh.value = item
  } else {
    if (item.name === selectedHigh.value.name) selectedHigh.value = selectedLow.value
    selectedLow.value = item
  }
  highResult.value = null
  lowResult.value = null
  statusText.value = ''
}

async function runVerification(): Promise<void> {
  if (running.value) return
  running.value = true
  highResult.value = null
  lowResult.value = null
  statusText.value = '正在统计 POI，请稍候…'
  try {
    const [high, low] = await Promise.all([
      window.guEarth.places.poiStatistics({ centerName: selectedHigh.value.name, city: selectedHigh.value.city, radiusMeters: VERIFICATION_RADIUS_KM * 1000, maxSamples: 400 }),
      window.guEarth.places.poiStatistics({ centerName: selectedLow.value.name, city: selectedLow.value.city, radiusMeters: VERIFICATION_RADIUS_KM * 1000, maxSamples: 400 })
    ])
    highResult.value = high
    lowResult.value = low
    if (high.error || low.error) {
      statusText.value = [high.error, low.error].filter(Boolean).join('；')
      return
    }
    const highCategories = high.categories.length
    const lowCategories = low.categories.length
    statusText.value = `高级中心地：${high.sampled} 条 / ${highCategories} 类；低级中心地：${low.sampled} 条 / ${lowCategories} 类。${highCategories >= lowCategories && high.sampled >= low.sampled ? '结果符合中心地理论：等级越高，POI 总量越大、职能类别越齐全。' : '本次抽样差异不明显，可更换对比城市或扩大半径后重试。'}`
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : 'POI 统计请求失败'
  } finally {
    running.value = false
  }
}

const topCategories = computed(() => {
  const union = new Map<string, string>()
  for (const item of highResult.value?.categories ?? []) union.set(item.code, item.label)
  for (const item of lowResult.value?.categories ?? []) union.set(item.code, item.label)
  const rank = (code: string, result: PoiStatisticsResult | null): number => result?.categories.find((item) => item.code === code)?.count ?? 0
  return [...union.entries()]
    .map(([code, label]) => ({ code, label, high: rank(code, highResult.value), low: rank(code, lowResult.value) }))
    .sort((a, b) => (b.high + b.low) - (a.high + a.low))
    .slice(0, 8)
})

const categories = computed(() => topCategories.value.map((item) => item.label))
const series = computed<BarSeries[]>(() => [
  { name: `高级：${selectedHigh.value.name}`, color: '#d4380d', values: topCategories.value.map((item) => item.high) },
  { name: `低级：${selectedLow.value.name}`, color: '#52c41a', values: topCategories.value.map((item) => item.low) }
])
</script>

<template>
  <div class="cities-panel" role="group" aria-label="城镇与中心地">
    <div class="panel-header">
      <span class="panel-title">城镇体系与中心地</span>
      <a-button type="text" size="small" aria-label="关闭城镇面板" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>

    <div class="chart-title">城市等级体系（{{ CITY_TIER_META.length }} 级）</div>
    <div class="tier-table">
      <div class="tier-row tier-head"><span>等级</span><span>数量</span><span>示例</span><span>服务半径</span></div>
      <div v-for="meta in CITY_TIER_META" :key="meta.id" class="tier-row">
        <span class="tier-name"><span class="tier-dot" :style="{ background: meta.color }"></span>{{ meta.name }}</span>
        <span class="tier-num">{{ urbanCities.filter((city) => city.tier === meta.id).length }}</span>
        <span class="tier-example">{{ urbanCities.find((city) => city.tier === meta.id)?.name ?? '—' }}</span>
        <span class="tier-num">≈ {{ meta.serviceRadiusKm }} km</span>
      </div>
    </div>
    <div v-for="fact in centralPlaceFacts.slice(0, 3)" :key="fact" class="fact">· {{ fact }}</div>

    <div class="chart-title">中心地验证（同半径 {{ VERIFICATION_RADIUS_KM }} km POI 对比）</div>
    <div class="case-pickers">
      <a-select
        :value="selectedHigh.name"
        size="small"
        class="case-select"
        @change="(value: unknown) => selectCase('high', String(value))"
      >
        <a-select-option v-for="item in CENTRAL_PLACE_CASES" :key="item.name" :value="item.name">{{ item.name }}</a-select-option>
      </a-select>
      <span class="vs">vs</span>
      <a-select
        :value="selectedLow.name"
        size="small"
        class="case-select"
        @change="(value: unknown) => selectCase('low', String(value))"
      >
        <a-select-option v-for="item in CENTRAL_PLACE_CASES" :key="item.name" :value="item.name">{{ item.name }}</a-select-option>
      </a-select>
    </div>
    <div v-if="missingKey" class="panel-note">需要先在「图层管理 → 供应商密钥」配置高德 Web 服务 Key 才能进行 POI 统计。</div>
    <a-button class="panel-action" size="small" block :disabled="running || missingKey" @click="runVerification">
      <ReloadOutlined :spin="running" /> {{ running ? '统计中…' : '开始 POI 统计对比' }}
    </a-button>
    <p v-if="statusText" class="fact">{{ statusText }}</p>
    <template v-if="highResult && lowResult && !highResult.error && !lowResult.error">
      <BarChart
        v-if="categories.length"
        :categories="[...categories]"
        :series="series"
        show-legend
        :value-min="0"
        y-name="条"
        :height="176"
      />
      <div v-if="topCategories.length" class="chart-title">高级职能类别（仅高等级中心地出现）</div>
      <div v-if="topCategories.length" class="fact">
        高级类别差异：{{ topCategories.filter((item) => item.high > 0 && item.low === 0).map((item) => item.label).join('、') || '本次抽样未见独有高级职能' }}
      </div>
    </template>
    <a-button
      class="panel-action"
      size="small"
      block
      :disabled="climateStore.overlays['city-tiers']"
      @click="climateStore.setOverlay('city-tiers', true)"
    >
      {{ climateStore.overlays['city-tiers'] ? '城市等级图层已开启' : '在地球上查看城市等级体系' }}
    </a-button>
    <div class="panel-note">城市等级与职能描述依据第七次人口普查城镇化数据与《城市规划原理》惯用分级；POI 统计来自高德开放平台。</div>
  </div>
</template>

<style scoped>
.cities-panel {
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

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cities-panel > * {
  flex: none;
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

.tier-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tier-row {
  display: grid;
  grid-template-columns: 1.4fr 0.5fr 0.7fr 0.8fr;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(5, 5, 5, 0.04);
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 18px;
}

.tier-head {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.tier-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(0, 0, 0, 0.88);
}

.tier-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.tier-num {
  font-variant-numeric: tabular-nums;
}

.case-pickers {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-select {
  flex: 1;
  min-width: 0;
}

.vs {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  flex: none;
}
</style>
