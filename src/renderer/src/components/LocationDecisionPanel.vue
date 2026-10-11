<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import * as Cesium from 'cesium'
import { CloseOutlined, EnvironmentOutlined, MessageOutlined, UndoOutlined } from '@ant-design/icons-vue'
import { useAiStore } from '@renderer/stores/ai'
import { buildDecisionPrompt, decisionCases, decisionSandboxIntro } from '@renderer/thematic/decisionSandbox'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ viewer?: Cesium.Viewer }>()

const aiStore = useAiStore()

const activeCaseId = ref(decisionCases[0].id)
const selectedFactorIds = ref<string[]>([])
const flying = ref(false)

const activeCase = computed(() => decisionCases.find((item) => item.id === activeCaseId.value) ?? decisionCases[0])

function selectCase(id: string): void {
  activeCaseId.value = id
  selectedFactorIds.value = []
}

function toggleFactor(factorId: string): void {
  const index = selectedFactorIds.value.indexOf(factorId)
  if (index >= 0) selectedFactorIds.value = selectedFactorIds.value.filter((id) => id !== factorId)
  else selectedFactorIds.value = [...selectedFactorIds.value, factorId]
}

function resetSelection(): void {
  selectedFactorIds.value = []
}

function requestCritique(): void {
  aiStore.setPanelOpen(true)
  void aiStore.send(buildDecisionPrompt(activeCase.value, selectedFactorIds.value))
}

async function flyToPlace(): Promise<void> {
  if (flying.value) return
  const current = props.viewer && !props.viewer.isDestroyed() ? toRaw(props.viewer) : undefined
  if (!current) return
  flying.value = true
  try {
    const [lon, lat] = activeCase.value.placeLonLat
    current.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 220000), duration: 1.5 })
  } finally {
    flying.value = false
  }
}
</script>

<template>
  <div class="decision-panel" role="group" aria-label="区位决策沙盘">
    <div class="panel-header">
      <span class="panel-title">区位决策沙盘</span>
      <a-button type="text" size="small" aria-label="关闭区位决策沙盘" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>

    <a-segmented
      :value="activeCase.id"
      :options="decisionCases.map((item) => ({ label: item.name, value: item.id }))"
      class="case-picker"
      @change="(value: unknown) => selectCase(String(value))"
    />

    <div class="intro">{{ decisionSandboxIntro }}</div>

    <div class="case-question">{{ activeCase.question }}</div>
    <div class="case-context">{{ activeCase.context }}</div>

    <div class="factor-list">
      <div v-for="factor in activeCase.factors" :key="factor.id" class="factor-row" :class="{ selected: selectedFactorIds.includes(factor.id) }">
        <div class="factor-main">
          <a-switch size="small" :checked="selectedFactorIds.includes(factor.id)" :aria-label="`因素开关：${factor.name}`" @change="() => toggleFactor(factor.id)" />
          <span class="factor-name">{{ factor.name }}<span v-if="factor.essential" class="factor-essential" title="该情境的关键因素">★</span></span>
        </div>
        <p v-if="selectedFactorIds.includes(factor.id)" class="factor-hint">{{ factor.hint }}</p>
      </div>
    </div>

    <div class="action-row">
      <a-button type="text" size="small" class="case-fly" aria-label="飞往该地" @click="flyToPlace">
        <EnvironmentOutlined /> 飞往该地
      </a-button>
      <a-button size="small" :disabled="selectedFactorIds.length === 0" @click="resetSelection">
        <UndoOutlined /> 重置
      </a-button>
      <a-button type="primary" size="small" class="critique-button" @click="requestCritique">
        <MessageOutlined /> 按高考答题结构请 AI 点评
      </a-button>
    </div>
    <div class="panel-note">点评会以对话形式出现在 EOQ 助手中；AI 可调用区位分析工具与专题图层佐证结论。</div>
  </div>
</template>

<style scoped>
.decision-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 400px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 10;
}

.decision-panel > * {
  flex: none;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title {
  margin-right: auto;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.case-picker {
  width: fit-content;
  max-width: 100%;
}

.intro {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
}

.case-question {
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  font-weight: 600;
  line-height: 21px;
}

.case-context {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 19px;
}

.factor-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.factor-row {
  padding: 4px 6px;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 6px;
}

.factor-row.selected {
  border-color: rgba(22, 119, 255, 0.35);
  background: rgba(22, 119, 255, 0.04);
}

.factor-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.factor-name {
  flex: 1;
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  line-height: 20px;
}

.factor-essential {
  margin-left: 4px;
  color: #fa8c16;
  font-size: 11px;
  cursor: help;
}

.factor-hint {
  margin: 4px 0 0 34px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 18px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-fly {
  flex: none;
  color: rgba(0, 0, 0, 0.45);
}

.critique-button {
  flex: 1;
}

.panel-note {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 19px;
}
</style>
