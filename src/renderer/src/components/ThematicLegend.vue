<script setup lang="ts">
import { computed } from 'vue'
import { useClimateStore } from '@renderer/stores/climate'
import { climateZones } from '@renderer/thematic/climateZones'
import { koppenZones } from '@renderer/thematic/koppenZones'
import { windRampStops } from '@renderer/thematic/windField'
import { densityBins } from '@renderer/thematic/populationCensus'
import { CITY_TIER_META, FUNCTIONAL_ZONES } from '@renderer/thematic/urbanCities'
import { AGRI_CATEGORY_META } from '@renderer/thematic/agriculturalRegions'
import { industrialBases } from '@renderer/thematic/industrialBases'

const store = useClimateStore()

const windGradient = computed(() => `linear-gradient(90deg, ${windRampStops.join(', ')})`)
const zoneEntries = climateZones.map((zone) => ({ name: zone.name, color: zone.color }))
const koppenEntries = koppenZones.map((zone) => ({ name: zone.name, color: zone.borderColor ?? zone.color }))
const densityEntries = densityBins.map((bin) => ({ label: bin.label, color: bin.color }))
const tierEntries = CITY_TIER_META.map((meta) => ({ name: meta.name, color: meta.color }))
const functionalZoneEntries = FUNCTIONAL_ZONES.map((spec) => ({ name: spec.name, color: spec.color }))
const agriCategoryEntries = AGRI_CATEGORY_META.map((meta) => ({ name: meta.name, color: meta.color }))
const industrialBaseEntries = industrialBases.map((base) => ({ name: base.name, color: base.color }))
</script>

<template>
  <div v-if="store.hasActiveOverlay" class="thematic-legend" aria-label="专题图层图例">
    <div class="legend-title">图例</div>
    <div v-if="store.overlays['wind-particles']" class="legend-group">
      <div class="wind-ramp" :style="{ background: windGradient }"></div>
      <div class="legend-row"><span>风弱</span><span>风强</span></div>
    </div>
    <div v-if="store.overlays['rain-belt']" class="legend-item">
      <span class="swatch" style="background: #1677ff"></span><span>降水雨带</span>
    </div>
    <div v-if="store.overlays['summer-monsoon']" class="legend-item">
      <span class="swatch" style="background: #f5222d"></span><span>夏季风（偏南气流）</span>
    </div>
    <div v-if="store.overlays['winter-monsoon']" class="legend-item">
      <span class="swatch" style="background: #1677ff"></span><span>冬季风（偏北气流）</span>
    </div>
    <div v-if="store.overlays['pressure-belts']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>低压带</span></div>
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>高压带</span></div>
      <div class="legend-item"><span class="swatch" style="background: #722ed1"></span><span>风带箭头</span></div>
    </div>
    <div v-if="store.overlays['koppen-zones']" class="legend-group">
      <div v-for="zone in koppenEntries" :key="zone.name" class="legend-item">
        <span class="swatch" :style="{ background: zone.color }"></span><span>{{ zone.name }}</span>
      </div>
    </div>
    <div v-if="store.overlays['enso']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>海温距平 ≤ -1.5℃</span></div>
      <div class="legend-item"><span class="swatch" style="background: #bae7ff"></span><span>接近正常</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>距平 +0.5~+2℃</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa541c"></span><span>距平 ≥ +2℃</span></div>
      <div class="legend-item"><span class="swatch" style="background: #531dab"></span><span>Niño3.4 关键监测区</span></div>
    </div>
    <div v-if="store.overlays['frontal-cyclone']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>暖锋</span></div>
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>冷锋</span></div>
      <div class="legend-item"><span class="swatch" style="background: #69b1ff"></span><span>雨区</span></div>
    </div>
    <div v-if="store.overlays['typhoon']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>热带低压</span></div>
      <div class="legend-item"><span class="swatch" style="background: #faad14"></span><span>热带风暴</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>台风</span></div>
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>超强台风</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa541c"></span><span>历史台风路径与结构锚点</span></div>
    </div>
    <div v-if="store.overlays['ocean-currents']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>暖流</span></div>
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>寒流</span></div>
    </div>
    <div v-if="store.overlays['climate-zones']" class="legend-group">
      <div v-for="zone in zoneEntries" :key="zone.name" class="legend-item">
        <span class="swatch" :style="{ background: zone.color }"></span><span>{{ zone.name }}</span>
      </div>
    </div>
    <div v-if="store.overlays['coriolis-demo']" class="legend-group">
      <div class="legend-item"><span class="swatch swatch-dashed"></span><span>惯性直线（不偏转）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>北半球轨迹 · 右偏</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>南半球轨迹 · 左偏</span></div>
    </div>
    <div v-if="store.overlays['temperature-zones']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>热带（有直射）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #52c41a"></span><span>温带（四季分明）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>寒带（极昼极夜）</span></div>
      <div class="legend-item"><span class="swatch swatch-dashed"></span><span>回归线 / 极圈</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16; height: 8px; border-radius: 50%"></span><span>太阳直射点</span></div>
    </div>
    <div v-if="store.overlays['plate-tectonics']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>消亡边界（碰撞/俯冲）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #1677ff"></span><span>生长边界（张裂）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>转换边界（错断）</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa541c"></span><span>典型火山</span></div>
      <div class="legend-item"><span class="swatch" style="background: #faad14"></span><span>地震 M4.5+</span></div>
      <div class="legend-item"><span class="swatch" style="background: #fa8c16"></span><span>地震 M5.5+</span></div>
      <div class="legend-item"><span class="swatch" style="background: #f5222d"></span><span>地震 M7+</span></div>
    </div>
    <div v-if="store.overlays['province-population']" class="legend-group">
      <div class="legend-heading">人口密度（人/km²）</div>
      <div v-for="bin in densityEntries" :key="bin.label" class="legend-item">
        <span class="swatch" :style="{ background: bin.color }"></span><span>{{ bin.label }}</span>
      </div>
    </div>
    <div v-if="store.overlays['hu-line']" class="legend-group">
      <div class="legend-item"><span class="swatch swatch-dashed"></span><span>胡焕庸线（黑河—腾冲）</span></div>
    </div>
    <div v-if="store.overlays['migration-flows']" class="legend-group">
      <div class="legend-item"><span class="swatch" style="height: 5px; background: #fa8c16"></span><span>主要迁移流向</span></div>
      <div class="legend-item"><span class="swatch" style="height: 3px; background: rgba(250, 140, 22, 0.72)"></span><span>次要迁移流向</span></div>
      <div class="legend-item legend-hint"><span>线宽表示规模，放大后显示次要路线标签</span></div>
    </div>
    <div v-if="store.overlays['city-tiers']" class="legend-group">
      <div class="legend-heading">城市等级（服务半径示意）</div>
      <div v-for="tier in tierEntries" :key="tier.name" class="legend-item">
        <span class="swatch swatch-dot" :style="{ background: tier.color }"></span><span>{{ tier.name }}</span>
      </div>
      <div class="legend-item legend-hint"><span>圆圈为该等级典型服务范围示意</span></div>
    </div>
    <div v-if="store.overlays['functional-zones']" class="legend-group">
      <div class="legend-heading">武汉城市功能分区（真实区位）</div>
      <div v-for="zone in functionalZoneEntries" :key="zone.name" class="legend-item">
        <span class="swatch" :style="{ background: zone.color }"></span><span>{{ zone.name }}</span>
      </div>
    </div>
    <div v-if="store.overlays['agri-regions']" class="legend-group">
      <div class="legend-heading">农业区划</div>
      <div v-for="category in agriCategoryEntries" :key="category.name" class="legend-item">
        <span class="swatch" :style="{ background: category.color }"></span><span>{{ category.name }}</span>
      </div>
      <div class="legend-item legend-hint"><span>点击产区查看作物与区位因素</span></div>
    </div>
    <div v-if="store.overlays['industrial-bases']" class="legend-group">
      <div class="legend-heading">四大工业基地</div>
      <div v-for="base in industrialBaseEntries" :key="base.name" class="legend-item">
        <span class="swatch" :style="{ background: base.color }"></span><span>{{ base.name }}</span>
      </div>
    </div>
    <div v-if="store.overlays['industrial-transfers']" class="legend-group">
      <div class="legend-heading">产业转移流向</div>
      <div class="legend-item"><span class="swatch" style="height: 5px; background: #722ed1"></span><span>主要转移方向</span></div>
      <div class="legend-item"><span class="swatch" style="height: 3px; background: rgba(114, 46, 209, 0.72)"></span><span>次要转移方向</span></div>
      <div class="legend-item legend-hint"><span>自东向西、由沿海向内陆梯度转移</span></div>
    </div>
    <div v-if="store.overlays['hsr-network']" class="legend-group">
      <div class="legend-heading">高铁网络（随年份生长）</div>
      <div class="legend-item"><span class="swatch" style="height: 5px; background: #d4380d"></span><span>已开通高铁干线</span></div>
      <div class="legend-item legend-hint"><span>打开「交通运输布局」面板播放年份动画</span></div>
    </div>
  </div>
</template>

<style scoped>
.thematic-legend {
  position: absolute;
  bottom: 80px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 148px;
  max-width: 208px;
  max-height: 340px;
  overflow-y: auto;
  padding: 8px 12px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
}

.legend-title {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
  margin-bottom: 2px;
}

.legend-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-heading {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.legend-hint {
  align-items: flex-start;
  color: rgba(0, 0, 0, 0.45);
  line-height: 16px;
}

.swatch {
  flex: none;
  width: 14px;
  height: 4px;
  border-radius: 2px;
}

.swatch-dashed {
  height: 0;
  border-radius: 0;
  border-top: 2px dashed rgba(0, 0, 0, 0.45);
}

.swatch-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.wind-ramp {
  width: 100%;
  height: 6px;
  border-radius: 3px;
}

.legend-row {
  display: flex;
  justify-content: space-between;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 20px;
}
</style>
