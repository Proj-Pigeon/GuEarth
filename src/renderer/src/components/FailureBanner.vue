<script setup lang="ts">
import { watch } from 'vue'
import { message } from 'ant-design-vue'
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useFailureStore, type FailureNotice } from '@renderer/stores/failure'

const store = useFailureStore()

watch(
  () => store.degradations.length,
  () => {
    for (const notice of store.takeDegradations()) message.warning(notice.message, 6)
  },
  { immediate: true }
)

function alertType(notice: FailureNotice): 'error' | 'warning' {
  return notice.scope === 'terrain' || notice.scope === 'recording-quality' ? 'warning' : 'error'
}
</script>

<template>
  <div v-if="store.active.length" class="failure-banner">
    <a-alert
      v-for="notice in store.active"
      :key="notice.scope"
      :type="alertType(notice)"
      show-icon
      class="failure-alert"
    >
      <template #message>
        <span class="failure-text" :title="notice.detail || notice.message">{{ notice.message }}</span>
      </template>
      <template #action>
        <a-button
          v-if="notice.retryable"
          type="text"
          size="small"
          :loading="Boolean(store.retrying[notice.scope])"
          @click="store.retry(notice.scope)"
        >
          <ReloadOutlined />重试
        </a-button>
        <a-tooltip title="忽略">
          <a-button type="text" size="small" aria-label="忽略提示" @click="store.clearFailure(notice.scope)">
            <CloseOutlined />
          </a-button>
        </a-tooltip>
      </template>
    </a-alert>
  </div>
</template>

<style scoped>
.failure-banner {
  position: absolute;
  top: 60px;
  left: 50%;
  z-index: 1002;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(560px, calc(100vw - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}

.failure-alert {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  pointer-events: auto;
}

.failure-text {
  display: block;
  overflow: hidden;
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
