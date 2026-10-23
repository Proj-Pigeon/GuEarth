<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw, watch } from 'vue'
import * as Cesium from 'cesium'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'

const props = defineProps<{ viewer?: Cesium.Viewer }>()

const overlayRef = ref<HTMLDivElement>()
const ANCHOR = Cesium.Cartesian3.fromDegrees(138, 15)
const ANCHOR_VIEW_HEIGHT = 6200000
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

function spiralArm(startAngle: number): string {
  const cx = 170
  const cy = 168
  const pts: string[] = []
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24
    const angle = ((startAngle + t * 300) * Math.PI) / 180
    const r = 34 + t * 104
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

const arms = [spiralArm(20), spiralArm(140), spiralArm(260)]

const inflowArrows: Array<{ x: number; y: number; angle: number }> = [
  { x: 300, y: 96, angle: 145 },
  { x: 62, y: 122, angle: -55 },
  { x: 100, y: 286, angle: -20 },
  { x: 268, y: 272, angle: -160 }
]
</script>

<template>
  <div ref="overlayRef" class="typhoon-overlay" style="display: none" aria-hidden="true">
    <svg viewBox="0 0 340 340" width="340" height="340">
      <defs>
        <radialGradient id="ty-eyewall" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stop-color="#f5222d" stop-opacity="0" />
          <stop offset="78%" stop-color="#f5222d" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#f5222d" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="ty-cloud" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="70%" stop-color="#91caff" stop-opacity="0.10" />
          <stop offset="100%" stop-color="#91caff" stop-opacity="0.22" />
        </radialGradient>
        <marker id="ty-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" :fill="dc.neutralArrow" />
        </marker>
        <marker id="ty-head-orange" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" :fill="dc.energy" />
        </marker>
      </defs>
      <rect x="2" y="2" width="336" height="336" rx="12" fill="rgba(255,255,255,0.9)" :stroke="dc.hairline" />
      <circle cx="170" cy="168" r="142" fill="url(#ty-cloud)" />
      <g class="typhoon-spin">
        <g fill="none" :stroke="dc.energy" stroke-width="6" stroke-linecap="round" opacity="0.32">
          <path v-for="arm in arms" :key="arm" :d="arm" />
        </g>
        <g fill="none" :stroke="dc.energy" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 8" opacity="0.9">
          <path v-for="arm in arms" :key="arm" :d="arm" marker-end="url(#ty-head-orange)" />
        </g>
      </g>
      <circle cx="170" cy="168" r="34" fill="url(#ty-eyewall)" />
      <circle cx="170" cy="168" r="30" fill="none" :stroke="dc.warmAir" stroke-width="2" opacity="0.85" />
      <circle cx="170" cy="168" r="15" fill="#ffffff" :stroke="dc.warmAir" stroke-width="2" />
      <text x="170" y="168" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="600" :fill="dc.warmAir" :font-family="diagramFont">台风眼</text>
      <g fill="none" :stroke="dc.neutralArrow" stroke-width="1.6" marker-end="url(#ty-head)">
        <path v-for="a in inflowArrows" :key="`${a.x}-${a.y}`" :d="`M ${a.x} ${a.y} l 26 0`" :transform="`rotate(${a.angle} ${a.x} ${a.y})`" />
      </g>
      <g :font-family="diagramFont" text-anchor="middle">
        <text x="252" y="112" font-size="11" font-weight="600" :fill="dc.warmAir">眼墙</text>
        <text x="252" y="126" font-size="10" :fill="dc.inkSecondary">狂风暴雨最强</text>
        <path d="M 232 118 L 202 140" :stroke="dc.warmAirSoft" stroke-width="1" fill="none" />
        <text x="66" y="52" font-size="10.5" :fill="dc.inkSecondary">气流逆时针向中心辐合</text>
        <text x="20" y="262" font-size="11" font-weight="600" :fill="dc.energy" text-anchor="start">漩涡风雨区</text>
        <text x="20" y="277" font-size="10" :fill="dc.inkSecondary" text-anchor="start">外围螺旋云雨带</text>
        <path d="M 72 284 L 92 296" :stroke="dc.energySoft" stroke-width="1" fill="none" />
      </g>
      <text x="170" y="330" text-anchor="middle" font-size="10.5" :fill="dc.inkTertiary" :font-family="diagramFont">北半球台风（热带气旋）俯视结构示意</text>
    </svg>
  </div>
</template>

<style scoped>
.typhoon-overlay {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 9;
}

.typhoon-spin {
  transform-origin: 170px 168px;
  animation: typhoon-spin 30s linear infinite;
}

@keyframes typhoon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .typhoon-spin {
    animation: none;
  }
}
</style>
