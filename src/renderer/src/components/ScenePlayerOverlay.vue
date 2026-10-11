<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Button } from 'ant-design-vue'
import { StepForwardOutlined } from '@ant-design/icons-vue'
import { useScenesStore, type RecordingPrewarmQuality } from '@renderer/stores/scenes'
import type { PlayerState } from '@renderer/composables/useScenePlayer'

const props = defineProps<{ player: PlayerState }>()
const emit = defineEmits<{ next: []; stop: [] }>()

const scenesStore = useScenesStore()

const recordingActive = computed(() => scenesStore.recording.state === 'recording' || scenesStore.recording.state === 'preparing')
const isRecordingPreparing = computed(() => scenesStore.recording.state === 'preparing')
const prewarmNotice = computed(() => scenesStore.recording.prewarmMessage || '正在预加载录制画面…')
const prewarmProgress = computed(() => {
  const total = scenesStore.recording.prewarmTotal || props.player.prewarmTotal
  const step = scenesStore.recording.prewarmStep || props.player.prewarmIndex
  return total > 0 ? `${Math.min(step, total)} / ${total}` : ''
})
const prewarmQualityOptions = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'high' },
  { label: '极清', value: 'ultra' }
]
const recordNotice = computed(() => {
  const state = scenesStore.recording.state
  if (state === 'preparing') return '正在准备录制…'
  if (state === 'recording') return `录制中 ${scenesStore.recording.currentStep}/${scenesStore.recording.totalSteps}`
  if (state === 'saving') return '正在保存视频…'
  if (state === 'error') return `录制失败：${scenesStore.recording.error}`
  return ''
})

function setPrewarmQuality(value: string | number): void {
  scenesStore.setRecording({ prewarmQuality: value as RecordingPrewarmQuality })
}

function skipPrewarm(): void {
  scenesStore.skipRecordingPrewarm()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.player.active) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('stop')
    return
  }
  if (event.code === 'Space' || event.key === 'ArrowRight') {
    event.preventDefault()
    emit('next')
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div v-if="player.active" class="scene-overlay">
    <div v-if="player.prewarming" class="prewarm-mask">
      <a-spin />
      <div class="prewarm-text">{{ isRecordingPreparing ? prewarmNotice : '正在准备课程资源…' }}</div>
      <div class="prewarm-progress">{{ isRecordingPreparing ? prewarmProgress : `${player.prewarmIndex} / ${player.prewarmTotal}` }}</div>
      <div v-if="isRecordingPreparing" class="prewarm-quality">
        <div class="prewarm-quality-label">底图精细度</div>
        <a-segmented :value="scenesStore.recording.prewarmQuality" :options="prewarmQualityOptions" size="small" @change="setPrewarmQuality" />
      </div>
      <div v-if="isRecordingPreparing && scenesStore.recording.prewarmTimedOut" class="prewarm-warning">网络较慢，部分地图细节可能在录制中继续补齐。</div>
      <Button v-if="isRecordingPreparing" size="small" @click.stop="skipPrewarm">跳过预加载</Button>
    </div>
    <template v-else>
      <div class="stage-hit" aria-label="下一幕" @click="emit('next')"></div>
      <div class="scene-top">
        <span v-if="recordingActive" class="rec-dot" aria-hidden="true"></span>
        <span class="scene-title">{{ player.title || '教学演示' }}</span>
        <span class="scene-counter">{{ player.currentIndex + 1 }} / {{ player.total }}</span>
        <span v-if="player.mode === 'manual'" class="scene-mode">手动模式</span>
      </div>
      <Transition name="caption">
        <div v-if="player.narration || player.sceneName" class="scene-caption">
          <div v-if="player.sceneName" class="caption-name">{{ player.sceneName }}</div>
          <div v-if="player.narration" class="caption-text">{{ player.narration }}</div>
        </div>
      </Transition>
      <div v-if="recordNotice" class="record-notice">{{ recordNotice }}</div>
      <div class="scene-controls">
        <Button @click.stop="emit('next')">
          <template #icon><StepForwardOutlined /></template>
          下一幕
        </Button>
        <Button danger @click.stop="emit('stop')">退出演示</Button>
      </div>
      <div class="scene-hint">{{ player.mode === 'manual' ? '空格 / 点击画面 · 下一幕　Esc · 退出' : '自动播放中 · 点击提前下一幕　Esc · 退出' }}</div>
    </template>
  </div>
</template>

<style scoped>
.scene-overlay {
  position: absolute;
  inset: 0;
  z-index: 1100;
  pointer-events: none;
}

.prewarm-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.94);
  pointer-events: auto;
}

.prewarm-text {
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
}

.prewarm-progress {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.prewarm-quality {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.prewarm-quality-label {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.prewarm-warning {
  max-width: min(360px, 78vw);
  color: #d46b08;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
}

.stage-hit {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: pointer;
}

.scene-top {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.72);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 20px;
  pointer-events: none;
}

.scene-title {
  font-weight: 600;
}

.scene-counter {
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.75);
}

.scene-mode {
  color: rgba(255, 255, 255, 0.55);
}

.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #ff4d4f;
  animation: rec-pulse 1.2s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.scene-caption {
  position: absolute;
  bottom: 96px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(720px, 82vw);
  padding: 12px 20px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
  color: #ffffff;
  pointer-events: none;
  text-align: center;
}

.caption-name {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  margin-bottom: 4px;
}

.caption-text {
  font-size: 18px;
  line-height: 28px;
}

.record-notice {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.72);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 20px;
  pointer-events: none;
}

.scene-controls {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}

.scene-hint {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  pointer-events: none;
  white-space: nowrap;
}

.caption-enter-active,
.caption-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.caption-enter-from,
.caption-leave-to {
  opacity: 0;
}
</style>
