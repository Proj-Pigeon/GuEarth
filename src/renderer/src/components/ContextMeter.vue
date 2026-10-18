<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircleOutlined, CloseCircleOutlined, CompressOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import type { AiContextStats } from '../../../preload'
import type { ContextCompressionStatus } from '@renderer/stores/ai'

const props = defineProps<{
  stats: AiContextStats
  status: ContextCompressionStatus
  notice: string
  disabled?: boolean
}>()

const emit = defineEmits<{ compress: [] }>()
const open = ref(false)

const CATEGORY_COLORS: Record<string, string> = {
  system: '#eb2f96',
  user: '#1677ff',
  assistant: '#fa8c16',
  tool: '#52c41a'
}
const FREE_COLOR = '#f0f0f0'

const percent = computed(() => Math.min(100, Math.max(0, Math.round(props.stats.usagePercent))))
const tone = computed(() => percent.value >= 80 ? 'error' : percent.value > 70 ? 'warning' : 'normal')
const strokeColor = computed(() => tone.value === 'error' ? '#ff4d4f' : tone.value === 'warning' ? '#faad14' : '#1677ff')
const statusText = computed(() => {
  if (props.status === 'compressing') return '正在压缩上下文...'
  if (props.status === 'error') return '无法压缩上下文'
  return props.notice || `${percent.value}%`
})

interface Segment {
  key: string
  label: string
  tokens: number
  color: string
}

const segments = computed<Segment[]>(() => {
  const used = props.stats.categories.filter((category) => category.tokens > 0)
  const free = Math.max(0, props.stats.contextWindow - props.stats.usedTokens)
  return [
    ...used.map((category) => ({ key: category.key, label: category.label, tokens: category.tokens, color: CATEGORY_COLORS[category.key] ?? '#8c8c8c' })),
    ...(free > 0 ? [{ key: 'free', label: '剩余空间', tokens: free, color: FREE_COLOR }] : [])
  ]
})

const windowShare = computed(() => new Map(
  segments.value.map((segment) => [segment.key, segment.tokens / props.stats.contextWindow * 100])
))

function formatTokens(tokens: number): string {
  const trim = (value: string): string => value.replace(/\.0$/, '')
  if (tokens >= 1_000_000) return `${trim((tokens / 1_000_000).toFixed(1))}M`
  if (tokens <= 0) return '0'
  if (tokens < 1_000) return `${Math.max(0.1, tokens / 1_000).toFixed(1)}k`
  return `${trim((tokens / 1_000).toFixed(1))}k`
}

function formatShare(share: number | undefined): string {
  return `${(share ?? 0).toFixed(1)}%`
}

function compress(): void {
  emit('compress')
}
</script>

<template>
  <a-popover v-model:open="open" trigger="click" placement="topLeft" overlay-class-name="context-popover">
    <template #content>
      <div class="context-card">
        <div class="context-card-head">
          <span class="context-card-title">上下文窗口</span>
          <span class="context-card-total">{{ formatTokens(stats.usedTokens) }} / {{ formatTokens(stats.contextWindow) }} ({{ percent }}%)</span>
        </div>
        <div class="context-bar">
          <span
            v-for="segment in segments"
            :key="segment.key"
            class="context-bar-segment"
            :style="{ flexGrow: segment.tokens, background: segment.color }"
          />
        </div>
        <div class="context-legend">
          <div v-for="segment in segments" :key="segment.key" class="context-legend-row">
            <span class="context-legend-chip" :style="{ background: segment.color }" />
            <span class="context-legend-label">{{ segment.label }}</span>
            <span class="context-legend-tokens">{{ formatTokens(segment.tokens) }}</span>
            <span class="context-legend-share">{{ formatShare(windowShare.get(segment.key)) }}</span>
          </div>
        </div>
        <a-button type="primary" size="small" block :loading="status === 'compressing'" :disabled="disabled || stats.usedTokens === 0" @click="compress">
          <CompressOutlined v-if="status !== 'compressing'" />压缩
        </a-button>
      </div>
    </template>
    <button type="button" class="context-meter" :class="`context-meter-${tone}`" :aria-expanded="open" aria-label="查看上下文窗口">
      <span class="context-ring">
        <a-progress type="circle" :percent="percent" :size="24" :stroke-width="14" :stroke-color="strokeColor" :show-info="false" />
      </span>
      <span class="context-status" :class="{ 'shimmer-text': status === 'compressing' }">
        <LoadingOutlined v-if="status === 'compressing'" spin />
        <CloseCircleOutlined v-else-if="status === 'error'" />
        <CheckCircleOutlined v-else-if="notice" />
        <span>{{ statusText }}</span>
      </span>
    </button>
  </a-popover>
</template>

<style scoped>
.context-meter{display:flex;align-items:center;gap:8px;width:100%;min-width:0;min-height:32px;padding:2px 4px;border:0;background:transparent;color:rgba(0,0,0,.65);font:inherit;text-align:left;cursor:pointer}
.context-meter:focus-visible{outline:2px solid #1677ff;outline-offset:2px}
.context-ring{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;height:24px}
.context-ring :deep(.ant-progress){line-height:0}
.context-ring :deep(.ant-progress-inner){display:block}
.context-status{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;color:rgba(0,0,0,.45);font-size:12px;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.context-card{width:320px;max-width:calc(100vw - 48px)}
.context-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}
.context-card-title{color:rgba(0,0,0,.88);font-size:14px;font-weight:600;line-height:22px}
.context-card-total{color:rgba(0,0,0,.45);font-size:12px;line-height:20px;font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace}
.context-bar{display:flex;gap:2px;height:8px}
.context-bar-segment{flex-basis:0;min-width:3px;border-radius:2px}
.context-bar-segment:first-child{border-top-left-radius:4px;border-bottom-left-radius:4px}
.context-bar-segment:last-child{border-top-right-radius:4px;border-bottom-right-radius:4px}
.context-legend{display:flex;flex-direction:column;gap:2px;margin:12px 0 16px}
.context-legend-row{display:flex;align-items:center;gap:8px;min-height:26px;font-size:13px;line-height:20px}
.context-legend-chip{flex:0 0 10px;width:10px;height:10px;border-radius:3px}
.context-legend-label{min-width:0;overflow:hidden;color:rgba(0,0,0,.78);text-overflow:ellipsis;white-space:nowrap}
.context-legend-tokens,.context-legend-share{margin-left:auto;color:rgba(0,0,0,.45);font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:12px}
.context-legend-tokens{min-width:44px;text-align:right}
.context-legend-share{min-width:44px;text-align:right}
.context-card :deep(.ant-btn){height:32px}
.shimmer-text{background:linear-gradient(90deg,rgba(0,0,0,.25) 25%,rgba(0,0,0,.45) 47%,rgba(0,0,0,.88) 50%,rgba(0,0,0,.45) 53%,rgba(0,0,0,.25) 75%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:context-shimmer 3s linear infinite}
@keyframes context-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.shimmer-text{animation:none;background:none;-webkit-background-clip:border-box;background-clip:border-box;color:rgba(0,0,0,.45)}}
@media (max-width:360px){.context-status{font-size:11px}.context-card{width:calc(100vw - 48px)}}
</style>
