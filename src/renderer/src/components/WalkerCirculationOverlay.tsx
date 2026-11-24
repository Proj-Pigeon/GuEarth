import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import { ensoPhaseMeta, type EnsoPhase } from '@renderer/thematic/ensoPhases'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'
import styles from './WalkerCirculationOverlay.module.css'

export interface WalkerCirculationOverlayProps {
  viewer?: Cesium.Viewer
  phase: EnsoPhase
}

interface FlowPath {
  d: string
  color: string
  width: number
  dashed?: boolean
  faded?: boolean
}

const ANCHOR = Cesium.Cartesian3.fromDegrees(-155, 0)
const ANCHOR_VIEW_HEIGHT = 9500000

const phaseFlows: Record<EnsoPhase, FlowPath[]> = {
  normal: [
    { d: 'M 96 150 C 90 110 100 72 122 52', color: dc.warmAir, width: 3 },
    { d: 'M 130 46 Q 195 26 258 44', color: dc.vaporFlow, width: 3 },
    { d: 'M 274 50 C 286 78 292 112 294 146', color: dc.coldAir, width: 3 },
    { d: 'M 278 152 Q 190 178 108 154', color: dc.vaporFlow, width: 3 }
  ],
  'el-nino': [
    { d: 'M 200 150 C 194 112 202 80 218 62', color: dc.warmAir, width: 3 },
    { d: 'M 226 56 Q 264 46 296 58', color: dc.vaporFlow, width: 3 },
    { d: 'M 306 68 C 314 94 318 120 320 146', color: dc.coldAir, width: 2.2, dashed: true },
    { d: 'M 312 152 Q 254 172 200 156', color: dc.vaporFlow, width: 2, dashed: true },
    { d: 'M 182 152 Q 130 170 92 158', color: dc.vaporFlow, width: 1.6, dashed: true, faded: true }
  ],
  'la-nina': [
    { d: 'M 88 150 C 80 106 92 66 116 44', color: dc.warmAir, width: 3.6 },
    { d: 'M 126 38 Q 196 16 268 40', color: dc.vaporFlow, width: 3.6 },
    { d: 'M 286 48 C 300 80 306 116 308 148', color: dc.coldAir, width: 3.6 },
    { d: 'M 294 154 Q 190 184 94 156', color: dc.vaporFlow, width: 3.6 }
  ]
}

const thermoclines: Record<EnsoPhase, string> = {
  normal: 'M 16 168 Q 100 128 200 124 Q 300 120 368 142',
  'el-nino': 'M 16 156 Q 110 130 200 128 Q 296 126 368 132',
  'la-nina': 'M 16 176 Q 96 124 200 120 Q 302 118 368 148'
}

export function WalkerCirculationOverlay({ viewer, phase }: WalkerCirculationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeViewer = viewer && !viewer.isDestroyed() ? viewer : undefined
    if (!activeViewer) {
      if (overlayRef.current) overlayRef.current.style.display = 'none'
      return
    }
    const scratch = new Cesium.Cartesian2()
    const scratchNormal = new Cesium.Cartesian3()
    const scratchToCamera = new Cesium.Cartesian3()

    function frame(): void {
      const element = overlayRef.current
      if (!activeViewer || activeViewer.isDestroyed() || !element) return
      let facing = true
      if (activeViewer.scene.mode === Cesium.SceneMode.SCENE3D) {
        activeViewer.scene.globe.ellipsoid.geodeticSurfaceNormal(ANCHOR, scratchNormal)
        Cesium.Cartesian3.subtract(activeViewer.camera.positionWC, ANCHOR, scratchToCamera)
        facing = Cesium.Cartesian3.dot(scratchNormal, scratchToCamera) > 0
      }
      const projected = facing
        ? Cesium.SceneTransforms.worldToWindowCoordinates(activeViewer.scene, ANCHOR, scratch)
        : undefined
      if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
        element.style.display = 'none'
        return
      }
      const height = activeViewer.camera.positionCartographic.height
      const scale = Math.min(1.05, Math.max(0.4, height / ANCHOR_VIEW_HEIGHT))
      element.style.display = 'block'
      element.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`
    }

    const removeListener = activeViewer.scene.postRender.addEventListener(frame)
    frame()
    return () => {
      removeListener()
    }
  }, [viewer])

  return (
    <div ref={overlayRef} className={styles.walkerOverlay} style={{ display: 'none' }} aria-hidden="true">
      <svg viewBox="0 0 380 200" width="380" height="200">
        <defs>
          <linearGradient id="wk-ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#69b1ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0958d9" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="wk-warm" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffa39e" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffa39e" stopOpacity="0" />
          </linearGradient>
          <marker id="wk-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={dc.neutralArrow} />
          </marker>
        </defs>
        <rect x="2" y="2" width="376" height="196" rx="12" fill="rgba(255,255,255,0.92)" stroke={dc.hairline} />
        <rect x="12" y="12" width="356" height="150" rx="8" fill="rgba(22,119,255,0.05)" />
        <path d="M 12 162 L 368 162 L 368 188 L 12 188 Z" fill="url(#wk-ocean)" />
        {phase !== 'el-nino' ? (
          <path d="M 12 162 L 120 162 Q 160 130 200 128 L 368 162 Z" fill="url(#wk-warm)" />
        ) : (
          <path d="M 12 162 L 368 162 L 368 140 Q 260 126 190 128 Q 100 130 12 150 Z" fill="url(#wk-warm)" />
        )}
        <path
          d={thermoclines[phase]}
          fill="none"
          stroke={dc.warmAir}
          strokeWidth="1.4"
          strokeDasharray="5 4"
          opacity="0.7"
        />
        <g>
          {phaseFlows[phase].map((flow, index) => (
            <path
              key={index}
              d={flow.d}
              fill="none"
              stroke={flow.color}
              strokeWidth={flow.width}
              strokeDasharray={flow.dashed ? '6 5' : undefined}
              opacity={flow.faded ? 0.65 : 1}
              strokeLinecap="round"
              markerEnd="url(#wk-head)"
              className={styles.walkerFlow}
            />
          ))}
        </g>
        <g fontFamily={diagramFont}>
          <text x="66" y="184" fontSize="10.5" fill={dc.inkSecondary}>
            西太平洋·暖池
          </text>
          <text x="312" y="184" fontSize="10.5" fill={dc.inkSecondary} textAnchor="middle">
            东太平洋（南美沿岸）
          </text>
          {phase !== 'el-nino' ? (
            <text x="74" y="96" fontSize="11" fontWeight="600" fill={dc.warmAir} textAnchor="middle">
              上升气流
            </text>
          ) : (
            <text x="176" y="100" fontSize="11" fontWeight="600" fill={dc.warmAir} textAnchor="middle">
              上升气流东移
            </text>
          )}
          <text x="330" y="100" fontSize="11" fontWeight="600" fill={dc.coldAir} textAnchor="middle">
            下沉气流
          </text>
          <text x="195" y="24" fontSize="11" fontWeight="600" fill={dc.vaporFlow} textAnchor="middle">
            高空向东流
          </text>
          {phase !== 'el-nino' ? (
            <text x="195" y="146" fontSize="11" fontWeight="600" fill={dc.vaporFlow} textAnchor="middle">
              信风（近地面自东向西）
            </text>
          ) : (
            <text x="150" y="140" fontSize="11" fontWeight="600" fill={dc.vaporFlow} textAnchor="middle">
              信风减弱甚至转向
            </text>
          )}
          <text x="368" y="172" fontSize="9.5" fill={dc.warmAir} textAnchor="end" opacity="0.8">
            温跃层
          </text>
        </g>
        <text x="190" y="196" textAnchor="middle" fontSize="10.5" fill={dc.inkTertiary} fontFamily={diagramFont}>
          沃克环流剖面示意（{ensoPhaseMeta[phase].name}）
        </text>
      </svg>
    </div>
  )
}

export default WalkerCirculationOverlay
