<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { CaretRightOutlined, CloseOutlined, PauseOutlined } from '@ant-design/icons-vue'
import { useVisibleAnimation } from '@renderer/composables/useVisibleAnimation'
import { useSolarStore } from '@renderer/stores/solar'
import { dayLength, declinationForDate, formatClock, horizonCrossingsDeg, noonAltitudeDeg, solarHorizontalPositionDeg, type DayState } from '@renderer/thematic/solarMath'

const emit = defineEmits<{ close: [] }>()

const store = useSolarStore()
const latitude = ref(40)
const localHour = ref(10)
const isPlaying = ref(false)

const SVG_SIZE = 260
const CENTER = SVG_SIZE / 2
const HORIZON_RADIUS = 116
const PATH_COLOR = '#fa8c16'
const SUN_COLOR = '#fa8c16'
const NOON_COLOR = '#1677ff'

const presets = [
  { key: 'spring-equinox', label: '春分' },
  { key: 'summer-solstice', label: '夏至' },
  { key: 'autumn-equinox', label: '秋分' },
  { key: 'winter-solstice', label: '冬至' }
] as const

const dateValue = computed(() => dayjs(store.date))
const declination = computed(() => declinationForDate(store.parts.month, store.parts.day))
const length = computed(() => dayLength(latitude.value, declination.value))
const crossings = computed(() => horizonCrossingsDeg(latitude.value, declination.value))
const noonPosition = computed(() => solarHorizontalPositionDeg(latitude.value, declination.value, 12))
const sunNow = computed(() => solarHorizontalPositionDeg(latitude.value, declination.value, localHour.value))

function polarPoint(azimuthDeg: number, altitudeDeg: number): { x: number; y: number } {
  const radius = HORIZON_RADIUS * (1 - Math.max(0, Math.min(90, altitudeDeg)) / 90)
  const angle = (azimuthDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) }
}

const pathPoints = computed(() => {
  if (length.value.state === 'polar-night') return ''
  const points: Array<{ x: number; y: number }> = []
  for (let t = 0; t <= 24.001; t += 0.1) {
    const position = solarHorizontalPositionDeg(latitude.value, declination.value, t)
    if (position.altitudeDeg > 0.3) points.push(polarPoint(position.azimuthDeg, position.altitudeDeg))
  }
  if (length.value.state === 'polar-day' && points.length > 1) points.push(points[0])
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
})

const sunDot = computed(() => (sunNow.value.altitudeDeg > -0.3 ? polarPoint(sunNow.value.azimuthDeg, sunNow.value.altitudeDeg) : null))
const noonDot = computed(() => (noonPosition.value.altitudeDeg > 0 ? polarPoint(noonPosition.value.azimuthDeg, noonPosition.value.altitudeDeg) : null))
const sunriseDot = computed(() =>
  crossings.value.state === 'normal' && crossings.value.sunriseAzimuthDeg !== undefined ? polarPoint(crossings.value.sunriseAzimuthDeg, 0) : null
)
const sunsetDot = computed(() =>
  crossings.value.state === 'normal' && crossings.value.sunsetAzimuthDeg !== undefined ? polarPoint(crossings.value.sunsetAzimuthDeg, 0) : null
)

const DIRECTION_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

function directionText(azimuthDeg: number): string {
  const sector = Math.round(azimuthDeg / 45) % 8
  const offset = Math.round(azimuthDeg - sector * 45)
  if (offset === 0) return sector % 2 === 0 ? `正${DIRECTION_NAMES[sector]}` : DIRECTION_NAMES[sector]
  return offset > 0
    ? `${DIRECTION_NAMES[sector]}偏${DIRECTION_NAMES[(sector + 1) % 8]}${offset}°`
    : `${DIRECTION_NAMES[sector]}偏${DIRECTION_NAMES[(sector + 7) % 8]}${-offset}°`
}

function latLabel(value: number): string {
  return value === 0 ? '0°' : `${Math.abs(value)}°${value > 0 ? 'N' : 'S'}`
}

function azLabel(azimuth: number | undefined): string {
  return azimuth === undefined ? '—' : `${azimuth.toFixed(0)}°（${directionText(azimuth)}）`
}

const noonSkyText = computed(() => {
  if (noonPosition.value.altitudeDeg > 89) return '太阳位于天顶'
  return noonPosition.value.azimuthDeg <= 22.5 || noonPosition.value.azimuthDeg >= 337.5 ? '正午太阳位于正北天空' : '正午太阳位于正南天空'
})

const stateText = computed(() => {
  const state: DayState = length.value.state
  if (state === 'polar-day') return '当日极昼：太阳整日不落，轨迹为完整圆环'
  if (state === 'polar-night') return '当日极夜：太阳始终位于地平圈以下，无视运动轨迹'
  return ''
})

const LOCAL_HOURS_PER_SECOND = 1.5
useVisibleAnimation(() => isPlaying.value, (dt) => {
  if (dt > 0) localHour.value = (localHour.value + dt * LOCAL_HOURS_PER_SECOND) % 24
})

</script>

<template>
  <div class="solar-path-panel" role="group" aria-label="太阳视运动轨迹">
    <div class="panel-header">
      <span class="panel-title">太阳视运动轨迹</span>
      <span class="panel-subtitle">{{ store.date }}</span>
      <a-button type="text" size="small" aria-label="关闭太阳视运动轨迹" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <div class="preset-row">
      <a-button v-for="preset in presets" :key="preset.key" size="small" @click="store.setPreset(preset.key)">
        {{ preset.label }}
      </a-button>
      <a-date-picker
        :value="dateValue"
        size="small"
        format="M月D日"
        :allow-clear="false"
        aria-label="观察日期"
        @change="(value: Dayjs | null) => value && store.setDate(value.format('YYYY-MM-DD'))"
      />
    </div>
    <div class="latitude-row">
      <span class="row-label">观察点纬度</span>
      <a-slider
        :value="latitude"
        :min="-90"
        :max="90"
        :step="1"
        :marks="{ '-90': '90°S', 0: '0°', 90: '90°N' }"
        class="latitude-slider"
        aria-label="观察点纬度"
        @change="(value: number) => (latitude = value)"
      />
      <span class="row-value">{{ latLabel(latitude) }}</span>
    </div>
    <svg :viewBox="`0 0 ${SVG_SIZE} ${SVG_SIZE}`" class="sky-dome" role="img" aria-label="太阳视运动轨迹天穹图，外圈为地平圈，圆心为天顶">
      <circle :cx="CENTER" :cy="CENTER" :r="HORIZON_RADIUS" fill="rgba(0, 0, 0, 0.02)" stroke="rgba(0, 0, 0, 0.45)" stroke-width="1.5" />
      <circle :cx="CENTER" :cy="CENTER" :r="(HORIZON_RADIUS * 2) / 3" fill="none" stroke="rgba(0, 0, 0, 0.08)" stroke-dasharray="3 4" />
      <circle :cx="CENTER" :cy="CENTER" :r="HORIZON_RADIUS / 3" fill="none" stroke="rgba(0, 0, 0, 0.08)" stroke-dasharray="3 4" />
      <text :x="CENTER" :y="16" class="direction-label">北</text>
      <text :x="SVG_SIZE - 16" :y="CENTER + 4" class="direction-label">东</text>
      <text :x="CENTER" :y="SVG_SIZE - 6" class="direction-label">南</text>
      <text :x="16" :y="CENTER + 4" class="direction-label">西</text>
      <text :x="CENTER + 5" :y="CENTER - 5" class="zenith-label">天顶</text>
      <path v-if="pathPoints" :d="pathPoints" fill="none" :stroke="PATH_COLOR" stroke-width="2.5" />
      <g v-if="sunriseDot">
        <circle :cx="sunriseDot.x" :cy="sunriseDot.y" r="4" fill="#faad14" stroke="#ffffff" stroke-width="1.5" />
        <text :x="sunriseDot.x + 7" :y="sunriseDot.y + 4" class="marker-label">日出</text>
      </g>
      <g v-if="sunsetDot">
        <circle :cx="sunsetDot.x" :cy="sunsetDot.y" r="4" fill="#faad14" stroke="#ffffff" stroke-width="1.5" />
        <text :x="sunsetDot.x + 7" :y="sunsetDot.y + 4" class="marker-label">日落</text>
      </g>
      <g v-if="noonDot">
        <circle :cx="noonDot.x" :cy="noonDot.y" r="3.5" fill="none" :stroke="NOON_COLOR" stroke-width="1.5" />
        <text :x="noonDot.x + 7" :y="noonDot.y - 5" class="marker-label">正午</text>
      </g>
      <g v-if="sunDot">
        <circle :cx="sunDot.x" :cy="sunDot.y" r="7" fill="none" :stroke="SUN_COLOR" stroke-width="1" opacity="0.4" />
        <circle :cx="sunDot.x" :cy="sunDot.y" r="5" :fill="SUN_COLOR" stroke="#ffffff" stroke-width="1.5" />
      </g>
      <text v-if="length.state !== 'polar-night'" :x="CENTER" :y="SVG_SIZE - 24" class="hint-label">外圈=地平圈 · 圆心=天顶 · 虚线圈=高度30°/60°</text>
    </svg>
    <div v-if="stateText" class="state-text">{{ stateText }}</div>
    <div class="readout-grid">
      <div class="readout-item">
        <span class="readout-label">日出方位</span>
        <span class="readout-value">{{ azLabel(crossings.sunriseAzimuthDeg) }}</span>
      </div>
      <div class="readout-item">
        <span class="readout-label">日落方位</span>
        <span class="readout-value">{{ azLabel(crossings.sunsetAzimuthDeg) }}</span>
      </div>
      <div class="readout-item">
        <span class="readout-label">正午太阳高度</span>
        <span class="readout-value">{{ noonAltitudeDeg(latitude, declination).toFixed(0) }}°</span>
      </div>
      <div class="readout-item">
        <span class="readout-label">正午太阳方位</span>
        <span class="readout-value">{{ noonSkyText }}</span>
      </div>
      <div class="readout-item">
        <span class="readout-label">昼长</span>
        <span class="readout-value">{{ length.hours.toFixed(1) }} 小时</span>
      </div>
      <div class="readout-item">
        <span class="readout-label">直射点纬度</span>
        <span class="readout-value">{{ Math.abs(declination).toFixed(1) }}°{{ declination >= 0 ? 'N' : 'S' }}</span>
      </div>
    </div>
    <div class="time-row">
      <a-button
        :type="isPlaying ? 'primary' : 'default'"
        shape="circle"
        size="small"
        :aria-label="isPlaying ? '暂停视运动演示' : '播放视运动演示'"
        @click="isPlaying = !isPlaying"
      >
        <PauseOutlined v-if="isPlaying" />
        <CaretRightOutlined v-else />
      </a-button>
      <a-slider
        :value="localHour"
        :min="0"
        :max="24"
        :step="0.25"
        :marks="{ 0: '0时', 6: '6时', 12: '12时', 18: '18时', 24: '24时' }"
        class="time-slider"
        aria-label="地方时"
        @change="(value: number) => (localHour = value)"
      />
      <span class="row-value">地方时 {{ formatClock(localHour) }}</span>
    </div>
    <div class="panel-note">轨迹形状由纬度与日期决定；调整日期会同步球面晨昏线模拟。</div>
  </div>
</template>

<style scoped>
.solar-path-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 340px;
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
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.panel-subtitle {
  margin-left: auto;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.latitude-row,
.time-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-label {
  flex: none;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.row-value {
  flex: none;
  min-width: 78px;
  text-align: right;
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  line-height: 20px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.latitude-slider {
  flex: 1;
  margin: 0 0 4px;
}

.time-slider {
  flex: 1;
  margin: 0 0 4px;
}

.sky-dome {
  width: 100%;
  height: auto;
}

.direction-label {
  fill: rgba(0, 0, 0, 0.65);
  font-size: 13px;
  font-weight: 600;
  text-anchor: middle;
}

.zenith-label {
  fill: rgba(0, 0, 0, 0.45);
  font-size: 10px;
}

.marker-label {
  fill: rgba(0, 0, 0, 0.65);
  font-size: 11px;
}

.hint-label {
  fill: rgba(0, 0, 0, 0.45);
  font-size: 10px;
  text-anchor: middle;
}

.state-text {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.readout-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}

.readout-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.readout-label {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 18px;
}

.readout-value {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  line-height: 20px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.panel-note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}
</style>
