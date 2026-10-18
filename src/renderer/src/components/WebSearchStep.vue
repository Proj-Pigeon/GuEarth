<script setup lang="ts">
import { computed } from 'vue'
import { CloseCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import type { ToolStep } from '@renderer/stores/ai'
import SearchSources from './SearchSources.vue'

const props = defineProps<{ step: ToolStep; busy: boolean }>()
const emit = defineEmits<{ retry: [query: string] }>()
const query = computed(() => typeof props.step.args.query === 'string' ? props.step.args.query : '')
const error = computed(() => {
  try {
    const result = JSON.parse(props.step.result)
    return typeof result.error === 'string' ? result.error : props.step.summary
  } catch {
    return props.step.summary
  }
})
</script>

<template>
  <div class="web-search">
    <span class="web-search-query" :title="query"><SearchOutlined class="web-search-icon" />{{ query }}</span>
    <SearchSources v-if="step.status !== 'error'" :references="step.references ?? []" :searching="step.status === 'running'" />
    <div v-if="step.status === 'error'" class="web-search-error" role="alert">
      <CloseCircleOutlined />
      <span class="web-search-error-text">{{ error || '搜索失败，请稍后重试' }}</span>
      <a-button type="link" size="small" class="web-search-retry" :disabled="busy || !query" @click="emit('retry', query)"><ReloadOutlined />重新搜索</a-button>
    </div>
    <div v-else-if="step.status === 'ok' && !step.references?.length" class="web-search-empty">
      <span>未找到相关网页</span>
      <a-button type="link" size="small" class="web-search-retry" :disabled="busy || !query" @click="emit('retry', query)"><ReloadOutlined />重新搜索</a-button>
    </div>
  </div>
</template>

<style scoped>
.web-search{display:flex;flex-direction:column;gap:8px;min-width:0;padding:2px 0 6px}
.web-search-query{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;max-width:100%;padding:4px 12px;border-radius:999px;background:rgba(0,0,0,.04);color:rgba(0,0,0,.65);font-size:12px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.web-search-icon{flex-shrink:0;color:rgba(0,0,0,.45);font-size:12px}
.web-search-error{display:flex;align-items:center;gap:6px;min-width:0;color:#ff4d4f;font-size:12px;line-height:20px}
.web-search-error-text{min-width:0;overflow-wrap:anywhere}
.web-search-retry{flex-shrink:0;height:24px;padding-inline:4px;font-size:12px}
.web-search-empty{display:flex;align-items:center;gap:8px;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
</style>
