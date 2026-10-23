<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const emit = defineEmits<{ close: [] }>()

type LayerId = 'crust' | 'mantle' | 'outer-core' | 'inner-core'

interface LayerMeta {
  name: string
  depth: string
  color: string
  facts: string[]
}

const layers: Record<LayerId, LayerMeta> = {
  crust: {
    name: '地壳',
    depth: '平均约 17 千米（大陆 35~40 千米、大洋 5~10 千米）',
    color: dc.crust,
    facts: ['由岩石组成的坚硬外壳，大陆地壳厚、大洋地壳薄', '硅铝层（上层）与硅镁层（下层），大洋地壳往往缺失硅铝层', '地震波速度变化——莫霍面（莫霍洛维奇不连续面）是其与地幔的分界']
  },
  mantle: {
    name: '地幔',
    depth: '17~2900 千米',
    color: dc.mantle,
    facts: ['占地球体积约 80%，上地幔上部存在软流层（软流圈），一般认为是岩浆的主要发源地', '岩石圈 = 地壳 + 上地幔顶部（软流层以上），在软流层上“漂移”运动，是板块构造学说的基础', '下地幔物质致密、温度压力极高；与地核的分界为古登堡面']
  },
  'outer-core': {
    name: '外地核',
    depth: '2900~5150 千米',
    color: dc.outerCore,
    facts: ['横波（S 波）不能通过外地核，推断其为液态（熔融态铁镍）', '液态金属铁镍的流动形成地球磁场', '与内地核的分界为莱曼面（5150 千米）']
  },
  'inner-core': {
    name: '内地核',
    depth: '5150~6371 千米',
    color: dc.innerCore,
    facts: ['纵波在内地核传播时速度加快，推断其为固态（超高压下铁镍固化）', '温度约 4000~6000℃，与太阳表面相当', '地心压力约为大气压的 300 多万倍']
  }
}

const active = ref<LayerId>('crust')
const meta = computed(() => layers[active.value])

const arcs: Array<{ id: LayerId; r: number }> = [
  { id: 'inner-core', r: 40 },
  { id: 'outer-core', r: 86 },
  { id: 'mantle', r: 138 },
  { id: 'crust', r: 158 }
]

const callouts: Array<{ id: LayerId; x: number; y: number; anchorX: number; anchorY: number; side: 'left' | 'right' }> = [
  { id: 'crust', x: 44, y: 40, anchorX: 100, anchorY: 40, side: 'left' },
  { id: 'mantle', x: 40, y: 96, anchorX: 82, anchorY: 118, side: 'left' },
  { id: 'outer-core', x: 306, y: 84, anchorX: 262, anchorY: 116, side: 'right' },
  { id: 'inner-core', x: 300, y: 148, anchorX: 206, anchorY: 172, side: 'right' }
]

const boundaryNotes = [
  '莫霍面（地下约 17 千米）：纵波与横波速度都明显加快——地壳与地幔的分界',
  '古登堡面（地下约 2900 千米）：纵波速度骤降、横波消失——地幔与外地核的分界，据此推断外地核为液态',
  '地震波：纵波（P 波）可通过固液气三态，横波（S 波）只能通过固体，是研究地球内部的“探照灯”'
]
</script>

<template>
  <div class="layers-panel" role="group" aria-label="地球圈层结构">
    <div class="panel-header">
      <span class="panel-title">地球的圈层结构</span>
      <a-button type="text" size="small" aria-label="关闭地球圈层结构" @click="emit('close')">
        <CloseOutlined />
      </a-button>
    </div>
    <svg viewBox="0 0 340 210" class="earth-svg" role="img" aria-label="地球内部圈层切球剖面示意">
      <defs>
        <radialGradient id="el-crust" cx="50%" cy="100%" r="100%">
          <stop offset="88%" :stop-color="dc.crust" stop-opacity="0.55" />
          <stop offset="100%" :stop-color="dc.crust" stop-opacity="0.85" />
        </radialGradient>
        <radialGradient id="el-mantle" cx="50%" cy="100%" r="100%">
          <stop offset="60%" :stop-color="dc.mantle" stop-opacity="0.55" />
          <stop offset="100%" :stop-color="dc.mantle" stop-opacity="0.9" />
        </radialGradient>
        <radialGradient id="el-outer-core" cx="50%" cy="100%" r="160%">
          <stop offset="40%" :stop-color="dc.outerCore" stop-opacity="0.65" />
          <stop offset="100%" :stop-color="dc.outerCore" stop-opacity="1" />
        </radialGradient>
        <radialGradient id="el-inner-core" cx="50%" cy="100%" r="220%">
          <stop offset="30%" stop-color="#ff7a45" />
          <stop offset="100%" :stop-color="dc.innerCore" />
        </radialGradient>
      </defs>
      <g v-for="arc in [...arcs].reverse()" :key="arc.id">
        <path
          :d="`M ${170 - arc.r} 178 A ${arc.r} ${arc.r} 0 0 1 ${170 + arc.r} 178 Z`"
          :fill="`url(#el-${arc.id})`"
          :opacity="active === arc.id ? 1 : 0.42"
          :stroke="active === arc.id ? arc.id === 'crust' || arc.id === 'mantle' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)'"
          :stroke-width="active === arc.id ? 1.4 : 0.8"
          class="layer-arc"
          @click="active = arc.id"
        />
      </g>
      <line x1="0" y1="178" x2="340" y2="178" stroke="rgba(0,0,0,0.32)" stroke-width="1.5" />
      <g :font-family="diagramFont" font-size="10">
        <g v-for="c in callouts" :key="c.id" class="callout" :class="{ 'callout-active': active === c.id }" @click="active = c.id">
          <path :d="`M ${c.x} ${c.y} L ${c.anchorX} ${c.anchorY}`" :stroke="layers[c.id].color" stroke-width="1" opacity="0.7" />
          <circle :cx="c.anchorX" :cy="c.anchorY" r="2.2" :fill="layers[c.id].color" />
          <text :x="c.x" :y="c.y - 5" :text-anchor="c.side === 'left' ? 'start' : 'end'" :fill="active === c.id ? dc.ink : dc.inkSecondary" :font-weight="active === c.id ? 600 : 400">{{ layers[c.id].name }}</text>
        </g>
        <text x="12" y="192" :fill="dc.inkTertiary">莫霍面</text>
        <text x="328" y="192" text-anchor="end" :fill="dc.inkTertiary">古登堡面</text>
        <path d="M 40 186 L 60 178 M 300 186 L 256 178" stroke="rgba(0,0,0,0.25)" stroke-width="0.8" />
        <text x="170" y="206" text-anchor="middle" :fill="dc.inkTertiary">剖面比例经夸张示意（真实地壳仅约地球半径 1/375）</text>
      </g>
    </svg>
    <div class="layer-tabs">
      <button v-for="(value, id) in layers" :key="id" class="layer-tab" :class="{ 'layer-tab-active': active === id }" :style="{ borderColor: value.color }" @click="active = id as LayerId">
        <span class="tab-dot" :style="{ background: value.color }"></span>{{ value.name }}
      </button>
    </div>
    <div class="layer-depth">{{ meta.name }} · 深度范围：{{ meta.depth }}</div>
    <div v-for="fact in meta.facts" :key="fact" class="fact">· {{ fact }}</div>
    <div class="section-title">两个不连续面与地震波</div>
    <div v-for="note in boundaryNotes" :key="note" class="fact">{{ note }}</div>
  </div>
</template>

<style scoped>
.layers-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 380px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: #ffffff;
  border: 1px solid rgba(5, 5, 5, 0.06);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary, 0 4px 12px rgba(0, 0, 0, 0.08));
  z-index: 10;
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

.earth-svg {
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.layer-arc {
  cursor: pointer;
  transition: opacity 0.25s ease;
}

.callout {
  cursor: pointer;
}

.callout text {
  transition: fill 0.2s ease;
}

.layer-tabs {
  display: flex;
  gap: 6px;
}

.layer-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1.5px solid rgba(5, 5, 5, 0.1);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.02);
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s ease, background 0.2s ease;
}

.layer-tab:hover {
  background: #ffffff;
}

.layer-tab:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 2px;
}

.layer-tab-active {
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}

.tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.layer-depth {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.fact {
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 19px;
}

.section-title {
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
</style>
