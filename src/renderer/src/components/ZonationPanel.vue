<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import { mountainById, snowlineM, zonationMountains, zonationPrinciples, type ZonationMountain, type ZonationSlope } from '@renderer/thematic/mountainZonation'
import { greatCircleKm } from '@renderer/lib/transect'
import { cancelTransectFlight, clearTransectOverlay, flyTransect, sampleTransectGround } from '@renderer/composables/useTransectFlight'
import { useZonationStore } from '@renderer/stores/zonation'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()
const zonationStore = useZonationStore()

const SPECTRUM_W = 348
const SPECTRUM_H = 168
const SPECTRUM_TOP_Y = 16
const SPECTRUM_BASE_Y = 148
const SPECTRUM_LEFT = 34
const PROFILE_W = 348
const PROFILE_H = 120
const PROFILE_LEFT = 40
const PROFILE_RIGHT = 6
const PROFILE_TOP = 10
const PROFILE_BOTTOM = 20

const activeId = ref<string>(zonationMountains[0].id)
const active = ref<ZonationMountain>(zonationMountains[0])
const profile = ref<Array<[number, number]>>([])
const sampling = ref(false)
const degraded = ref(false)
const flying = ref(false)
const flightNote = ref('')

const mountainOptions = zonationMountains.map((mountain) => ({ label: `${mountain.name} · ${mountain.range}`, value: mountain.id }))

function spectrumY(mountain: ZonationMountain, elevationM: number): number {
  return SPECTRUM_BASE_Y - (elevationM / mountain.summitM) * (SPECTRUM_BASE_Y - SPECTRUM_TOP_Y)
}

const slopeLayouts = computed(() => {
  const mountain = active.value
  const paired = mountain.slopes.length === 2
  return mountain.slopes.map((slope: ZonationSlope, index: number) => {
    const cx = paired ? (index === 0 ? 104 : 274) : 189
    const halfW = paired ? 64 : 105
    const belts = slope.belts.map((belt) => ({
      ...belt,
      y: spectrumY(mountain, belt.toM),
      height: Math.max(1, spectrumY(mountain, belt.fromM) - spectrumY(mountain, belt.toM))
    }))
    const snow = snowlineM(slope)
    return {
      slope,
      cx,
      halfW,
      clipId: `zonation-clip-${mountain.id}-${index}`,
      triangle: `M ${cx - halfW} ${SPECTRUM_BASE_Y} L ${cx} ${SPECTRUM_TOP_Y} L ${cx + halfW} ${SPECTRUM_BASE_Y} Z`,
      belts,
      snowY: snow !== undefined ? spectrumY(mountain, snow) : undefined
    }
  })
})

const profileLayout = computed(() => {
  const maxKm = Math.max(40, Math.ceil(profile.value[profile.value.length - 1]?.[0] ?? 40))
  const elevMax = Math.max(1, active.value.summitM * 1.08)
  const toX = (km: number) => PROFILE_LEFT + (km / maxKm) * (PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT)
  const toY = (elevationM: number) => PROFILE_TOP + (1 - elevationM / elevMax) * (PROFILE_H - PROFILE_TOP - PROFILE_BOTTOM)
  let summit: { x: number; y: number; elevationM: number } | undefined
  for (const [km, elevationM] of profile.value) {
    if (!summit || elevationM > summit.elevationM) summit = { x: toX(km), y: toY(elevationM), elevationM }
  }
  const stripeSlope = active.value.slopes[0]
  return {
    maxKm,
    linePoints: profile.value.map(([km, elevationM]) => `${toX(km).toFixed(1)},${toY(elevationM).toFixed(1)}`).join(' '),
    stripes: stripeSlope.belts.map((belt) => ({
      color: belt.color,
      y: toY(belt.toM),
      height: Math.max(1, toY(belt.fromM) - toY(belt.toM))
    })),
    snowY: (() => { const snow = snowlineM(stripeSlope); return snow !== undefined ? toY(snow) : undefined })(),
    summit,
    baseY: toY(0),
    peakElevation: summit ? Math.round(summit.elevationM) : active.value.summitM,
    kmTicks: [0, Math.round(maxKm / 2), maxKm]
  }
})

async function sampleProfile(mountain: ZonationMountain): Promise<void> {
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  profile.value = []
  if (!current) return
  sampling.value = true
  degraded.value = false
  try {
    const { path, heights, degraded: sampledDegraded } = await sampleTransectGround(current, mountain.transect)
    degraded.value = sampledDegraded
    let distance = 0
    profile.value = path.map((point, index) => {
      if (index > 0) {
        const [previousLon, previousLat] = path[index - 1]
        distance += greatCircleKm(previousLon, previousLat, point[0], point[1])
      }
      return [Math.round(distance * 10) / 10, Math.round((heights[index] ?? 0) * 10) / 10]
    })
  } finally {
    sampling.value = false
  }
}

async function startFlight(): Promise<void> {
  if (flying.value) return
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  if (!current) {
    flightNote.value = '地球尚未就绪，稍后再试'
    return
  }
  flying.value = true
  flightNote.value = '正在采样沿线地形并计算安全飞行高度…'
  try {
    const result = await flyTransect(current, active.value.transect, {
      onProgress: ({ stage, completed, total }) => {
        if (stage === 'prewarm') flightNote.value = `飞行准备：并发预载沿线影像（画面短暂降暗）${completed}/${total}…`
        else if (stage === 'flying') flightNote.value = `剖面飞行中（第 ${completed}/${total} 段）…`
      }
    })
    if ('error' in result) flightNote.value = result.error
    else if (result.status === 'interrupted') {
      const reason = result.reason === 'exaggeration-changed'
        ? '飞行中垂直夸张被调整，高度计划已失效，请调整好后重新飞行'
        : result.reason === 'superseded'
          ? '本次飞行被新一次飞行取代'
          : '剖面飞行已停止'
      flightNote.value = reason
    } else {
      const samplingNote = result.maxGroundM !== undefined ? `，沿线最高地表 ${result.maxGroundM} 米${result.degraded ? '（数据不完整，已用安全盲飞高度）' : ''}` : ''
      flightNote.value = `剖面飞行完成：全程约 ${result.totalKm} 千米，最高飞行高度约 ${result.flightAltitudeM} 米${samplingNote}`
    }
  } finally {
    flying.value = false
  }
}

function selectMountain(mountainId: string): void {
  const mountain = mountainById(mountainId)
  if (!mountain) return
  activeId.value = mountain.id
  active.value = mountain
  flightNote.value = ''
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(mountain.longitude, mountain.latitude, mountain.viewHeight), duration: 1.4 })
  void sampleProfile(mountain)
}

selectMountain(zonationMountains[0].id)

watch(
  () => props.viewer,
  (viewer) => {
    if (viewer && !viewer.isDestroyed()) selectMountain(activeId.value)
  }
)

onUnmounted(() => {
  clearTransectOverlay(props.viewer)
})
</script>

<template>
  <div class="zonation-panel" role="group" aria-label="山地垂直带谱剖面">
    <div class="panel-header">
      <span class="panel-title">山地垂直带谱剖面</span>
      <a-button type="text" size="small" aria-label="关闭山地垂直带谱剖面" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <a-select size="small" :value="activeId" :options="mountainOptions" style="width: 100%" aria-label="选择山脉" @change="selectMountain" />
    <svg :viewBox="`0 0 ${SPECTRUM_W} ${SPECTRUM_H}`" class="spectrum" role="img" aria-label="垂直带谱示意">
      <defs>
        <clipPath v-for="layout in slopeLayouts" :id="layout.clipId" :key="layout.clipId">
          <path :d="layout.triangle" />
        </clipPath>
      </defs>
      <text :x="SPECTRUM_LEFT - 4" :y="SPECTRUM_BASE_Y + 3" text-anchor="end" class="axis-label">0</text>
      <text :x="SPECTRUM_LEFT - 4" :y="SPECTRUM_TOP_Y + 4" text-anchor="end" class="axis-label">{{ active.summitM }}</text>
      <g v-for="layout in slopeLayouts" :key="layout.slope.label">
        <g :clip-path="`url(#${layout.clipId})`">
          <rect v-for="belt in layout.belts" :key="belt.id" :x="layout.cx - layout.halfW" :y="belt.y" :width="layout.halfW * 2" :height="belt.height" :fill="belt.color" />
        </g>
        <path :d="layout.triangle" fill="none" :stroke="'rgba(0, 0, 0, 0.45)'" stroke-width="1" />
        <line v-if="layout.snowY !== undefined" :x1="layout.cx - layout.halfW" :x2="layout.cx + layout.halfW" :y1="layout.snowY" :y2="layout.snowY" stroke="#f5222d" stroke-width="1" stroke-dasharray="4 3" opacity="0.7" />
        <text v-if="layout.snowY !== undefined" :x="layout.cx + layout.halfW + 2" :y="layout.snowY + 3" class="snowline-label">雪线</text>
        <text :x="layout.cx" :y="SPECTRUM_BASE_Y + 14" text-anchor="middle" class="slope-label">{{ layout.slope.label }}</text>
      </g>
    </svg>
    <div class="slope-legends" :class="{ 'slope-legends-paired': active.slopes.length === 2 }">
      <div v-for="layout in slopeLayouts" :key="layout.slope.label" class="slope-legend">
        <div v-for="belt in [...layout.slope.belts].reverse()" :key="belt.id" class="belt-chip" :title="belt.note">
          <span class="belt-swatch" :style="{ background: belt.color }"></span>
          <span class="belt-name">{{ belt.name }}</span>
          <span class="belt-range">{{ belt.fromM }}–{{ belt.toM }} m</span>
        </div>
      </div>
    </div>
    <div class="flight-row">
      <a-button type="primary" size="small" :loading="flying" @click="startFlight">沿剖面飞行</a-button>
      <a-button v-if="flying" size="small" @click="cancelTransectFlight">停止</a-button>
      <span v-if="flightNote" class="flight-note">{{ flightNote }}</span>
    </div>
    <div class="chart-title">
      沿剖面真实地形
      <LoadingOutlined v-if="sampling" class="loading-icon" />
    </div>
    <svg :viewBox="`0 0 ${PROFILE_W} ${PROFILE_H}`" class="profile" role="img" aria-label="沿剖面真实地形高程">
      <rect v-for="(stripe, index) in profileLayout.stripes" :key="index" :x="PROFILE_LEFT" :y="stripe.y" :width="PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT" :height="stripe.height" :fill="stripe.color" opacity="0.16" />
      <line v-if="profileLayout.snowY !== undefined" :x1="PROFILE_LEFT" :x2="PROFILE_W - PROFILE_RIGHT" :y1="profileLayout.snowY" :y2="profileLayout.snowY" stroke="#f5222d" stroke-width="1" stroke-dasharray="4 3" opacity="0.6" />
      <line :x1="PROFILE_LEFT" :x2="PROFILE_W - PROFILE_RIGHT" :y1="profileLayout.baseY" :y2="profileLayout.baseY" stroke="rgba(5, 5, 5, 0.15)" stroke-width="1" />
      <polyline :points="profileLayout.linePoints" fill="none" stroke="#1677ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <g v-if="profileLayout.summit">
        <circle :cx="profileLayout.summit.x" :cy="profileLayout.summit.y" r="3.5" fill="#1677ff" />
        <text :x="profileLayout.summit.x" :y="profileLayout.summit.y - 6" text-anchor="middle" class="peak-label">{{ profileLayout.peakElevation }} m</text>
      </g>
      <text :x="PROFILE_LEFT - 4" :y="profileLayout.baseY + 3" text-anchor="end" class="axis-label">0</text>
      <text :x="PROFILE_LEFT - 4" :y="PROFILE_TOP + 8" text-anchor="end" class="axis-label">{{ profileLayout.peakElevation }}</text>
      <text v-for="tick in profileLayout.kmTicks" :key="tick" :x="PROFILE_LEFT + ((PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT) * tick) / profileLayout.maxKm" :y="PROFILE_H - 6" text-anchor="middle" class="axis-label">{{ tick }}</text>
      <text :x="PROFILE_W - PROFILE_RIGHT" :y="PROFILE_H - 6" text-anchor="end" class="axis-unit">km</text>
    </svg>
    <a-alert v-if="degraded" type="warning" show-icon message="地形源不可用或部分格网未取到，本剖面为粗略估算值" />
    <div class="section-title">带谱解读</div>
    <div v-for="fact in active.facts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="section-title">垂直地域分异要点</div>
    <div v-for="principle in zonationPrinciples" :key="principle" class="fact principle">· {{ principle }}</div>
    <div class="panel-note">带谱界线为教学近似值；切换山脉会飞往实地并沿剖面采样真实地形，点击「沿剖面飞行」可沿剖面线引导视察。</div>
  </div>
</template>

<style scoped>
.zonation-panel {
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

.spectrum,
.profile {
  width: 100%;
  display: block;
}

.axis-label,
.axis-unit,
.slope-label,
.snowline-label,
.peak-label {
  font-size: 10px;
  fill: rgba(0, 0, 0, 0.45);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

.slope-label {
  fill: rgba(0, 0, 0, 0.65);
}

.snowline-label {
  fill: rgba(245, 34, 45, 0.85);
}

.peak-label {
  fill: #1677ff;
  font-weight: 600;
}

.slope-legends {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slope-legends-paired {
  flex-direction: row;
  gap: 12px;
}

.slope-legends-paired .slope-legend {
  flex: 1 1 0;
  min-width: 0;
}

.slope-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.belt-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.belt-swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.belt-name {
  color: rgba(0, 0, 0, 0.65);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.belt-range {
  margin-left: auto;
  flex: none;
  color: rgba(0, 0, 0, 0.45);
  font-size: 10px;
}

.flight-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flight-note {
  color: rgba(0, 0, 0, 0.65);
  font-size: 11px;
  line-height: 16px;
  min-width: 0;
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

.section-title {
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
</style>
