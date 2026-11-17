<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch, type VNodeChild } from 'vue'
import { createStreamingDelayState, renderMarkdown, renderStreamingMarkdown, resetStreamingDelayState, settleStreamingDelayState } from '@renderer/utils/markdown'

const STREAM_RENDER_INTERVAL_MS = 50
const STREAM_IDLE_SETTLE_MS = 260

const props = defineProps<{ text: string; streaming: boolean }>()
const emit = defineEmits<{ rendered: [] }>()
const nodes = shallowRef<VNodeChild[]>([])
const MarkdownContent = () => nodes.value
const delayState = createStreamingDelayState()

let timer: ReturnType<typeof setTimeout> | undefined
let settleTimer: ReturnType<typeof setTimeout> | undefined
let settled = false

function clearTimers(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  if (settleTimer !== undefined) {
    clearTimeout(settleTimer)
    settleTimer = undefined
  }
}

function settle(): void {
  settleTimer = undefined
  if (!props.streaming) return
  settled = true
  settleStreamingDelayState(delayState, props.text)
  nodes.value = renderMarkdown(props.text)
}

function render(): void {
  clearTimers()
  settled = false
  if (!props.streaming) {
    resetStreamingDelayState(delayState)
    nodes.value = renderMarkdown(props.text)
  } else {
    nodes.value = renderStreamingMarkdown(props.text, delayState)
    if (props.text) {
      settleTimer = setTimeout(settle, STREAM_IDLE_SETTLE_MS)
    }
  }
  emit('rendered')
}

watch(() => [props.text, props.streaming] as const, () => {
  if (!props.streaming || !nodes.value.length || settled) render()
  else if (timer === undefined) timer = setTimeout(render, STREAM_RENDER_INTERVAL_MS)
}, { immediate: true })

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <div class="answer-text"><MarkdownContent /></div>
</template>
