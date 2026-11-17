<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue'
import type { AgentMemory } from '../../../preload'
import { useAiStore } from '@renderer/stores/ai'

const props = defineProps<{ active: boolean }>()
const store = useAiStore()

const memories = ref<AgentMemory[]>([])
const draft = ref('')
const loading = ref(false)
const adding = ref(false)
const switchBusy = ref(false)

const sortedMemories = computed(() => [...memories.value].reverse())

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    memories.value = await window.guEarth.ai.memory.list()
  } catch {
    message.error('无法读取记忆列表，请重试')
  } finally {
    loading.value = false
  }
}

watch(() => props.active, (active) => {
  if (active) void refresh()
}, { immediate: true })

async function addMemory(): Promise<void> {
  const content = draft.value.trim()
  if (!content || adding.value) return
  adding.value = true
  try {
    memories.value = await window.guEarth.ai.memory.add(content)
    draft.value = ''
    message.success('已添加记忆')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '记忆添加失败')
  } finally {
    adding.value = false
  }
}

async function removeMemory(memory: AgentMemory): Promise<void> {
  try {
    memories.value = await window.guEarth.ai.memory.delete(memory.id)
    message.success('已删除记忆')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '记忆删除失败')
  }
}

async function toggleEnabled(value: boolean): Promise<void> {
  if (switchBusy.value) return
  switchBusy.value = true
  try {
    await store.setMemoryEnabled(value)
    message.success(value ? '记忆功能已开启' : '记忆功能已关闭')
  } catch {
    message.error('设置保存失败，请重试')
  } finally {
    switchBusy.value = false
  }
}
</script>

<template>
  <section class="memory-settings">
    <div class="memory-toggle">
      <div class="memory-toggle-text">
        <div class="memory-toggle-title">记忆功能</div>
        <p class="memory-toggle-desc">自动记住你的个性偏好</p>
      </div>
      <a-switch
        :checked="store.settings.memoryEnabled"
        :loading="switchBusy"
        aria-label="记忆功能开关"
        @change="(value: string | number | boolean) => toggleEnabled(value === true)"
      />
    </div>

    <div class="memory-add">
      <a-input
        v-model:value="draft"
        placeholder="添加偏好，如：我是高中地理老师，喜欢结合案例讲解"
        :maxlength="300"
        @press-enter="addMemory"
      />
      <a-button type="primary" :loading="adding" :disabled="!draft.trim()" @click="addMemory"><PlusOutlined />添加</a-button>
    </div>

    <a-spin :spinning="loading">
      <div v-if="sortedMemories.length === 0 && !loading" class="memory-empty">暂无记录</div>
      <ul v-else class="memory-list">
        <li v-for="memory in sortedMemories" :key="memory.id" class="memory-item">
          <div class="memory-item-body">
            <p class="memory-item-content">{{ memory.content }}</p>
            <div class="memory-item-meta">
              <a-tag :color="memory.source === 'agent' ? 'blue' : 'green'" class="memory-item-tag">{{ memory.source === 'agent' ? '助手保存' : '手动添加' }}</a-tag>
              <span class="memory-item-time">{{ formatTime(memory.createdAt) }}</span>
            </div>
          </div>
          <a-popconfirm title="删除这条记忆？" ok-text="删除" cancel-text="取消" @confirm="removeMemory(memory)">
            <a-button type="text" danger :aria-label="`删除记忆 ${memory.content.slice(0, 12)}`"><DeleteOutlined /></a-button>
          </a-popconfirm>
        </li>
      </ul>
    </a-spin>
    <div v-if="sortedMemories.length > 0" class="memory-count">共 {{ sortedMemories.length }} 条记忆，上限 100 条</div>
  </section>
</template>

<style scoped>
.memory-settings{display:flex;flex-direction:column;gap:16px;padding:4px 0 16px}
.memory-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.memory-toggle-title{color:rgba(0,0,0,.88);font-size:14px;font-weight:600;line-height:22px}
.memory-toggle-desc{margin:4px 0 0;color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.memory-add{display:flex;gap:8px}
.memory-add :deep(.ant-input){flex:1;min-width:0}
.memory-empty{padding:16px 0;color:rgba(0,0,0,.45);font-size:13px;line-height:22px;text-align:center}
.memory-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column}
.memory-item{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid rgba(5,5,5,.06)}
.memory-item:last-child{border-bottom:none}
.memory-item-body{flex:1;min-width:0}
.memory-item-content{margin:0;color:rgba(0,0,0,.88);font-size:14px;line-height:22px;word-break:break-word}
.memory-item-meta{display:flex;align-items:center;gap:8px;margin-top:4px}
.memory-item-tag{margin-inline-end:0;transform:scale(.83);transform-origin:left center}
.memory-item-time{color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
.memory-count{color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
</style>
