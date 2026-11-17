<script setup lang="ts">
import { Checkbox } from 'ant-design-vue'
import { computed, h, nextTick, ref, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'

const props = defineProps<{ ready: boolean }>()
const emit = defineEmits<{ stepChange: [step: number] }>()

const legacyCompletedKey = 'guearth.first-use-guide.completed.v1'
const open = ref(false)
const current = ref(0)
const dontPromptAgain = ref(true)
let transitioning = false
let autoPromptChecked = false
let finishedThisCycle = false
const guideLocale = {
  ...zhCN,
  Tour: {
    ...zhCN.Tour,
    Finish: '完成'
  }
}

function readLegacyCompletion(): boolean {
  try {
    return window.localStorage.getItem(legacyCompletedKey) === 'true'
  } catch {
    return false
  }
}

function clearLegacyCompletion(): void {
  try {
    window.localStorage.removeItem(legacyCompletedKey)
  } catch {
    return
  }
}

function getTarget(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-guide-target="${name}"]`) ?? document.body
}

const steps = computed(() => [
  {
    title: '初始视角，重新认识地球🌏',
    description: '回到默认全球视角。',
    target: () => getTarget('home'),
    placement: 'top'
  },
  {
    title: '地图与地形图层🗺️',
    description: '切换地图样式、3D 地形与太阳光照。',
    target: () => getTarget('layers'),
    placement: 'top'
  },
  {
    title: '地理实验室🧪',
    description: '打开太阳、大气、水文、地貌等教学实验与专题图层。',
    target: () => getTarget('lab'),
    placement: 'top'
  },
  {
    title: '标注管理📌',
    description: '查看、编辑并定位已保存的标注。',
    target: () => getTarget('annotations'),
    placement: 'top'
  },
  {
    title: '绘制与清除✏️',
    description: '绘制点、线、面、箭头和文字，支持测距与测面积。',
    target: () => getTarget('drawing-tools'),
    placement: 'top'
  },
  {
    title: '搜索地点🔎',
    description: '输入地名快速定位并飞往目标位置。',
    target: () => getTarget('place-search'),
    placement: 'bottomLeft'
  },
  {
    title: '配置地图搜索密钥🔑',
    description: '在此填写高德或百度地图密钥并保存，即可启用地点搜索。',
    target: () => getTarget('map-credentials'),
    placement: 'left'
  },
  {
    title: 'EOQ 智能助手🤖',
    description: '点击打开 EOQ 地理教学助手。',
    target: () => getTarget('assistant'),
    placement: 'top'
  },
  {
    title: '配置 AI 模型🧠',
    description: h('div', { style: { display: 'grid', gap: '12px' } }, [
      h('div', '在这里添加 AI 服务商、密钥和模型并设为默认，即可开始对话。'),
      h(Checkbox, {
        checked: dontPromptAgain.value,
        'onUpdate:checked': (checked: boolean) => {
          dontPromptAgain.value = checked
        }
      }, { default: () => '下次不再提示' })
    ]),
    target: () => getTarget('ai-provider-settings'),
    placement: 'bottom'
  }
])

function start(): void {
  finishedThisCycle = false
  current.value = 0
  open.value = true
  emit('stepChange', 0)
}

async function handleChange(nextStep: number): Promise<void> {
  if (transitioning) return
  transitioning = true
  emit('stepChange', nextStep)
  await nextTick()
  if ([6, 7, 8].includes(nextStep) || [6, 7, 8].includes(current.value)) {
    await new Promise((resolve) => window.setTimeout(resolve, 320))
  }
  current.value = nextStep
  await nextTick()
  transitioning = false
}

function savePreference(value: boolean): void {
  dontPromptAgain.value = value
  void window.guEarth.settings.update({ setupGuideDismissed: value }).catch(() => undefined)
}

function close(): void {
  open.value = false
  queueMicrotask(() => {
    if (!finishedThisCycle) savePreference(true)
  })
}

function finish(): void {
  finishedThisCycle = true
  open.value = false
  savePreference(dontPromptAgain.value)
}

async function checkFirstUse(): Promise<void> {
  if (!props.ready || autoPromptChecked) return
  autoPromptChecked = true
  try {
    const settings = await window.guEarth.settings.get()
    if (settings.setupGuideDismissed !== null) {
      dontPromptAgain.value = settings.setupGuideDismissed
      if (!settings.setupGuideDismissed && props.ready && !open.value) start()
      return
    }
    if (readLegacyCompletion()) {
      dontPromptAgain.value = true
      try {
        await window.guEarth.settings.update({ setupGuideDismissed: true })
      } catch {
        return
      }
      clearLegacyCompletion()
      return
    }
    dontPromptAgain.value = true
    if (props.ready && !open.value) start()
  } catch {
    dontPromptAgain.value = true
    if (props.ready && !open.value) start()
  }
}

watch(() => props.ready, () => {
  void checkFirstUse()
}, { immediate: true })

defineExpose({ start })
</script>

<template>
  <a-config-provider :locale="guideLocale">
    <a-tour
      :open="open"
      :current="current"
      :steps="steps"
      :z-index="1200"
      :mask="{ color: 'rgba(0, 0, 0, 0.45)' }"
      @change="handleChange"
      @close="close"
      @finish="finish"
    />
  </a-config-provider>
</template>
