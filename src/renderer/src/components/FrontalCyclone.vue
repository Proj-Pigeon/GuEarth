<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const props = defineProps<{ viewer?: Cesium.Viewer }>()

const overlayRef = ref<HTMLDivElement>()
const ANCHOR = Cesium.Cartesian3.fromDegrees(125, 34)
const ANCHOR_VIEW_HEIGHT = 4800000
const scratch = new Cesium.Cartesian2()
const scratchNormal = new Cesium.Cartesian3()
const scratchToCamera = new Cesium.Cartesian3()
let activeViewer: Cesium.Viewer | undefined
let removeListener: (() => void) | undefined

function frame(): void {
  const current = activeViewer
  const element = overlayRef.value
  if (!current || current.isDestroyed() || !element) return
  let facing = true
  if (current.scene.mode === Cesium.SceneMode.SCENE3D) {
    current.scene.globe.ellipsoid.geodeticSurfaceNormal(ANCHOR, scratchNormal)
    Cesium.Cartesian3.subtract(current.camera.positionWC, ANCHOR, scratchToCamera)
    facing = Cesium.Cartesian3.dot(scratchNormal, scratchToCamera) > 0
  }
  const projected = facing ? Cesium.SceneTransforms.worldToWindowCoordinates(current.scene, ANCHOR, scratch) : undefined
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    element.style.display = 'none'
    return
  }
  const height = current.camera.positionCartographic.height
  const scale = Math.min(1.1, Math.max(0.45, height / ANCHOR_VIEW_HEIGHT))
  element.style.display = 'block'
  element.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`
}

watch(
  () => props.viewer,
  (viewer) => {
    removeListener?.()
    activeViewer = viewer && !viewer.isDestroyed() ? toRaw(viewer) : undefined
    removeListener = activeViewer ? activeViewer.scene.postRender.addEventListener(frame) : undefined
  },
  { immediate: true, flush: 'post' }
)

onBeforeUnmount(() => {
  removeListener?.()
  removeListener = undefined
})

interface Dot { x: number; y: number }

const warmRainDots: Dot[] = []
for (let row = 0; row < 3; row += 1) {
  for (let i = 0; i <= 9; i += 1) {
    const t = i / 9
    const x = 236 + t * 108 - row * 9
    const y = 128 + t * 96 + row * 13
    warmRainDots.push({ x, y })
  }
}

const coldRainDots: Dot[] = []
for (let row = 0; row < 2; row += 1) {
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6
    const x = 150 - t * 46 - row * 8
    const y = 198 + t * 74 + row * 11
    coldRainDots.push({ x, y })
  }
}

const coldFrontBarbs: Array<{ x: number; y: number; angle: number }> = [
  { x: 156, y: 213, angle: 35 },
  { x: 136, y: 241, angle: 40 },
  { x: 116, y: 271, angle: 48 }
]

const warmFrontBarbs: Array<{ x: number; y: number; angle: number }> = [
  { x: 221, y: 199, angle: -60 },
  { x: 252, y: 217, angle: -55 },
  { x: 282, y: 238, angle: -55 }
]
</script>

<template>
  <div ref="overlayRef" class="cyclone-overlay" style="display: none" aria-hidden="true">
    <svg viewBox="0 0 360 360" width="360" height="360">
      <defs>
        <marker id="fc-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="dc.neutralArrow" />
        </marker>
        <radialGradient id="fc-low" cx="50%" cy="50%" r="50%">
          <stop offset="0%" :stop-color="dc.primary" stop-opacity="0.16" />
          <stop offset="100%" :stop-color="dc.primary" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="356" height="356" rx="12" fill="rgba(255,255,255,0.9)" :stroke="dc.hairline" />
      <circle cx="180" cy="180" r="130" fill="url(#fc-low)" />
      <g fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.2" stroke-dasharray="3 6" stroke-linecap="round">
        <circle cx="180" cy="180" r="62" />
        <circle cx="180" cy="180" r="96" />
        <circle cx="180" cy="180" r="128" />
      </g>
      <g fill="none" :stroke="dc.neutralArrow" stroke-width="1.8">
        <path d="M 262 112 A 96 96 0 0 0 98 112" marker-end="url(#fc-arrow)" />
        <path d="M 98 266 A 96 96 0 0 0 264 264" marker-end="url(#fc-arrow)" />
        <path d="M 272 190 L 288 176" marker-end="url(#fc-arrow)" />
        <path d="M 132 258 L 148 274" marker-end="url(#fc-arrow)" />
      </g>
      <g :fill="dc.coldAirSoft">
        <circle v-for="d in coldRainDots" :key="`c-${d.x}-${d.y}`" :cx="d.x" :cy="d.y" r="2.2" />
      </g>
      <g :fill="dc.coldAirSoft">
        <circle v-for="d in warmRainDots" :key="`w-${d.x}-${d.y}`" :cx="d.x" :cy="d.y" r="2.2" />
      </g>
      <path d="M 180 180 Q 140 233 100 296" fill="none" :stroke="dc.coldAir" stroke-width="3.5" stroke-linecap="round" />
      <g :fill="dc.coldAir">
        <polygon v-for="b in coldFrontBarbs" :key="`cb-${b.x}`" points="0,-5.5 10,0 0,5.5" :transform="`translate(${b.x} ${b.y}) rotate(${b.angle})`" />
      </g>
      <path d="M 180 180 Q 250 208 305 256" fill="none" :stroke="dc.warmAir" stroke-width="3.5" stroke-linecap="round" />
      <g :fill="dc.warmAir">
        <path v-for="b in warmFrontBarbs" :key="`wb-${b.x}`" d="M 0 -5.5 A 5.5 5.5 0 0 1 0 5.5" :transform="`translate(${b.x} ${b.y}) rotate(${b.angle})`" />
      </g>
      <circle cx="180" cy="180" r="13" :fill="dc.primary" />
      <text x="180" y="180" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="#ffffff" :font-family="diagramFont">低</text>
      <g :font-family="diagramFont" font-size="11" text-anchor="middle">
        <text x="180" y="212" :fill="dc.inkSecondary">低压中心</text>
        <text x="228" y="286" :fill="dc.warmAir">暖气团</text>
        <text x="140" y="112" :fill="dc.coldAir">冷气团</text>
        <text x="82" y="240" :fill="dc.coldAir">冷气团</text>
        <text x="318" y="284" :fill="dc.warmAir" font-weight="600">暖锋</text>
        <text x="78" y="320" :fill="dc.coldAir" font-weight="600">冷锋</text>
        <text x="314" y="120" :fill="dc.inkSecondary">宽阔雨带</text>
        <text x="58" y="180" :fill="dc.inkSecondary">狭窄雨带</text>
      </g>
      <g :font-family="diagramFont" font-size="10" :fill="dc.inkTertiary">
        <circle cx="24" cy="344" r="2.2" :fill="dc.coldAirSoft" stroke="none" />
        <text x="32" y="348">雨区</text>
        <text x="180" y="348" text-anchor="middle">北半球锋面气旋（俯视）：气流逆时针辐合，锋面整体自西向东移动</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.cyclone-overlay {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 9;
}
</style>
