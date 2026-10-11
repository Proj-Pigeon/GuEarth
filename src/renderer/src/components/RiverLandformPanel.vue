<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import LineChart, { type ChartSeries } from '@renderer/components/charts/LineChart.vue'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

interface RiverReach {
  id: string
  name: string
  stage: string
  center: [number, number, number]
  waypoints: Array<[number, number]>
  landform: string
  facts: string[]
}

const reaches: RiverReach[] = [
  {
    id: 'upper',
    name: '上游 · 金沙江虎跳峡',
    stage: '上游：V 形谷',
    center: [100.05, 27.25, 46000],
    waypoints: [[99.8, 27.48], [99.92, 27.37], [100.02, 27.3], [100.12, 27.18], [100.26, 27.02]],
    landform: 'V 形谷（峡谷）：落差大、流速快，以下切侵蚀为主',
    facts: ['河流上游落差大、流速快，垂直下切侵蚀为主，形成深邃的 V 形峡谷', '虎跳峡两岸为玉龙、哈巴雪山，谷坡陡峻，江面与峰顶高差达 3000 多米', '峡谷内水量丰富、落差集中，水能资源极为丰富，适合梯级开发']
  },
  {
    id: 'middle',
    name: '中游 · 荆江河曲',
    stage: '中游：河曲',
    center: [112.5, 29.75, 150000],
    waypoints: [[111.8, 29.9], [112.1, 29.72], [112.4, 29.82], [112.7, 29.62], [113.0, 29.72]],
    landform: '河曲：侧蚀为主，凹岸侵蚀、凸岸堆积',
    facts: ['进入中下游平原，流速减慢，侧向侵蚀增强，河流左右摆动形成河曲（蛇曲）', '凹岸（侵蚀岸）水深，可建港口；凸岸（堆积岸）沙滩发育，可淘金、建聚落与农业区', '荆江“九曲回肠”，历史上多次自然裁弯取直，留下牛轭湖遗迹']
  },
  {
    id: 'lower',
    name: '下游 · 长江三角洲',
    stage: '下游：三角洲',
    center: [120.7, 31.6, 300000],
    waypoints: [[118.8, 31.95], [119.8, 31.75], [120.6, 31.58], [121.4, 31.42], [122.0, 31.3]],
    landform: '三角洲：流速骤降，泥沙堆积为主',
    facts: ['河流入海时流速骤降、泥沙大量堆积，形成三角洲与冲积平原', '长江三角洲由河流泥沙不断向海推进而成，地势低平、河网密布，是典型的堆积地貌', '上游水土流失加剧会使泥沙增多、三角洲伸展加快；水库拦沙则使其变缓']
  }
]

const activeReach = ref<RiverReach>(reaches[0])
const profile = ref<Array<[number, number]>>([])
const sampling = ref(false)
const degraded = ref(false)

const series = computed<ChartSeries[]>(() => [{ name: '沿河高程剖面', color: '#722ed1', points: profile.value }])

function interpolate(waypoints: Array<[number, number]>): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const [x0, y0] = waypoints[index]
    const [x1, y1] = waypoints[index + 1]
    for (let step = 0; step < 4; step += 1) {
      points.push([x0 + ((x1 - x0) * step) / 4, y0 + ((y1 - y0) * step) / 4])
    }
  }
  points.push(waypoints[waypoints.length - 1])
  return points
}

async function sampleProfile(reach: RiverReach): Promise<void> {
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  profile.value = []
  if (!current) return
  sampling.value = true
  degraded.value = false
  try {
    const points = interpolate(reach.waypoints)
    const cartographics = points.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat))
    let heights: number[]
    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(current.terrainProvider, cartographics)
      heights = sampled.map((item) => (Number.isFinite(item.height) ? item.height : current.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(item.longitude * 180 / Math.PI, item.latitude * 180 / Math.PI)) ?? 0))
      degraded.value = sampled.some((item) => !Number.isFinite(item.height))
    } catch {
      heights = cartographics.map((item) => current.scene.globe.getHeight(item) ?? 0)
      degraded.value = true
    }
    let distance = 0
    profile.value = points.map((point, index) => {
      if (index > 0) {
        const [px, py] = points[index - 1]
        distance += Math.hypot((point[0] - px) * 111 * Math.cos((py * Math.PI) / 180), (point[1] - py) * 111)
      }
      return [Math.round(distance * 10) / 10, Math.round((heights[index] ?? 0) * 10) / 10]
    })
  } finally {
    sampling.value = false
  }
}

function selectReach(reach: RiverReach): void {
  activeReach.value = reach
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(reach.center[0], reach.center[1], reach.center[2]), duration: 1.4 })
  void sampleProfile(reach)
}

selectReach(reaches[0])

watch(
  () => props.viewer,
  (viewer) => {
    if (viewer && !viewer.isDestroyed()) selectReach(activeReach.value)
  }
)
</script>

<template>
  <div class="river-panel" role="group" aria-label="河流地貌发育">
    <div class="panel-header">
      <span class="panel-title">河流地貌发育</span>
      <a-button type="text" size="small" aria-label="关闭河流地貌" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <div class="reach-row">
      <a-button v-for="reach in reaches" :key="reach.id" size="small" :type="reach.id === activeReach.id ? 'primary' : 'default'" @click="selectReach(reach)">{{ reach.stage }}</a-button>
    </div>
    <div class="stage-name">{{ activeReach.name }}</div>
    <div class="landform-line">{{ activeReach.landform }}</div>
    <div class="chart-title">
      沿河真实高程剖面
      <LoadingOutlined v-if="sampling" class="loading-icon" />
    </div>
    <LineChart :series="series" :x-min="0" :x-max="Math.max(60, Math.ceil(profile[profile.length - 1]?.[0] ?? 60))" x-name="沿河距离(千米)" y-name="海拔(米)" :y-min="Math.min(0, Math.floor((profile.length ? Math.min(...profile.map((p) => p[1])) : 0) / 500) * 500)" :y-max="Math.ceil((profile.length ? Math.max(...profile.map((p) => p[1])) : 1000) / 500) * 500" :height="150" />
    <a-alert v-if="degraded" type="warning" show-icon message="地形源不可用或部分格网未取到，本剖面为粗略估算值" />
    <div v-for="fact in activeReach.facts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="panel-note">上游 V 形谷下切、中游河曲侧蚀、下游三角洲堆积，外力作用沿程演变。</div>
  </div>
</template>

<style scoped>
.river-panel {
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

.reach-row {
  display: flex;
  gap: 6px;
}

.reach-row :deep(.ant-btn) {
  flex: 1 1 0;
  min-width: 0;
}

.stage-name {
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.landform-line {
  color: rgba(114, 46, 209, 0.9);
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.loading-icon {
  color: #1677ff;
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
</style>
