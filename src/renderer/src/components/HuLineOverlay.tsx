import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import { huComparison } from '@renderer/thematic/populationCensus'
import styles from './HuLineOverlay.module.css'

export interface HuLineOverlayProps {
  viewer?: Cesium.Viewer
}

interface CardScratch {
  projected: Cesium.Cartesian2
  normal: Cesium.Cartesian3
  toCamera: Cesium.Cartesian3
}

const ANCHOR_VIEW_HEIGHT = 9000000
const eastAnchor = Cesium.Cartesian3.fromDegrees(119.5, 33)
const westAnchor = Cesium.Cartesian3.fromDegrees(96, 37.5)

function updateCard(
  current: Cesium.Viewer,
  element: HTMLDivElement | null,
  anchor: Cesium.Cartesian3,
  scratch: CardScratch
): void {
  if (!element) return
  let facing = true
  if (current.scene.mode === Cesium.SceneMode.SCENE3D) {
    current.scene.globe.ellipsoid.geodeticSurfaceNormal(anchor, scratch.normal)
    Cesium.Cartesian3.subtract(current.camera.positionWC, anchor, scratch.toCamera)
    facing = Cesium.Cartesian3.dot(scratch.normal, scratch.toCamera) > 0
  }
  const projected = facing
    ? Cesium.SceneTransforms.worldToWindowCoordinates(current.scene, anchor, scratch.projected)
    : undefined
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    element.style.display = 'none'
    return
  }
  const height = current.camera.positionCartographic.height
  const scale = Math.min(1.05, Math.max(0.5, height / ANCHOR_VIEW_HEIGHT))
  element.style.display = 'block'
  element.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`
}

export function HuLineOverlay({ viewer }: HuLineOverlayProps) {
  const eastRef = useRef<HTMLDivElement>(null)
  const westRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeViewer = viewer && !viewer.isDestroyed() ? viewer : undefined
    if (!activeViewer) {
      if (eastRef.current) eastRef.current.style.display = 'none'
      if (westRef.current) westRef.current.style.display = 'none'
      return
    }
    const eastScratch: CardScratch = {
      projected: new Cesium.Cartesian2(),
      normal: new Cesium.Cartesian3(),
      toCamera: new Cesium.Cartesian3()
    }
    const westScratch: CardScratch = {
      projected: new Cesium.Cartesian2(),
      normal: new Cesium.Cartesian3(),
      toCamera: new Cesium.Cartesian3()
    }

    function frame(): void {
      if (!activeViewer || activeViewer.isDestroyed()) return
      updateCard(activeViewer, eastRef.current, eastAnchor, eastScratch)
      updateCard(activeViewer, westRef.current, westAnchor, westScratch)
    }

    const removeListener = activeViewer.scene.postRender.addEventListener(frame)
    frame()
    return () => {
      removeListener()
    }
  }, [viewer])

  return (
    <>
      <div ref={eastRef} className={styles.huCard} style={{ display: 'none' }} aria-hidden="true">
        <div className={styles.huCardTitle}>胡线以东</div>
        <div className={styles.huCardRow}>
          <span>面积</span>
          <span className={styles.huCardValue}>{huComparison.eastAreaPct}%</span>
        </div>
        <div className={styles.huCardRow}>
          <span>人口</span>
          <span className={styles.huCardValueStrong}>{huComparison.eastPopPct}%</span>
        </div>
      </div>
      <div ref={westRef} className={styles.huCard} style={{ display: 'none' }} aria-hidden="true">
        <div className={styles.huCardTitle}>胡线以西</div>
        <div className={styles.huCardRow}>
          <span>面积</span>
          <span className={styles.huCardValue}>{huComparison.westAreaPct}%</span>
        </div>
        <div className={styles.huCardRow}>
          <span>人口</span>
          <span className={styles.huCardValueStrong}>{huComparison.westPopPct}%</span>
        </div>
      </div>
    </>
  )
}

export default HuLineOverlay
