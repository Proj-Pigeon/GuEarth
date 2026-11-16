<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { CloseOutlined, DownOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useFlightStopsStore, type FlyToExecutor } from '@renderer/stores/flightStops'

const props = defineProps<{
  flyTo: FlyToExecutor
}>()

const store = useFlightStopsStore()
const { stops, activeIndex, total, currentStop, visible, canPrev, canNext } = storeToRefs(store)
const menuOpen = ref(false)

function handlePrev(): void {
  menuOpen.value = false
  void store.prev(props.flyTo)
}

function handleNext(): void {
  menuOpen.value = false
  void store.next(props.flyTo)
}

function handleSelect({ key }: { key: string | number }): void {
  const index = Number(key)
  menuOpen.value = false
  if (Number.isInteger(index)) void store.goTo(index, props.flyTo)
}

function handleClose(): void {
  menuOpen.value = false
  store.clear()
}
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="flight-switcher" role="region" aria-label="飞行地点切换">
      <a-tooltip title="上一个地点" placement="top">
        <a-button
          type="text"
          class="switcher-btn"
          :disabled="!canPrev"
          aria-label="上一个地点"
          @click="handlePrev"
        >
          <LeftOutlined />
        </a-button>
      </a-tooltip>
      <a-dropdown v-model:open="menuOpen" :trigger="['click']" placement="top">
        <a-button
          type="text"
          class="switcher-trigger"
          :aria-label="`当前第 ${activeIndex + 1} 个地点，共 ${total} 个：${currentStop?.name ?? ''}，${menuOpen ? '点击收起地点列表' : '点击展开地点列表'}`"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
        >
          <span class="switcher-counter">{{ activeIndex + 1 }}/{{ total }}</span>
          <span class="switcher-name" :title="currentStop?.name">{{ currentStop?.name }}</span>
          <DownOutlined class="switcher-arrow" :class="{ open: menuOpen }" />
        </a-button>
        <template #overlay>
          <a-menu class="flight-switcher-menu" :selected-keys="[String(activeIndex)]" @click="handleSelect">
            <a-menu-item v-for="(stop, index) in stops" :key="String(index)">
              <div class="flight-switcher-menu-row">
                <span class="flight-switcher-menu-index">{{ index + 1 }}</span>
                <div class="flight-switcher-menu-content">
                  <div class="flight-switcher-menu-name">{{ stop.name }}</div>
                  <div v-if="stop.note" class="flight-switcher-menu-note">{{ stop.note }}</div>
                </div>
              </div>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
      <a-tooltip title="下一个地点" placement="top">
        <a-button
          type="text"
          class="switcher-btn"
          :disabled="!canNext"
          aria-label="下一个地点"
          @click="handleNext"
        >
          <RightOutlined />
        </a-button>
      </a-tooltip>
      <a-divider type="vertical" class="switcher-divider" />
      <a-tooltip title="关闭地点切换" placement="top">
        <a-button
          type="text"
          class="switcher-btn"
          aria-label="关闭地点切换"
          @click="handleClose"
        >
          <CloseOutlined />
        </a-button>
      </a-tooltip>
    </div>
  </Transition>
</template>

<style scoped>
.flight-switcher {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100vw - 32px);
  padding: 4px 8px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 12;
}

.switcher-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  font-size: 14px;
  transition: color 0.1s ease-out, background-color 0.1s ease-out;
}

.switcher-btn:not(:disabled):hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.88);
}

.switcher-btn:disabled {
  color: rgba(0, 0, 0, 0.25);
}

.switcher-trigger {
  height: 32px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border-radius: 4px;
  transition: color 0.1s ease-out, background-color 0.1s ease-out;
}

.switcher-trigger:hover {
  background: rgba(0, 0, 0, 0.04);
}

.switcher-btn:focus-visible,
.switcher-trigger:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 1px;
}

.switcher-counter {
  flex-shrink: 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  color: rgba(0, 0, 0, 0.65);
}

.switcher-name {
  min-width: 0;
  max-width: min(200px, 36vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 22px;
  color: rgba(0, 0, 0, 0.88);
}

.switcher-trigger .switcher-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  transition: transform 0.2s ease-in-out;
}

.switcher-trigger .switcher-arrow.open {
  transform: rotate(180deg);
}

.switcher-divider {
  margin: 0 2px;
  height: 16px;
  border-inline-start-color: rgba(5, 5, 5, 0.06);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active,
  .switcher-btn,
  .switcher-trigger,
  .switcher-trigger .switcher-arrow {
    transition-duration: 0.01ms;
  }
}
</style>

<style>
.flight-switcher-menu {
  min-width: 220px;
  max-width: 320px;
  max-height: 260px;
  overflow-y: auto;
}

.flight-switcher-menu-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}

.flight-switcher-menu-index {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.ant-dropdown-menu-item-selected .flight-switcher-menu-index {
  background: #1677ff;
  color: #ffffff;
}

.flight-switcher-menu-content {
  min-width: 0;
  flex: 1;
}

.flight-switcher-menu-name {
  font-size: 14px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.88);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flight-switcher-menu-note {
  font-size: 12px;
  line-height: 18px;
  color: rgba(0, 0, 0, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
