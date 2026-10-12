<script setup lang="ts">
import { ControlOutlined, GlobalOutlined, InfoCircleOutlined, RobotOutlined } from '@ant-design/icons-vue'
import { useSettingsWindowStore, type SettingsSection } from '@renderer/stores/settingsWindow'
import GeneralSettings from './settings/GeneralSettings.vue'
import MapSettings from './settings/MapSettings.vue'
import AiSettingsSection from './settings/AiSettingsSection.vue'
import AboutSettings from './settings/AboutSettings.vue'

const emit = defineEmits<{ restartGuide: [] }>()
const settingsWindow = useSettingsWindowStore()

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
      { id: 'general', label: '通用', icon: ControlOutlined },
      { id: 'map', label: '地图', icon: GlobalOutlined }
    ]
  },
  { caption: 'EOQ 助手', items: [{ id: 'ai', label: 'AI', icon: RobotOutlined }] },
  { caption: '系统', items: [{ id: 'about', label: '关于', icon: InfoCircleOutlined }] }
]
</script>

<template>
  <a-modal
    :open="settingsWindow.isOpen"
    title="设置"
    :width="960"
    centered
    :footer="null"
    wrap-class-name="settings-modal"
    :body-style="{ padding: '0', display: 'flex', overflow: 'hidden', height: 'min(680px, calc(100vh - 120px))' }"
    @cancel="settingsWindow.close()"
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
            @click="settingsWindow.setActiveSection(item.id)"
          >
            <component :is="item.icon" class="nav-item-icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </nav>
      <div class="settings-pane">
        <GeneralSettings v-show="settingsWindow.activeSection === 'general'" @restart-guide="emit('restartGuide')" />
        <MapSettings v-show="settingsWindow.activeSection === 'map'" />
        <AiSettingsSection v-show="settingsWindow.activeSection === 'ai'" :active="settingsWindow.activeSection === 'ai'" />
        <AboutSettings v-show="settingsWindow.activeSection === 'about'" />
      </div>
    </template>
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

.nav-item:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 1px;
}

.nav-item-icon {
  font-size: 16px;
}

.settings-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
}
</style>
