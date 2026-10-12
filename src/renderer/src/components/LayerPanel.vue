<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloseOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { basemapCategories, providerCatalog, terrainCatalog, type LayerMeta, type ProviderMeta } from '@renderer/stores/globe'

interface BasemapOption {
  id: string
  name: string
  selected: boolean
  providers: ProviderMeta[]
  activeProviderId: string
  activeProviderName: string
  activeLayer?: LayerMeta
}

const props = defineProps<{
  open: boolean
  layers: LayerMeta[]
  selectedLayerId: string
  error: string
  terrainError: string
  terrainProviderId: string
  activeTerrainId: string
  terrainExaggeration: number
  terrainLighting: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
  opacity: [id: string, opacity: number]
  retry: []
  terrain: [id: string]
  terrainExaggeration: [value: number]
  terrainLighting: [value: boolean]
}>()

const basemapOptions = computed<BasemapOption[]>(() => basemapCategories.map((category) => {
  const providers = category.providerIds
    .map((id) => providerCatalog.find((provider) => provider.id === id))
    .filter((provider): provider is ProviderMeta => Boolean(provider))
  const activeProviderId = providers.some((provider) => provider.id === props.selectedLayerId) ? props.selectedLayerId : providers[0]?.id ?? ''
  return {
    id: category.id,
    name: category.name,
    selected: category.providerIds.includes(props.selectedLayerId),
    providers,
    activeProviderId,
    activeProviderName: providers.find((provider) => provider.id === activeProviderId)?.name ?? '',
    activeLayer: props.layers.find((layer) => layer.id === activeProviderId)
  }
}))

const settingsCategoryId = ref('')
const activeTerrainName = computed(() => terrainCatalog.find((terrain) => terrain.id === props.activeTerrainId)?.name ?? '')
const terrainDegraded = computed(() => Boolean(props.activeTerrainId) && props.activeTerrainId !== props.terrainProviderId)
const settingsCategory = computed(() => basemapOptions.value.find((option) => option.id === settingsCategoryId.value))
const settingsOpacity = computed(() => Math.round((settingsCategory.value?.activeLayer?.opacity ?? 1) * 100))

function openSettings(id: string, event: Event): void {
  event.stopPropagation()
  settingsCategoryId.value = id
}

function closeSettings(): void {
  settingsCategoryId.value = ''
}

function handleSettingsProviderChange(event: { target: { value: string } }): void {
  emit('select', event.target.value)
}

function handleSettingsOpacity(value: number): void {
  const layer = settingsCategory.value?.activeLayer
  if (layer) emit('opacity', layer.id, value / 100)
}
</script>

<template>
  <a-drawer :open="open" placement="right" :width="360" :mask="false" :closable="false" :body-style="{ padding: '16px' }" @close="emit('close')">
    <template #title>
      <div class="panel-title">
        <h2>图层管理</h2>
        <a-button type="text" aria-label="关闭图层管理" @click="emit('close')"><CloseOutlined /></a-button>
      </div>
    </template>
    <a-alert v-if="error" type="error" show-icon :message="error" class="panel-alert">
      <template #action><a-button type="text" size="small" @click="emit('retry')"><ReloadOutlined />重试</a-button></template>
    </a-alert>
    <div class="layer-spin">
      <section class="panel-section">
        <div class="basemap-list">
          <div
            v-for="option in basemapOptions"
            :key="option.id"
            :class="['basemap-item', { selected: option.selected }]"
            @click="emit('select', option.activeProviderId)"
          >
            <a-radio :checked="option.selected" :aria-label="`选择${option.name}底图`" />
            <div class="basemap-copy">
              <div class="basemap-name">{{ option.name }}</div>
              <div class="basemap-description">{{ option.activeProviderName }}</div>
            </div>
            <a-tooltip :title="`${option.name}设置`">
              <a-button type="text" size="small" class="more-button" :aria-label="`${option.name}设置`" @click="openSettings(option.id, $event)"><MoreOutlined /></a-button>
            </a-tooltip>
          </div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-heading"><span>3D 地形</span></div>
        <a-select :value="terrainProviderId" class="full-select" @change="(value: string) => emit('terrain', value)">
          <a-select-option v-for="option in terrainCatalog" :key="option.id" :value="option.id" :title="option.description">{{ option.name }}</a-select-option>
        </a-select>
        <div v-if="terrainDegraded" class="terrain-active-hint">当前实际使用「{{ activeTerrainName }}」</div>
        <div class="terrain-slider-head"><span>垂直夸张</span><span>{{ terrainExaggeration }}×</span></div>
        <a-slider
          :value="terrainExaggeration"
          :min="1"
          :max="5"
          :step="0.5"
          :marks="{ 1: '1×', 3: '3×', 5: '5×' }"
          aria-label="地形垂直夸张倍数"
          @change="(value: number) => emit('terrainExaggeration', value)"
        />
        <div class="terrain-lighting-row"><span>太阳光照</span><a-switch size="small" :checked="terrainLighting" @change="(value: boolean) => emit('terrainLighting', value)" /></div>
        <a-alert v-if="terrainError" type="warning" :message="terrainError" show-icon class="terrain-alert" />
      </section>
    </div>

    <a-modal
      :open="settingsCategory !== undefined"
      :title="settingsCategory ? `${settingsCategory.name}设置` : ''"
      :footer="null"
      :width="420"
      @cancel="closeSettings"
    >
      <template v-if="settingsCategory">
        <div class="modal-block">
          <div class="setting-head"><span>不透明度</span><span>{{ settingsOpacity }}%</span></div>
          <a-slider
            :value="settingsOpacity"
            :min="0"
            :max="100"
            :step="5"
            :aria-label="`${settingsCategory.name}不透明度`"
            @change="handleSettingsOpacity"
          />
        </div>
        <a-collapse class="advanced-collapse">
          <a-collapse-panel key="advanced" header="高级设置">
            <div class="setting-head"><span>供应商</span></div>
            <a-radio-group :value="settingsCategory.activeProviderId" class="provider-group" @change="handleSettingsProviderChange">
              <a-radio v-for="provider in settingsCategory.providers" :key="provider.id" :value="provider.id" class="provider-radio">
                <div class="provider-copy">
                  <div class="provider-name">{{ provider.name }}</div>
                  <div class="provider-description">{{ provider.description }}</div>
                </div>
              </a-radio>
            </a-radio-group>
          </a-collapse-panel>
        </a-collapse>
      </template>
    </a-modal>
  </a-drawer>
</template>

<style scoped>
.panel-title{display:flex;align-items:center;justify-content:space-between;width:100%}h2{margin:0;color:rgba(0,0,0,.88);font-size:20px;font-weight:600;line-height:28px}.panel-alert{margin-bottom:16px}.layer-spin{display:block;min-height:168px}.panel-section{padding:0 0 16px;margin:0 0 16px;border-bottom:1px solid rgba(5,5,5,.06)}.panel-section:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px;color:rgba(0,0,0,.65);font-size:12px;line-height:20px}.full-select{width:100%}.terrain-slider-head{display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:rgba(0,0,0,.65);font-size:13px;line-height:20px}.terrain-lighting-row{display:flex;align-items:center;justify-content:space-between;margin-top:4px;color:rgba(0,0,0,.65);font-size:13px;line-height:20px}.terrain-alert{margin-top:8px}.basemap-item{display:flex;align-items:center;gap:4px;min-height:48px;padding:6px 8px;border-radius:6px;cursor:pointer}.basemap-item.selected{background:rgba(22,119,255,.06)}.basemap-copy{flex:1;min-width:0;margin-left:4px}.basemap-name{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}.basemap-description{overflow:hidden;color:rgba(0,0,0,.45);font-size:12px;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.more-button{color:rgba(0,0,0,.45)}.setting-head{display:flex;align-items:center;justify-content:space-between;color:rgba(0,0,0,.65);font-size:12px;line-height:20px}.provider-group{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:8px}.provider-radio{display:flex;align-items:flex-start;margin:0}.provider-radio :deep(.ant-radio){margin-top:1px}.provider-copy{min-width:0}.provider-name{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}.provider-description{color:rgba(0,0,0,.45);font-size:12px;line-height:20px}
</style>
