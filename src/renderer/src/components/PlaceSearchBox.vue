<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'ant-design-vue'
import { DownOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { useGlobeStore } from '@renderer/stores/globe'
import { useFailureStore } from '@renderer/stores/failure'
import type { PlaceSearchProvider, PlaceSuggestion } from '../../../preload'

interface PlaceOption {
  value: string
  key: string
  disabled?: boolean
  place?: PlaceSuggestion
  label: ReturnType<typeof h>
}

const emit = defineEmits<{
  select: [place: PlaceSuggestion]
}>()

const keyword = ref('')
const options = ref<PlaceOption[]>([])
const store = useGlobeStore()
const failureStore = useFailureStore()
const searchInput = ref<{ focus: () => void }>()
const preferredProvider = ref<PlaceSearchProvider>('amap')
const providerMenuOpen = ref(false)
const suggestionsOpen = ref(false)
let lastQuery = ''
const providerDefinitions: Array<{ id: PlaceSearchProvider; name: string }> = [
  { id: 'amap', name: '高德' },
  { id: 'baidu', name: '百度' }
]
const availableProviders = computed(() => providerDefinitions.filter((item) => store.providerCredentials[item.id]?.configured))
const showProviderSelect = computed(() => availableProviders.value.length > 1)
const provider = computed(() => availableProviders.value.find((item) => item.id === preferredProvider.value) ?? availableProviders.value[0])
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let requestSeq = 0
let suppressWatch = false

function regionText(place: PlaceSuggestion): string {
  const region = [place.province, place.city, place.district].filter((part) => part && part !== place.name).join(' · ')
  return [region, place.address].filter((part) => part).join(' · ')
}

function statusOption(text: string, isError: boolean, retry?: () => void): PlaceOption {
  return {
    value: `status:${text}`,
    key: `status:${text}`,
    disabled: true,
    label: h('div', { class: isError ? 'guearth-place-status guearth-place-status-error' : 'guearth-place-status' }, [
      h('span', text),
      retry ? h(Button, { type: 'text', size: 'small', class: 'guearth-place-retry', onClick: retry }, () => '重试') : null
    ])
  }
}

function providerName(id?: PlaceSearchProvider): string {
  return providerDefinitions.find((item) => item.id === id)?.name ?? ''
}

function retryLast(): void {
  const query = lastQuery.trim()
  if (query) void search(query)
}

function placeOption(place: PlaceSuggestion, index: number): PlaceOption {
  return {
    value: `${place.name}:${place.longitude},${place.latitude}:${index}`,
    key: `${place.name}:${place.longitude},${place.latitude}:${index}`,
    place,
    label: h('div', { class: 'guearth-place-option' }, [
      h('div', { class: 'guearth-place-option-name' }, place.name),
      h('div', { class: 'guearth-place-option-meta' }, regionText(place) || place.type)
    ])
  }
}

async function search(text: string): Promise<void> {
  const seq = ++requestSeq
  lastQuery = text
  if (!window.guEarth?.places) {
    options.value = [statusOption('搜索服务不可用', true)]
    return
  }
  if (!provider.value) {
    options.value = [statusOption('请先在「设置 → 地图」中配置高德或百度密钥', true)]
    return
  }
  options.value = [{
    value: 'status:loading',
    key: 'status:loading',
    disabled: true,
    label: h('div', { class: 'guearth-place-status' }, [h(LoadingOutlined, { spin: true, style: 'margin-right:6px' }), '正在搜索…'])
  }]
  let result
  try {
    result = await window.guEarth.places.search(text, provider.value.id)
  } catch {
    if (seq === requestSeq) options.value = [statusOption('搜索失败，请稍后重试', true, retryLast)]
    return
  }
  if (seq !== requestSeq) return
  if (result.superseded) return
  if (result.fellBackFrom) failureStore.reportDegrade(`${providerName(result.fellBackFrom)}不可用，已改用${providerName(result.source)}`)
  if (result.error) options.value = [statusOption(result.error, true, retryLast)]
  else if (!result.places.length) options.value = [statusOption(result.note ?? '没有找到匹配的地点，可换个说法或切换搜索源', false)]
  else options.value = result.places.map((place, index) => placeOption(place, index))
}

watch([keyword, () => provider.value?.id, () => provider.value && store.providerCredentials[provider.value.id]?.updatedAt], ([text], [previousText, previousProvider]) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  requestSeq += 1
  options.value = []
  if (suppressWatch) {
    suppressWatch = false
    if (provider.value?.id === previousProvider && text !== previousText) return
  }
  const query = text.trim()
  if (!query) {
    return
  }
  debounceTimer = setTimeout(() => {
    void search(query)
  }, 300)
})

watch(showProviderSelect, (visible) => {
  if (!visible) providerMenuOpen.value = false
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  requestSeq += 1
})

function handleSelect(_value: string, option: PlaceOption): void {
  if (!option.place) return
  if (debounceTimer) clearTimeout(debounceTimer)
  requestSeq += 1
  suppressWatch = keyword.value !== option.place.name
  keyword.value = option.place.name
  options.value = []
  suggestionsOpen.value = false
  emit('select', option.place)
}

async function handleProviderSelect({ key }: { key: string | number }): Promise<void> {
  if (key !== 'amap' && key !== 'baidu') return
  if (!availableProviders.value.some((item) => item.id === key)) return
  preferredProvider.value = key
  providerMenuOpen.value = false
  await nextTick()
  searchInput.value?.focus()
  suggestionsOpen.value = true
}
</script>

<template>
  <div class="place-search" data-guide-target="place-search">
    <a-auto-complete
      ref="searchInput"
      v-model:value="keyword"
      class="place-autocomplete"
      :options="options"
      :filter-option="false"
      :open="suggestionsOpen && !providerMenuOpen"
      popup-class-name="guearth-place-dropdown"
      @dropdown-visible-change="suggestionsOpen = $event"
      @select="handleSelect"
    >
      <a-input allow-clear size="large" placeholder="输入关键词以搜索" aria-label="搜索地点">
        <template #prefix><SearchOutlined class="place-search-icon" /></template>
        <template #suffix>
          <span v-if="showProviderSelect" class="place-provider-space" aria-hidden="true"></span>
        </template>
      </a-input>
    </a-auto-complete>
    <a-dropdown
      v-if="showProviderSelect"
      v-model:open="providerMenuOpen"
      :trigger="['click']"
      placement="bottomRight"
    >
      <a-button
        type="text"
        class="place-provider-button"
        :aria-label="`搜索源：${provider?.name}`"
        aria-haspopup="menu"
        :aria-expanded="providerMenuOpen"
        @mousedown.stop
        @keydown.esc="providerMenuOpen = false"
      >
        {{ provider?.name }}<DownOutlined />
      </a-button>
      <template #overlay>
        <a-menu :selected-keys="provider ? [provider.id] : []" @click="handleProviderSelect">
          <a-menu-item v-for="item in availableProviders" :key="item.id">{{ item.name }}</a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<style scoped>
.place-search {
  position: absolute;
  top: 16px;
  left: 16px;
  width: min(400px, calc(100vw - 32px));
  z-index: 10;
}

.place-autocomplete {
  width: 100%;
}

.place-search :deep(.ant-input-affix-wrapper) {
  border-radius: 6px;
}

.place-provider-space {
  display: inline-block;
  width: 72px;
  height: 1px;
}

.place-provider-button {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 72px;
  height: 32px;
  padding: 4px 8px;
  color: rgba(0, 0, 0, 0.65);
  border-left: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 0 6px 6px 0;
  background: #fff;
}

.place-provider-button:hover {
  color: rgba(0, 0, 0, 0.88);
  background: rgba(0, 0, 0, 0.04);
}

.place-provider-button :deep(.anticon) {
  margin-inline-start: 0;
  font-size: 12px;
}

.place-provider-button:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: -2px;
}

.place-search-icon {
  color: rgba(0, 0, 0, 45%);
}
</style>

<style>
.guearth-place-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

.guearth-place-option-name {
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
}

.guearth-place-option-meta {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guearth-place-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}

.guearth-place-retry {
  height: 20px;
  padding: 0 4px;
  font-size: 12px;
}

.guearth-place-status-error {
  color: #ff4d4f;
}

.guearth-place-dropdown .ant-select-item-option-content {
  white-space: normal;
}
</style>
