<script setup lang="ts">
import { computed } from 'vue'
import { DeleteOutlined } from '@ant-design/icons-vue'
import type { DrawnShape } from '@renderer/stores/drawing'
import { useFlightStopsStore } from '@renderer/stores/flightStops'

const flightStopsStore = useFlightStopsStore()

const props = defineProps<{
  shape: DrawnShape
  fonts: string[]
}>()

const emit = defineEmits<{
  change: [value: Partial<Pick<DrawnShape, 'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'>>]
  remove: []
}>()

const fontOptions = computed(() => props.fonts.map((font) => ({ label: font, value: font })))

function updateColor(event: Event, key: 'color' | 'textColor'): void {
  emit('change', { [key]: (event.target as HTMLInputElement).value })
}

function updateNumber(value: number | null, key: 'fontSize' | 'lineWidth'): void {
  if (value !== null) emit('change', { [key]: value })
}

function updateAnnotation(event: Event): void {
  emit('change', { annotation: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <div class="drawing-edit-toolbar" :class="{ stacked: flightStopsStore.visible }" role="toolbar" aria-label="绘图样式">
    <a-input
      v-if="shape.kind !== 'text'"
      :value="shape.annotation"
      class="annotation-input"
      :maxlength="200"
      placeholder="标注名称"
      aria-label="标注名称"
      @input="updateAnnotation"
    />
    <label class="style-control">
      <span>{{ shape.kind === 'text' ? '边框色' : '颜色' }}</span>
      <input :value="shape.color" type="color" aria-label="绘图颜色" class="color-input" @input="updateColor($event, 'color')" />
    </label>
    <label v-if="shape.kind === 'polyline' || shape.kind === 'polygon' || shape.kind === 'arrow'" class="style-control">
      <span>线宽</span>
      <a-input-number :value="shape.lineWidth" :min="1" :max="12" :step="1" aria-label="线宽" @change="updateNumber($event, 'lineWidth')" />
    </label>
    <template v-if="shape.kind === 'text'">
      <label class="style-control">
        <span>文字色</span>
        <input :value="shape.textColor" type="color" aria-label="文字颜色" class="color-input" @input="updateColor($event, 'textColor')" />
      </label>
      <label class="style-control font-control">
        <span>字体</span>
        <a-select
          :value="shape.fontFamily"
          :options="fontOptions"
          show-search
          option-filter-prop="label"
          aria-label="系统字体"
          @change="emit('change', { fontFamily: $event })"
        />
      </label>
      <label class="style-control">
        <span>字号</span>
        <a-input-number :value="shape.fontSize" :min="8" :max="72" :step="1" aria-label="字号" @change="updateNumber($event, 'fontSize')" />
      </label>
      <label class="style-control frame-control">
        <span>边框</span>
        <a-switch :checked="shape.textFrame" aria-label="显示边框" @change="emit('change', { textFrame: $event })" />
      </label>
    </template>
    <a-tooltip title="删除标注">
      <a-button type="text" danger aria-label="删除标注" @click="emit('remove')"><DeleteOutlined /></a-button>
    </a-tooltip>
  </div>
</template>

<style scoped>
.drawing-edit-toolbar {
  position: absolute;
  bottom: 84px;
  left: 50%;
  z-index: 13;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 24px);
  min-height: 52px;
  padding: 8px 12px;
  overflow-x: auto;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  transform: translateX(-50%);
}

.drawing-edit-toolbar.stacked {
  bottom: 136px;
}

.style-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  white-space: nowrap;
}

.color-input {
  width: 34px;
  height: 32px;
  padding: 2px;
  border: 1px solid rgba(5, 5, 5, 0.15);
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
}

.annotation-input {
  width: 160px;
  flex: 0 0 160px;
}

.font-control :deep(.ant-select) {
  width: 190px;
}

.frame-control {
  padding-right: 4px;
}

@media (max-width: 720px) {
  .drawing-edit-toolbar {
    right: 8px;
    left: 8px;
    justify-content: flex-start;
    transform: none;
  }

  .annotation-input {
    width: 120px;
    flex-basis: 120px;
  }

  .font-control :deep(.ant-select) {
    width: 140px;
  }
}
</style>
