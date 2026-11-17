<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { CloseCircleFilled, CopyOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { crashDialogState, closeCrashDialog } from '@renderer/lib/crashReporter'
import { logger } from '../../../common/logger'

const copying = ref(false)

async function copyLogs(): Promise<void> {
  copying.value = true
  try {
    await window.guEarth.logs.copy(logger.dump())
    message.success('诊断日志已复制到剪贴板')
  } catch (error) {
    logger.warn('diagnostics', '复制诊断日志失败', error)
    message.error('复制失败，请重试')
  } finally {
    copying.value = false
  }
}

function reloadApp(): void {
  window.location.reload()
}
</script>

<template>
  <a-modal
    :open="crashDialogState.open"
    :mask-closable="false"
    :width="440"
    @cancel="closeCrashDialog"
  >
    <template #title>
      <span class="crash-title">
        <CloseCircleFilled class="crash-icon" aria-hidden="true" />
        出现错误
      </span>
    </template>
    <p class="crash-message">{{ crashDialogState.message }}</p>
    <p class="crash-meta">可复制日志反馈给开发者排查问题。</p>
    <template #footer>
      <a-button @click="closeCrashDialog">关闭</a-button>
      <a-button :loading="copying" @click="copyLogs">
        <template #icon><CopyOutlined /></template>
        复制日志
      </a-button>
      <a-button type="primary" @click="reloadApp">
        <template #icon><ReloadOutlined /></template>
        重新加载
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.crash-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.88);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.crash-icon {
  color: #ff4d4f;
  font-size: 18px;
}

.crash-message {
  margin: 0;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
  word-break: break-all;
}

.crash-meta {
  margin: 8px 0 0;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}
</style>
