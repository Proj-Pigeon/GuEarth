<script setup lang="ts">
import { computed } from 'vue'
import { useZonationStore, type ZonationFlightStage } from '@renderer/stores/zonation'
import { cancelTransectFlight } from '@renderer/composables/useTransectFlight'

const store = useZonationStore()

const stageText: Record<ZonationFlightStage, string> = {
  sampling: '正在采样沿线地形，计算安全飞行高度…',
  prewarm: '正在预载沿线影像（画面短暂降暗）',
  flying: '剖面飞行中'
}

const percent = computed(() => {
  const hud = store.flightHud
  if (!hud || hud.total <= 0) return 0
  return Math.min(100, Math.round((hud.completed / hud.total) * 100))
})

const metaText = computed(() => {
  const hud = store.flightHud
  if (!hud) return ''
  if (hud.stage === 'sampling') return '请稍候（最长约半分钟）'
  if (hud.stage === 'flying' && hud.altitudeM !== undefined) return `高度 ${Math.round(hud.altitudeM).toLocaleString()} 米`
  return `${hud.completed} / ${hud.total}`
})
</script>

<template>
  <div v-if="store.flightHud" class="flight-hud" role="status" aria-label="剖面飞行进度">
    <div class="hud-title">剖面飞行</div>
    <div class="hud-stage">{{ stageText[store.flightHud.stage] }}</div>
    <a-progress v-if="store.flightHud.stage !== 'sampling'" :percent="percent" :show-info="false" size="small" status="active" />
    <div class="hud-meta">
      <span class="hud-count">{{ metaText }}</span>
      <a-button size="small" @click="cancelTransectFlight">停止</a-button>
    </div>
  </div>
</template>

<style scoped>
.flight-hud {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 300px;
  padding: 10px 14px 12px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 12;
}

.hud-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.hud-stage {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 18px;
}

.hud-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hud-count {
  margin-right: auto;
  color: #1677ff;
  font-size: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
</style>
