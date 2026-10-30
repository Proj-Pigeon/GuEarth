<script setup lang="ts">
import { computed } from 'vue'
import { CheckOutlined, CloseOutlined, UndoOutlined } from '@ant-design/icons-vue'
import type { DrawTool } from '@renderer/stores/drawing'

const props = defineProps<{
  activeTool: DrawTool | null
  draftCount: number
}>()

defineEmits<{
  cancel: []
  undo: []
  finish: []
}>()

const canUndo = computed(() => props.activeTool === 'line' || props.activeTool === 'polygon' || props.activeTool === 'arrow')
const canFinish = computed(() => props.activeTool === 'line' || props.activeTool === 'polygon')
const minimumPoints = computed(() => (props.activeTool === 'polygon' ? 3 : 2))
const finishDisabled = computed(() => props.draftCount < minimumPoints.value)
const undoDisabled = computed(() => props.draftCount === 0)
</script>

<template>
  <div v-if="activeTool" class="drawing-touch-bar" role="toolbar" aria-label="触摸绘图操作">
    <a-button v-if="canUndo" class="touch-bar-btn" :disabled="undoDisabled" aria-label="撤销上一个点" @click="$emit('undo')">
      <UndoOutlined />撤销
    </a-button>
    <a-button v-if="canFinish" type="primary" class="touch-bar-btn" :disabled="finishDisabled" aria-label="完成绘制" @click="$emit('finish')">
      <CheckOutlined />完成
    </a-button>
    <a-button class="touch-bar-btn" danger aria-label="取消绘制" @click="$emit('cancel')">
      <CloseOutlined />取消
    </a-button>
  </div>
</template>

<style scoped>
.drawing-touch-bar {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  z-index: 10;
}

.touch-bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 44px;
  height: 44px;
  font-size: 14px;
}
</style>
