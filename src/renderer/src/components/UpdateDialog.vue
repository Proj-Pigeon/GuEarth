<script setup lang="ts">
import { computed, defineComponent, onErrorCaptured, ref, watch, type PropType, type VNodeChild } from 'vue'
import { useUpdaterStore } from '@renderer/stores/updater'
import { tryRenderMarkdown } from '@renderer/utils/markdown'

const MarkdownNotes = defineComponent({
  name: 'MarkdownNotes',
  props: {
    nodes: {
      type: Array as PropType<VNodeChild[]>,
      required: true
    }
  },
  setup(props) {
    return () => props.nodes
  }
})

const store = useUpdaterStore()
const renderFailed = ref(false)

watch(() => store.notes, () => {
  renderFailed.value = false
})

const hasNotes = computed(() => store.notes.trim().length > 0)
const renderedNotes = computed(() => {
  if (renderFailed.value || !hasNotes.value) return null
  return tryRenderMarkdown(store.notes)
})

onErrorCaptured(() => {
  renderFailed.value = true
  return false
})
</script>

<template>
  <a-modal
    :open="store.promptVisible"
    title="发现可用更新"
    :width="420"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    ok-text="立即更新"
    cancel-text="下次提醒"
    @ok="store.startDownload()"
    @cancel="store.remindLater()"
  >
    <div class="update-line">
      <span class="update-label">当前版本</span>
      <span class="update-version">v{{ store.currentVersion }}</span>
    </div>
    <div class="update-line">
      <span class="update-label">最新版本</span>
      <span class="update-version update-version-new">v{{ store.version }}</span>
    </div>
    <div v-if="renderedNotes" class="update-notes update-notes-markdown" role="region" aria-label="更新日志">
      <MarkdownNotes :nodes="renderedNotes" />
    </div>
    <p v-else-if="hasNotes" class="update-notes update-notes-plain">{{ store.notes }}</p>
  </a-modal>
</template>

<style scoped>
.update-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 0;
}

.update-label {
  width: 60px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 14px;
  line-height: 22px;
}

.update-version {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.88);
}

.update-version-new {
  color: #1677ff;
  font-weight: 600;
}

.update-notes {
  margin: 12px 0 0;
  max-height: 180px;
  overflow: auto;
  overscroll-behavior: contain;
  word-break: break-word;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.update-notes-markdown {
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 6px;
}

.update-notes-markdown > :deep(:first-child) {
  margin-top: 0;
}

.update-notes-markdown > :deep(:last-child) {
  margin-bottom: 0;
}

.update-notes-markdown :deep(p) {
  margin: 0 0 6px;
}

.update-notes-markdown :deep(h1),
.update-notes-markdown :deep(h2),
.update-notes-markdown :deep(h3),
.update-notes-markdown :deep(h4),
.update-notes-markdown :deep(h5),
.update-notes-markdown :deep(h6) {
  margin: 10px 0 4px;
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
  line-height: 20px;
}

.update-notes-markdown :deep(h1) {
  font-size: 14px;
  line-height: 22px;
}

.update-notes-markdown :deep(h2) {
  font-size: 13px;
  line-height: 20px;
}

.update-notes-markdown :deep(h3),
.update-notes-markdown :deep(h4),
.update-notes-markdown :deep(h5),
.update-notes-markdown :deep(h6) {
  font-size: 12px;
}

.update-notes-markdown :deep(strong) {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
}

.update-notes-markdown :deep(ul),
.update-notes-markdown :deep(ol) {
  margin: 0 0 6px;
  padding-left: 18px;
}

.update-notes-markdown :deep(li) {
  margin: 2px 0;
}

.update-notes-markdown :deep(li > ul),
.update-notes-markdown :deep(li > ol) {
  margin-bottom: 0;
}

.update-notes-markdown :deep(li > p) {
  margin-bottom: 2px;
}

.update-notes-markdown :deep(li > p:last-child) {
  margin-bottom: 0;
}

.update-notes-markdown :deep(blockquote) {
  margin: 0 0 6px;
  padding: 2px 10px;
  border-left: 3px solid rgba(5, 5, 5, 0.12);
  color: rgba(0, 0, 0, 0.45);
}

.update-notes-markdown :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.update-notes-markdown :deep(code) {
  padding: 1px 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  color: rgba(0, 0, 0, 0.88);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 18px;
}

.update-notes-markdown :deep(pre) {
  margin: 0 0 6px;
  padding: 8px 10px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow-x: auto;
}

.update-notes-markdown :deep(pre code) {
  padding: 0;
  background: none;
  border-radius: 0;
}

.update-notes-markdown :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  margin: 0 0 6px;
  overflow-x: auto;
  border-collapse: collapse;
}

.update-notes-markdown :deep(th),
.update-notes-markdown :deep(td) {
  padding: 3px 8px;
  border: 1px solid rgba(5, 5, 5, 0.06);
}

.update-notes-markdown :deep(th) {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.02);
}

.update-notes-markdown :deep(a) {
  color: #1677ff;
}

.update-notes-markdown :deep(hr) {
  margin: 8px 0;
  border: 0;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
}

.update-notes-markdown :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

.update-notes-plain {
  padding: 8px 12px;
  white-space: pre-wrap;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
}
</style>
