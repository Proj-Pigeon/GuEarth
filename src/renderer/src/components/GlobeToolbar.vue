<script setup lang="ts">
import { computed } from 'vue'
import { AimOutlined, AppstoreOutlined, ArrowRightOutlined, CheckCircleOutlined, ClearOutlined, DownloadOutlined, EnvironmentOutlined, ExperimentOutlined, EyeOutlined, FontSizeOutlined, GatewayOutlined, HomeOutlined, NodeIndexOutlined, PlaySquareOutlined, QuestionCircleOutlined, RobotOutlined, TagsOutlined } from '@ant-design/icons-vue'
import { Button, Tooltip } from 'ant-design-vue'
import type { Component } from 'vue'
import type { DrawTool } from '@renderer/stores/drawing'
import type { UpdateStatus } from '@renderer/stores/updater'

const props = defineProps<{
  activeTool: DrawTool | null
  shapeCount: number
  levelViewActive: boolean
  levelViewVisible: boolean
  labActive: boolean
  nightBasemapActive: boolean
  updateStatus: UpdateStatus
  updateVersion: string
  updatePercent: number
}>()

defineEmits<{
  openLayers: []
  openAnnotations: []
  openAssistant: []
  openSetupGuide: []
  openScenes: []
  home: []
  tool: [tool: DrawTool]
  clearShapes: []
  toggleLevelView: []
  toggleLab: []
  updateClick: []
}>()

const tools: { id: DrawTool; label: string; icon: Component }[] = [
  { id: 'point', label: '绘制点', icon: EnvironmentOutlined },
  { id: 'line', label: '绘制线', icon: NodeIndexOutlined },
  { id: 'polygon', label: '绘制多边形', icon: GatewayOutlined },
  { id: 'arrow', label: '绘制箭头', icon: ArrowRightOutlined },
  { id: 'text', label: '添加文本框', icon: FontSizeOutlined }
]

const levelViewIcon = computed(() => (props.levelViewActive ? EyeOutlined : AimOutlined))
const levelViewTooltip = computed(() => (props.levelViewActive ? '恢复俯视视角' : '平视 3D 地形'))
const labTooltip = computed(() => (props.nightBasemapActive ? '夜光模式下地理实验室不可用，切换回其他底图后恢复' : '地理实验室'))
const updateVisible = computed(() => props.updateStatus !== 'idle')
const updateTooltip = computed(() => {
  if (props.updateStatus === 'downloading') return props.updatePercent > 0 ? `正在下载新版本 ${props.updatePercent}%` : '正在下载新版本…'
  if (props.updateStatus === 'ready') return '新版本已就绪，点击重启安装'
  return `发现新版本 v${props.updateVersion}，点击下载`
})
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <a-tooltip title="回到初始视角" placement="top">
        <a-button type="text" class="toolbar-btn" aria-label="回到初始视角" data-guide-target="home" @click="$emit('home')">
          <HomeOutlined />
        </a-button>
      </a-tooltip>
      <a-tooltip title="图层管理" placement="top">
        <a-button type="text" class="toolbar-btn" aria-label="图层管理" data-guide-target="layers" @click="$emit('openLayers')">
          <AppstoreOutlined />
        </a-button>
      </a-tooltip>
      <a-tooltip :title="labTooltip" placement="top">
        <a-button type="text" class="toolbar-btn" :class="{ active: labActive }" :disabled="nightBasemapActive" aria-label="地理实验室" data-guide-target="lab" @click="$emit('toggleLab')">
          <ExperimentOutlined />
        </a-button>
      </a-tooltip>
      <a-tooltip title="教学场景" placement="top">
        <a-button type="text" class="toolbar-btn" aria-label="教学场景" @click="$emit('openScenes')">
          <PlaySquareOutlined />
        </a-button>
      </a-tooltip>
    </div>
    <div class="toolbar-group">
      <a-tooltip title="标注管理" placement="top">
        <a-button type="text" class="toolbar-btn" aria-label="标注管理" data-guide-target="annotations" @click="$emit('openAnnotations')">
          <TagsOutlined />
        </a-button>
      </a-tooltip>
      <div class="toolbar-tools" data-guide-target="drawing-tools">
        <a-tooltip v-for="item in tools" :key="item.id" :title="item.label" placement="top">
          <a-button type="text" class="toolbar-btn" :class="{ active: activeTool === item.id }" :aria-label="item.label" @click="$emit('tool', item.id)">
            <component :is="item.icon" />
          </a-button>
        </a-tooltip>
        <a-tooltip title="清除全部标注" placement="top">
          <a-button type="text" class="toolbar-btn" :disabled="!shapeCount" aria-label="清除全部标注" @click="$emit('clearShapes')">
            <ClearOutlined />
          </a-button>
        </a-tooltip>
      </div>
    </div>
    <div class="toolbar-floating">
      <Transition name="fade">
        <Tooltip v-if="levelViewVisible" :title="levelViewTooltip" placement="top">
          <Button
            class="toolbar-circle"
            :type="levelViewActive ? 'primary' : 'default'"
            shape="circle"
            :aria-label="levelViewTooltip"
            @click="$emit('toggleLevelView')"
          >
            <template #icon><component :is="levelViewIcon" /></template>
          </Button>
        </Tooltip>
      </Transition>
      <Transition name="fade">
        <Tooltip v-if="updateVisible" :title="updateTooltip" placement="top">
          <a-badge v-if="updateStatus === 'available'" dot color="#1677ff" :offset="[-6, 6]">
            <Button class="toolbar-circle" type="default" shape="circle" :aria-label="updateTooltip" @click="$emit('updateClick')">
              <DownloadOutlined />
            </Button>
          </a-badge>
          <Button
            v-else
            class="toolbar-circle"
            :type="updateStatus === 'ready' ? 'primary' : 'default'"
            shape="circle"
            :aria-label="updateTooltip"
            @click="$emit('updateClick')"
          >
            <a-progress v-if="updateStatus === 'downloading'" type="circle" :percent="updatePercent" :size="22" :stroke-width="3" :show-info="false" />
            <CheckCircleOutlined v-else />
          </Button>
        </Tooltip>
      </Transition>
      <a-tooltip title="EOQ 智能助手" placement="top">
        <a-button type="default" shape="circle" class="toolbar-circle" aria-label="EOQ 智能助手" data-guide-target="assistant" @click="$emit('openAssistant')">
          <RobotOutlined />
        </a-button>
      </a-tooltip>
      <a-tooltip title="使用引导" placement="top">
        <a-button type="default" shape="circle" class="toolbar-circle" aria-label="使用引导" @click="$emit('openSetupGuide')">
          <QuestionCircleOutlined />
        </a-button>
      </a-tooltip>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  padding: 8px;
}

.toolbar-floating {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  font-size: 16px;
}

.toolbar-circle {
  width: 40px;
  height: 40px;
  min-width: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.88);
}

.toolbar-btn.active,
.toolbar-btn.active:hover {
  background: #1677ff;
  color: #ffffff;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
