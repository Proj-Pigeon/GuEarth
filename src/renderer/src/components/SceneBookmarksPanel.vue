<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, EyeOutlined, PlayCircleOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { Button, Empty, Input, InputNumber, Modal, Textarea } from 'ant-design-vue'
import { thematicLayerCatalog } from '@renderer/stores/climate'
import type { TeachingScene } from '../../../preload'

export interface SceneEditPayload {
  name: string
  narration: string
  dwellSeconds: number
}

const props = defineProps<{
  open: boolean
  scenes: TeachingScene[]
  saveError: string
}>()

const emit = defineEmits<{
  close: []
  save: [name: string, narration: string]
  preview: [id: string]
  update: [id: string, changes: SceneEditPayload]
  remove: [id: string]
  move: [id: string, offset: -1 | 1]
  play: [mode: 'manual' | 'auto']
}>()

const saveVisible = ref(false)
const saveName = ref('')
const saveNarration = ref('')
const editVisible = ref(false)
const editId = ref('')
const editName = ref('')
const editNarration = ref('')
const editDwellSeconds = ref(6)

const layerNameOf = (id: string): string => thematicLayerCatalog.find((layer) => layer.id === id)?.name ?? id
const narrationPreview = (scene: TeachingScene): string => scene.narration.length > 42 ? `${scene.narration.slice(0, 42)}…` : scene.narration
const sceneTags = (scene: TeachingScene): string[] => {
  const names = scene.snapshot.overlays.slice(0, 2).map(layerNameOf)
  if (scene.snapshot.overlays.length > 2) names.push(`+${scene.snapshot.overlays.length - 2}`)
  return names
}

const canPlay = computed(() => props.scenes.length > 0)

function openSave(): void {
  saveName.value = `场景 ${props.scenes.length + 1}`
  saveNarration.value = ''
  saveVisible.value = true
}

function confirmSave(): void {
  const name = saveName.value.trim()
  if (!name) return
  saveVisible.value = false
  emit('save', name, saveNarration.value.trim())
}

function openEdit(scene: TeachingScene): void {
  editId.value = scene.id
  editName.value = scene.name
  editNarration.value = scene.narration
  editDwellSeconds.value = Math.round(scene.dwellMs / 1000)
  editVisible.value = true
}

function confirmEdit(): void {
  const name = editName.value.trim()
  if (!name) return
  editVisible.value = false
  emit('update', editId.value, { name, narration: editNarration.value.trim(), dwellSeconds: Math.min(60, Math.max(1, editDwellSeconds.value ?? 6)) })
}
</script>

<template>
  <a-drawer :open="open" placement="right" :width="360" :mask="false" :closable="false" :body-style="{ padding: '16px', display: 'flex', flexDirection: 'column' }" @close="emit('close')">
    <template #title>
      <div class="panel-title">
        <h2>教学场景</h2>
        <a-button type="text" aria-label="关闭教学场景" @click="emit('close')"><CloseOutlined /></a-button>
      </div>
    </template>
    <div class="panel-toolbar">
      <Button type="primary" block @click="openSave">
        <template #icon><PlusOutlined /></template>
        保存当前画面为场景
      </Button>
      <a-alert v-if="saveError" type="error" show-icon :message="saveError" class="panel-alert" />
    </div>
    <div class="scene-list">
      <div v-if="!scenes.length" class="scene-empty">
        <Empty description="还没有教学场景">
          <span class="scene-empty-hint">将当前视角与图层保存为场景，方便课堂播放。</span>
        </Empty>
      </div>
      <div v-for="(scene, index) in scenes" :key="scene.id" class="scene-item">
        <div class="scene-item-main" @dblclick="openEdit(scene)">
          <div class="scene-item-title">
            <span class="scene-order">{{ index + 1 }}</span>
            <span class="scene-name">{{ scene.name }}</span>
          </div>
          <div v-if="sceneTags(scene).length" class="scene-tags">
            <span v-for="tag in sceneTags(scene)" :key="tag" class="scene-tag">{{ tag }}</span>
            <span v-if="scene.snapshot.simTime" class="scene-tag scene-tag-time">昼夜模拟</span>
          </div>
          <div v-if="scene.narration" class="scene-narration">{{ narrationPreview(scene) }}</div>
          <div class="scene-meta">停留 {{ Math.round(scene.dwellMs / 1000) }} 秒 · {{ Math.round(scene.flyDurationMs / 1000) }} 秒飞行</div>
        </div>
        <div class="scene-item-actions">
          <a-tooltip title="预览此场景">
            <a-button type="text" class="scene-action" aria-label="预览此场景" @click="emit('preview', scene.id)"><EyeOutlined /></a-button>
          </a-tooltip>
          <a-tooltip title="编辑">
            <a-button type="text" class="scene-action" aria-label="编辑场景" @click="openEdit(scene)"><SaveOutlined /></a-button>
          </a-tooltip>
          <a-tooltip title="上移">
            <a-button type="text" class="scene-action" :disabled="index === 0" aria-label="上移场景" @click="emit('move', scene.id, -1)"><ArrowUpOutlined /></a-button>
          </a-tooltip>
          <a-tooltip title="下移">
            <a-button type="text" class="scene-action" :disabled="index === scenes.length - 1" aria-label="下移场景" @click="emit('move', scene.id, 1)"><ArrowDownOutlined /></a-button>
          </a-tooltip>
          <a-popconfirm title="删除此场景？" ok-text="删除" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="emit('remove', scene.id)">
            <a-button type="text" class="scene-action" aria-label="删除场景"><CloseOutlined /></a-button>
          </a-popconfirm>
        </div>
      </div>
    </div>
    <div class="panel-footer">
      <Button type="primary" :disabled="!canPlay" @click="emit('play', 'manual')">
        <template #icon><PlayCircleOutlined /></template>
        逐幕播放
      </Button>
      <Button :disabled="!canPlay" @click="emit('play', 'auto')">自动播放</Button>
    </div>
  </a-drawer>
  <Modal v-model:open="saveVisible" title="保存教学场景" ok-text="保存" cancel-text="取消" @ok="confirmSave">
    <div class="field">
      <span class="field-label">场景名称</span>
      <Input v-model:value="saveName" placeholder="如：全球气压带与风带" :maxlength="80" @press-enter="confirmSave" />
    </div>
    <div class="field">
      <span class="field-label">旁白字幕（可选）</span>
      <Textarea v-model:value="saveNarration" placeholder="播放时显示在画面下方的讲解词" :rows="3" :maxlength="500" show-count />
    </div>
  </Modal>
  <Modal v-model:open="editVisible" title="编辑场景" ok-text="保存" cancel-text="取消" @ok="confirmEdit">
    <div class="field">
      <span class="field-label">场景名称</span>
      <Input v-model:value="editName" :maxlength="80" @press-enter="confirmEdit" />
    </div>
    <div class="field">
      <span class="field-label">旁白字幕</span>
      <Textarea v-model:value="editNarration" :rows="3" :maxlength="500" show-count />
    </div>
    <div class="field">
      <span class="field-label">每幕停留（秒）</span>
      <InputNumber v-model:value="editDwellSeconds" :min="1" :max="60" class="dwell-input" />
    </div>
  </Modal>
</template>

<style scoped>
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.88);
}

.panel-toolbar {
  flex-shrink: 0;
}

.panel-alert {
  margin-top: 8px;
}

.scene-list {
  flex: 1;
  overflow-y: auto;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-empty {
  padding: 24px 0;
}

.scene-empty-hint {
  display: block;
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}

.scene-item {
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
  background: #ffffff;
}

.scene-item-main {
  flex: 1;
  min-width: 0;
}

.scene-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scene-order {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.scene-name {
  font-size: 14px;
  line-height: 22px;
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.scene-tag {
  padding: 0 7px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.scene-tag-time {
  color: #1677ff;
}

.scene-narration {
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.scene-meta {
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.scene-item-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.scene-action {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.scene-action:hover {
  color: rgba(0, 0, 0, 0.88);
}

.panel-footer {
  flex-shrink: 0;
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.panel-footer .ant-btn {
  flex: 1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.field-label {
  font-size: 12px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.65);
}

.dwell-input {
  width: 100%;
}
</style>
