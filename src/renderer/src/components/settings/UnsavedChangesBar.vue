<script setup lang="ts">
import { ExclamationCircleFilled } from '@ant-design/icons-vue'

defineProps<{ open: boolean; saving: boolean }>()
const emit = defineEmits<{ save: []; discard: [] }>()
</script>

<template>
  <Transition name="unsaved-bar">
    <div v-if="open" class="unsaved-bar" role="region" aria-label="未保存的改动" aria-live="polite">
      <ExclamationCircleFilled class="unsaved-bar-icon" aria-hidden="true" />
      <span class="unsaved-bar-text">您似乎有新的改动！</span>
      <div class="unsaved-bar-actions">
        <a-button :disabled="saving" @click="emit('discard')">舍弃</a-button>
        <a-button type="primary" :loading="saving" @click="emit('save')">保存</a-button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.unsaved-bar {
  position: absolute;
  right: 0;
  bottom: 16px;
  left: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  width: max-content;
  max-width: calc(100% - 32px);
  margin: 0 auto;
  padding: 8px 8px 8px 16px;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05);
}

.unsaved-bar-icon {
  flex-shrink: 0;
  color: #faad14;
  font-size: 16px;
}

.unsaved-bar-text {
  min-width: 0;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
}

.unsaved-bar-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.unsaved-bar-enter-active,
.unsaved-bar-leave-active {
  transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
}

.unsaved-bar-enter-from,
.unsaved-bar-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@media (prefers-reduced-motion: reduce) {
  .unsaved-bar-enter-active,
  .unsaved-bar-leave-active {
    transition-duration: 0.01s;
  }
}
</style>
