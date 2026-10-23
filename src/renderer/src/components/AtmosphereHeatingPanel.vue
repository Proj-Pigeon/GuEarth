<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

type Period = 'day' | 'night'
type CloudCover = 'clear' | 'cloudy'

interface RadiatorArrow {
  d: string
  color: string
  width?: number
  dashed?: boolean
  marker: string
  label?: string
  labelAt?: [number, number]
  labelAnchor?: 'start' | 'middle' | 'end'
}

const emit = defineEmits<{ close: [] }>()

const period = ref<Period>('day')
const cloud = ref<CloudCover>('clear')

const SOLAR = dc.energy
const GROUND_RADIATION = dc.heatRadiation
const COUNTER_RADIATION = dc.counterRadiation

const periodOptions = [
  { value: 'day', label: '白天' },
  { value: 'night', label: '夜晚' }
] as const

const cloudOptions = [
  { value: 'clear', label: '晴朗' },
  { value: 'cloudy', label: '多云' }
] as const

const legendItems = [
  { color: SOLAR, name: '太阳短波辐射' },
  { color: GROUND_RADIATION, name: '地面长波辐射' },
  { color: COUNTER_RADIATION, name: '大气逆辐射' }
]

const stateLabel = computed(() =>
  `${period.value === 'day' ? '白天' : '夜晚'}·${cloud.value === 'clear' ? '晴朗' : '多云'}`
)

const groundText = computed(() =>
  period.value === 'day' ? '地面（吸收太阳辐射而增温）' : '地面（向外辐射散热降温）'
)

const arrows = computed<RadiatorArrow[]>(() => {
  const isDay = period.value === 'day'
  const isCloudy = cloud.value === 'cloudy'
  const list: RadiatorArrow[] = []
  if (isDay) {
    if (isCloudy) {
      list.push(
        { d: 'M 56 44 L 200 52', color: SOLAR, width: 2.4, marker: 'solar', label: '太阳辐射', labelAt: [116, 30] },
        { d: 'M 214 48 Q 258 30 280 20', color: SOLAR, width: 1.6, dashed: true, marker: 'solar', label: '云层反射', labelAt: [254, 14] },
        { d: 'M 58 52 L 84 166', color: SOLAR, width: 1.4, dashed: true, marker: 'solar', label: '云隙透过', labelAt: [72, 140], labelAnchor: 'end' }
      )
    } else {
      list.push(
        { d: 'M 56 44 L 160 166', color: SOLAR, width: 2.6, marker: 'solar', label: '太阳辐射', labelAt: [118, 92], labelAnchor: 'start' },
        { d: 'M 76 68 L 116 52', color: SOLAR, width: 1.4, dashed: true, marker: 'solar', label: '大气削弱', labelAt: [122, 52], labelAnchor: 'start' }
      )
    }
  }
  if (isCloudy) {
    list.push(
      { d: 'M 170 166 L 170 72', color: GROUND_RADIATION, width: 2.2, marker: 'ground', label: '地面辐射', labelAt: [162, 124], labelAnchor: 'end' },
      { d: 'M 260 166 L 260 72', color: GROUND_RADIATION, width: 1.6, marker: 'ground' }
    )
  } else {
    list.push(
      { d: 'M 130 166 L 130 92', color: GROUND_RADIATION, width: 2.2, marker: 'ground', label: '地面辐射', labelAt: [122, 140], labelAnchor: 'end' },
      { d: 'M 300 166 L 300 34', color: GROUND_RADIATION, width: 1.4, dashed: true, marker: 'ground', label: '逸散到宇宙', labelAt: [294, 26], labelAnchor: 'end' }
    )
  }
  if (period.value === 'night' && isCloudy) {
    list.push(
      { d: 'M 210 92 L 203 166', color: COUNTER_RADIATION, width: 3.4, marker: 'counter', label: '大气逆辐射强', labelAt: [206, 86] }
    )
  } else if (period.value === 'night' && !isCloudy) {
    list.push(
      { d: 'M 166 100 L 158 166', color: COUNTER_RADIATION, width: 1.4, marker: 'counter', label: '大气逆辐射弱', labelAt: [172, 128], labelAnchor: 'start' }
    )
  } else if (isCloudy) {
    list.push(
      { d: 'M 210 92 L 203 166', color: COUNTER_RADIATION, width: 1.8, marker: 'counter', label: '大气逆辐射', labelAt: [206, 86] }
    )
  } else {
    list.push(
      { d: 'M 172 96 L 162 166', color: COUNTER_RADIATION, width: 1.8, marker: 'counter', label: '大气逆辐射', labelAt: [178, 128], labelAnchor: 'start' }
    )
  }
  return list
})

const stateConclusion = computed(() => {
  if (period.value === 'day') {
    return cloud.value === 'clear'
      ? '晴天大气对太阳辐射削弱少，到达地面的太阳辐射多，气温升高快。'
      : '多云时云层反射太阳辐射，削弱作用强，到达地面的太阳辐射少，气温不会太高。'
  }
  return cloud.value === 'clear'
    ? '晴朗夜晚云少，大气吸收地面辐射少、逆辐射弱，地面散热快、气温低——深秋寒霜多发生在晴朗夜间。'
    : '多云夜晚云吸收地面辐射多、逆辐射强，保温作用强，气温不会太低。'
})

const keyPoints = [
  '太阳辐射是地球上最主要的能量来源',
  '大气对太阳辐射的削弱作用：吸收、反射、散射',
  '地面吸收太阳辐射增温后产生地面辐射，加热近地面大气——地面是近地面大气主要的直接热源',
  '大气逆辐射把热量还给地面，对地面起保温作用（温室效应原理类似）'
]
</script>

<template>
  <div class="heating-panel" role="group" aria-label="大气受热过程演示">
    <div class="panel-header">
      <span class="panel-title">大气受热过程</span>
      <a-button type="text" size="small" aria-label="关闭大气受热过程" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <div class="control-row">
      <div class="control-group">
        <span class="control-label">昼夜</span>
        <a-segmented v-model:value="period" size="small" :options="[...periodOptions]" aria-label="昼夜" />
      </div>
      <div class="control-group">
        <span class="control-label">云量</span>
        <a-segmented v-model:value="cloud" size="small" :options="[...cloudOptions]" aria-label="云量" />
      </div>
    </div>
    <svg viewBox="0 0 360 200" class="heating-svg" role="img" aria-label="大气受热过程示意图：太阳辐射、地面辐射与大气逆辐射">
      <defs>
        <linearGradient id="ah-sky-day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d6ecff" />
          <stop offset="100%" stop-color="#f4faff" />
        </linearGradient>
        <linearGradient id="ah-sky-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d2b4d" />
          <stop offset="100%" stop-color="#3a4a6b" />
        </linearGradient>
        <linearGradient id="ah-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8c9a0" />
          <stop offset="100%" stop-color="#c9a06c" />
        </linearGradient>
        <radialGradient id="ah-sun" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#ffd666" />
          <stop offset="100%" :stop-color="dc.sun" />
        </radialGradient>
        <marker id="ah-solar" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="SOLAR" />
        </marker>
        <marker id="ah-ground-m" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="GROUND_RADIATION" />
        </marker>
        <marker id="ah-counter" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="COUNTER_RADIATION" />
        </marker>
      </defs>
      <rect x="0" y="0" width="360" height="170" :fill="period === 'day' ? 'url(#ah-sky-day)' : 'url(#ah-sky-night)'" class="sky-fade" />
      <text x="10" y="16" class="space-label" :fill="period === 'day' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)'">宇宙空间</text>
      <g v-if="period === 'night'" fill="rgba(255,255,255,0.75)">
        <circle cx="120" cy="26" r="1.2" />
        <circle cx="186" cy="14" r="1" />
        <circle cx="262" cy="30" r="1.2" />
        <circle cx="320" cy="18" r="1" />
      </g>
      <g v-if="period === 'day'">
        <circle cx="44" cy="36" r="14" fill="url(#ah-sun)" opacity="0.35" />
        <circle cx="44" cy="36" r="9" fill="url(#ah-sun)" />
      </g>
      <g v-else>
        <circle cx="44" cy="36" r="9" fill="#e8e8e8" />
        <circle cx="48" cy="33" r="8" fill="#2c3a5c" />
      </g>
      <g v-if="cloud === 'cloudy'" class="cloud-group">
        <ellipse cx="218" cy="54" rx="34" ry="12" :fill="period === 'day' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.16)'" />
        <ellipse cx="195" cy="60" rx="20" ry="9" :fill="period === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'" />
        <ellipse cx="245" cy="60" rx="22" ry="9" :fill="period === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'" />
        <text x="218" y="34" text-anchor="middle" class="space-label" :fill="period === 'day' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'">云层</text>
      </g>
      <path
        v-for="(arrow, index) in arrows"
        :key="`r-${index}`"
        :d="arrow.d"
        fill="none"
        :stroke="arrow.color"
        :stroke-width="arrow.width"
        :stroke-dasharray="arrow.dashed ? '5 4' : undefined"
        :marker-end="`url(#ah-${arrow.marker === 'ground' ? 'ground-m' : arrow.marker})`"
        stroke-linecap="round"
      />
      <text
        v-for="(arrow, index) in arrows.filter((item) => item.label && item.labelAt)"
        :key="`t-${index}`"
        :x="arrow.labelAt![0]"
        :y="arrow.labelAt![1]"
        :text-anchor="arrow.labelAnchor ?? 'middle'"
        class="arrow-label"
        :class="{ 'arrow-label-dark': period === 'night' }"
        :fill="arrow.color"
        :font-family="diagramFont"
      >{{ arrow.label }}</text>
      <rect x="0" y="170" width="360" height="30" fill="url(#ah-ground)" />
      <line x1="0" y1="170" x2="360" y2="170" stroke="rgba(0, 0, 0, 0.35)" stroke-width="1.5" />
      <text x="180" y="188" text-anchor="middle" class="ground-label">{{ groundText }}</text>
    </svg>
    <div class="legend-row">
      <span v-for="item in legendItems" :key="item.name" class="legend-item">
        <span class="legend-swatch" :style="{ background: item.color }"></span>
        {{ item.name }}
      </span>
    </div>
    <div class="conclusion-row">
      <a-tag class="state-tag">{{ stateLabel }}</a-tag>
      <span class="conclusion-text">{{ stateConclusion }}</span>
    </div>
    <div class="key-points">
      <div class="section-title">要点回顾</div>
      <ul class="point-list">
        <li v-for="point in keyPoints" :key="point" class="point-item">{{ point }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.heating-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.control-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.heating-svg {
  width: 100%;
  height: auto;
  display: block;
}

.space-label {
  fill: rgba(0, 0, 0, 0.45);
  font-size: 10px;
}

.sky-fade {
  transition: fill 0.4s ease;
}

.cloud-group {
  transition: opacity 0.3s ease;
}

.ground-label {
  fill: rgba(0, 0, 0, 0.65);
  font-size: 11px;
}

.arrow-label {
  font-size: 11px;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.arrow-label-dark {
  stroke: rgba(29, 43, 77, 0.9);
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.legend-swatch {
  width: 12px;
  height: 4px;
  border-radius: 9999px;
}

.conclusion-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.state-tag {
  flex: none;
  margin-inline-end: 0;
  font-size: 12px;
  line-height: 20px;
}

.conclusion-text {
  flex: 1;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.key-points {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.point-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.point-item {
  position: relative;
  padding-left: 12px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.point-item::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 8px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
}
</style>
