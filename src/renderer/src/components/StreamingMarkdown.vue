<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch, type VNodeChild } from 'vue'
import { renderMarkdown } from '@renderer/utils/markdown'

const props = defineProps<{ text: string; streaming: boolean }>()
const emit = defineEmits<{ rendered: [] }>()
const nodes = shallowRef<VNodeChild[]>([])
const MarkdownContent = () => nodes.value

let timer: ReturnType<typeof setTimeout> | undefined

function render(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  nodes.value = renderMarkdown(props.text)
  emit('rendered')
}

watch(() => [props.text, props.streaming] as const, () => {
  if (!props.streaming || !nodes.value.length) render()
  else if (timer === undefined) timer = setTimeout(render, 50)
}, { immediate: true })

onBeforeUnmount(() => {
  if (timer !== undefined) clearTimeout(timer)
})
</script>

<template>
  <div class="answer-text"><MarkdownContent /></div>
</template>
