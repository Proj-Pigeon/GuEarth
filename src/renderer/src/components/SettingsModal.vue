<script setup lang="ts">
import { computed, ref } from 'vue'
import { ControlOutlined, ExperimentOutlined, GlobalOutlined, InfoCircleOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons-vue'
import { useSettingsWindowStore, type SettingsSection } from '@renderer/stores/settingsWindow'
import AccountSettings from './settings/AccountSettings.vue'
import GeneralSettings from './settings/GeneralSettings.vue'
import MapSettings from './settings/MapSettings.vue'
import AiSettingsSection from './settings/AiSettingsSection.vue'
import LaboratorySettings from './settings/LaboratorySettings.vue'
import AboutSettings from './settings/AboutSettings.vue'
import UnsavedChangesBar from './settings/UnsavedChangesBar.vue'

type PendingAction = { kind: 'navigate'; section: SettingsSection } | { kind: 'close' }

const emit = defineEmits<{ restartGuide: [] }>()
const settingsWindow = useSettingsWindowStore()
const laboratoryBusy = ref(false)
const aiSection = ref<InstanceType<typeof AiSettingsSection> | null>(null)
const confirmOpen = ref(false)
const confirmSaving = ref(false)
const pendingAction = ref<PendingAction | null>(null)

const barSaving = ref(false)

const settingsInteractive = computed(() => !laboratoryBusy.value && !confirmOpen.value)
const aiDirty = computed(() => aiSection.value?.isDirty() ?? false)
const unsavedBarOpen = computed(() => settingsWindow.activeSection === 'ai' && aiDirty.value && !confirmOpen.value)

interface NavItem {
  id: SettingsSection
  label: string
  icon: typeof ControlOutlined
}

interface NavGroup {
  caption: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    caption: '常规',
    items: [
      { id: 'account', label: '账户', icon: UserOutlined },
      { id: 'general', label: '通用', icon: ControlOutlined },
      { id: 'map', label: '地图', icon: GlobalOutlined }
    ]
  },
  { caption: 'EOQ 助手', items: [{ id: 'ai', label: 'AI', icon: RobotOutlined }] },
  {
    caption: '系统',
    items: [
      { id: 'laboratory', label: '实验室', icon: ExperimentOutlined },
      { id: 'about', label: '关于', icon: InfoCircleOutlined }
    ]
  }
]

function hasUnsavedAiChanges(): boolean {
  return aiDirty.value
}

async function handleBarSave(): Promise<void> {
  if (barSaving.value) return
  barSaving.value = true
  try {
    await aiSection.value?.saveDrafts()
  } finally {
    barSaving.value = false
  }
}

function handleBarDiscard(): void {
  aiSection.value?.discardDrafts()
}

function runPendingAction(action: PendingAction | null): void {
  if (!action) return
  if (action.kind === 'navigate') settingsWindow.setActiveSection(action.section)
  else settingsWindow.close()
}

function requestNavigate(section: SettingsSection): void {
  if (!settingsInteractive.value || section === settingsWindow.activeSection) return
  if (settingsWindow.activeSection === 'ai' && hasUnsavedAiChanges()) {
    pendingAction.value = { kind: 'navigate', section }
    confirmOpen.value = true
    return
  }
  settingsWindow.setActiveSection(section)
}

function requestClose(): void {
  if (!settingsInteractive.value) return
  if (hasUnsavedAiChanges()) {
    pendingAction.value = { kind: 'close' }
    confirmOpen.value = true
    return
  }
  settingsWindow.close()
}

function handleConfirmIgnore(): void {
  if (confirmSaving.value) return
  aiSection.value?.discardDrafts()
  const action = pendingAction.value
  pendingAction.value = null
  confirmOpen.value = false
  runPendingAction(action)
}

function handleConfirmContinue(): void {
  if (confirmSaving.value) return
  pendingAction.value = null
  confirmOpen.value = false
}

async function handleConfirmSave(): Promise<void> {
  if (confirmSaving.value) return
  confirmSaving.value = true
  try {
    const saved = await (aiSection.value?.saveDrafts() ?? Promise.resolve(false))
    const action = pendingAction.value
    pendingAction.value = null
    confirmOpen.value = false
    if (saved) runPendingAction(action)
  } finally {
    confirmSaving.value = false
  }
}
</script>

<template>
  <a-modal
    :open="settingsWindow.isOpen"
    title="设置"
    :width="960"
    centered
    :footer="null"
    :closable="!laboratoryBusy"
    :mask-closable="settingsInteractive"
    :keyboard="settingsInteractive"
    wrap-class-name="settings-modal"
    :body-style="{ padding: '0', display: 'flex', overflow: 'hidden', height: 'min(680px, calc(100vh - 120px))' }"
    @cancel="requestClose"
  >
    <template v-if="settingsWindow.isOpen">
      <nav class="settings-nav" aria-label="设置分区">
        <div v-for="group in navGroups" :key="group.caption" class="nav-group">
          <div class="nav-caption">{{ group.caption }}</div>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            :class="['nav-item', { selected: settingsWindow.activeSection === item.id }]"
            :aria-current="settingsWindow.activeSection === item.id ? 'true' : undefined"
            :disabled="laboratoryBusy"
            @click="requestNavigate(item.id)"
          >
            <component :is="item.icon" class="nav-item-icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </nav>
      <div :class="['settings-pane', { 'has-unsaved-bar': unsavedBarOpen }]">
        <AccountSettings v-show="settingsWindow.activeSection === 'account'" />
        <GeneralSettings v-show="settingsWindow.activeSection === 'general'" @restart-guide="emit('restartGuide')" />
        <MapSettings v-show="settingsWindow.activeSection === 'map'" />
        <AiSettingsSection
          ref="aiSection"
          v-show="settingsWindow.activeSection === 'ai'"
          :active="settingsWindow.activeSection === 'ai'"
          @request-close="requestClose"
        />
        <LaboratorySettings v-show="settingsWindow.activeSection === 'laboratory'" :active="settingsWindow.activeSection === 'laboratory'" @busy-change="laboratoryBusy = $event" />
        <AboutSettings v-show="settingsWindow.activeSection === 'about'" />
        <UnsavedChangesBar :open="unsavedBarOpen" :saving="barSaving" @save="handleBarSave" @discard="handleBarDiscard" />
      </div>
    </template>
  </a-modal>

  <a-modal
    v-model:open="confirmOpen"
    title="AI 设置尚未保存"
    :width="420"
    ok-text="保存设置"
    cancel-text="忽略"
    :confirm-loading="confirmSaving"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    @ok="handleConfirmSave"
    @cancel="handleConfirmIgnore"
  >
    <p class="unsaved-confirm-text">修改尚未保存，离开后将丢失。</p>
  </a-modal>
</template>

<style>
.settings-modal .ant-modal .ant-modal-content {
  padding: 0;
  overflow: hidden;
}

.settings-modal .ant-modal .ant-modal-header {
  padding: 16px 24px 0;
}
</style>

<style scoped>
.settings-nav {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 16px 12px 16px 16px;
  border-right: 1px solid rgba(5, 5, 5, 0.06);
}

.nav-group + .nav-group {
  margin-top: 8px;
}

.nav-caption {
  padding: 8px 8px 4px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}

.nav-group:first-child .nav-caption {
  padding-top: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-family: inherit;
  line-height: 22px;
  cursor: pointer;
  transition: background-color 0.1s ease-out, color 0.1s ease-out;
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.nav-item.selected,
.nav-item.selected:hover {
  background: #1677ff;
  color: #ffffff;
}

.nav-item:disabled,
.nav-item:disabled:hover {
  background: transparent;
  color: rgba(0, 0, 0, 0.25);
  cursor: not-allowed;
}

.nav-item:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 1px;
}

.nav-item-icon {
  font-size: 16px;
}

.settings-pane {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.settings-pane.has-unsaved-bar :deep(.settings-section) {
  padding-bottom: 88px;
}

.unsaved-confirm-text {
  margin: 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: 14px;
  line-height: 22px;
}

.unsaved-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
