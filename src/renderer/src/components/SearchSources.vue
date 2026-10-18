<script setup lang="ts">
import { computed, ref } from 'vue'
import { DownOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import type { AiSearchReference } from '../../../preload'

const props = defineProps<{ references: AiSearchReference[]; searching?: boolean }>()
const expanded = ref(false)

const visibleCount = 3
const visible = computed(() => expanded.value ? props.references : props.references.slice(0, visibleCount))
const hiddenCount = computed(() => Math.max(0, props.references.length - visibleCount))

function domainOf(reference: AiSearchReference): string {
  if (reference.website) return reference.website
  try {
    return new URL(reference.url).hostname
  } catch {
    return reference.url
  }
}

const allowedSchemes = new Set(['http:', 'https:'])

function safeHref(reference: AiSearchReference): string | undefined {
  try {
    const parsed = new URL(reference.url)
    return allowedSchemes.has(parsed.protocol) ? parsed.href : undefined
  } catch {
    return undefined
  }
}
</script>

<template>
  <div class="search-sources">
    <div class="search-status" role="status" aria-live="polite">
      <template v-if="searching">
        <LoadingOutlined spin class="search-status-loading" />
        <span class="search-status-shimmer">正在搜索</span>
      </template>
      <span v-else>已阅读 {{ references.length }} 个来源</span>
    </div>
    <div class="search-list">
      <template v-for="reference in visible" :key="reference.url">
        <a
          v-if="safeHref(reference)"
          class="search-row"
          :href="safeHref(reference)"
          target="_blank"
          rel="noopener noreferrer"
          :title="reference.content || reference.title"
        >
          <span class="search-favicon" aria-hidden="true">{{ domainOf(reference).charAt(0).toUpperCase() }}</span>
          <span class="search-row-title">{{ reference.title }}</span>
          <span class="search-row-domain">{{ domainOf(reference) }}</span>
        </a>
        <div v-else class="search-row" :title="reference.content || reference.title">
          <span class="search-favicon" aria-hidden="true">{{ domainOf(reference).charAt(0).toUpperCase() }}</span>
          <span class="search-row-title">{{ reference.title }}</span>
          <span class="search-row-domain">{{ domainOf(reference) }}</span>
        </div>
      </template>
    </div>
    <button v-if="hiddenCount > 0" type="button" class="search-more" :aria-expanded="expanded" @click="expanded = !expanded">
      <DownOutlined :class="{ 'search-more-open': expanded }" />
      {{ expanded ? '收起来源' : `展开其余 ${hiddenCount} 个来源` }}
    </button>
  </div>
</template>

<style scoped>
.search-sources{display:flex;flex-direction:column;gap:8px;min-width:0;max-width:100%}
.search-status{display:flex;align-items:center;gap:6px;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.search-status-loading{color:#1677ff}
.search-status-shimmer{background:linear-gradient(90deg,rgba(0,0,0,.25) 25%,rgba(0,0,0,.45) 47%,rgba(0,0,0,.88) 50%,rgba(0,0,0,.45) 53%,rgba(0,0,0,.25) 75%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:search-shimmer 3s linear infinite}
@keyframes search-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.search-list{display:flex;flex-direction:column;gap:2px;min-width:0}
.search-row{display:flex;align-items:center;gap:10px;min-width:0;padding:6px 10px;border-radius:8px;color:inherit;text-decoration:none;transition:background .3s ease}
.search-row:hover{background:rgba(0,0,0,.03)}
.search-row:focus-visible{outline:2px solid #1677ff;outline-offset:-2px}
.search-favicon{flex-shrink:0;display:grid;place-items:center;width:16px;height:16px;border-radius:4px;background:rgba(0,0,0,.06);color:rgba(0,0,0,.45);font-size:9px;font-weight:500;line-height:1}
.search-row-title{flex:1;min-width:0;overflow:hidden;color:rgba(0,0,0,.88);font-size:13.5px;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.search-row-domain{flex-shrink:0;max-width:50%;overflow:hidden;color:rgba(0,0,0,.45);font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:11px;line-height:20px;letter-spacing:-.01em;text-overflow:ellipsis;white-space:nowrap}
.search-more{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;padding:0;border:0;background:transparent;color:rgba(0,0,0,.45);font:inherit;font-size:12px;line-height:20px;cursor:pointer}
.search-more:hover{color:#1677ff}
.search-more:focus-visible{outline:2px solid #1677ff;outline-offset:2px;border-radius:4px}
.search-more :deep(.anticon){font-size:10px;transition:transform .2s ease}
.search-more :deep(.search-more-open){transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){.search-status-shimmer{animation:none;background:none;-webkit-background-clip:border-box;background-clip:border-box;color:rgba(0,0,0,.45)}.search-row{transition:none}.search-more :deep(.anticon){transition:none}}
</style>
