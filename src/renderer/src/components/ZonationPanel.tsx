import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons'
import { Alert, Button, Select } from 'antd'
import {
  mountainById,
  snowlineM,
  zonationMountains,
  zonationPrinciples,
  type ZonationMountain,
  type ZonationSlope
} from '@renderer/thematic/mountainZonation'
import { greatCircleKm } from '@renderer/lib/transect'
import {
  cancelTransectFlight,
  clearTransectOverlay,
  flyTransect,
  sampleTransectGround
} from '@renderer/composables/useTransectFlight'
import styles from './ZonationPanel.module.css'

export interface ZonationPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

const SPECTRUM_W = 348
const SPECTRUM_H = 168
const SPECTRUM_TOP_Y = 16
const SPECTRUM_BASE_Y = 148
const SPECTRUM_LEFT = 34
const PROFILE_W = 348
const PROFILE_H = 120
const PROFILE_LEFT = 40
const PROFILE_RIGHT = 6
const PROFILE_TOP = 10
const PROFILE_BOTTOM = 20

const mountainOptions = zonationMountains.map((mountain) => ({
  label: `${mountain.name} · ${mountain.range}`,
  value: mountain.id
}))

function spectrumY(mountain: ZonationMountain, elevationM: number): number {
  return SPECTRUM_BASE_Y - (elevationM / mountain.summitM) * (SPECTRUM_BASE_Y - SPECTRUM_TOP_Y)
}

export function ZonationPanel({ viewer, onClose }: ZonationPanelProps) {
  const [activeId, setActiveId] = useState<string>(zonationMountains[0].id)
  const [profile, setProfile] = useState<Array<[number, number]>>([])
  const [sampling, setSampling] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [flying, setFlying] = useState(false)
  const [flightNote, setFlightNote] = useState('')

  const activeIdRef = useRef<string>(zonationMountains[0].id)
  const profileRequestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const active = useMemo<ZonationMountain>(
    () => mountainById(activeId) ?? zonationMountains[0],
    [activeId]
  )

  const slopeLayouts = useMemo(() => {
    const paired = active.slopes.length === 2
    return active.slopes.map((slope: ZonationSlope, index: number) => {
      const cx = paired ? (index === 0 ? 104 : 274) : 189
      const halfW = paired ? 64 : 105
      const belts = slope.belts.map((belt) => ({
        ...belt,
        y: spectrumY(active, belt.toM),
        height: Math.max(1, spectrumY(active, belt.fromM) - spectrumY(active, belt.toM))
      }))
      const snow = snowlineM(slope)
      return {
        slope,
        cx,
        halfW,
        clipId: `zonation-clip-${active.id}-${index}`,
        triangle: `M ${cx - halfW} ${SPECTRUM_BASE_Y} L ${cx} ${SPECTRUM_TOP_Y} L ${cx + halfW} ${SPECTRUM_BASE_Y} Z`,
        belts,
        snowY: snow !== undefined ? spectrumY(active, snow) : undefined
      }
    })
  }, [active])

  const profileLayout = useMemo(() => {
    const maxKm = Math.max(40, Math.ceil(profile[profile.length - 1]?.[0] ?? 40))
    const elevMax = Math.max(1, active.summitM * 1.08)
    const toX = (km: number): number => PROFILE_LEFT + (km / maxKm) * (PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT)
    const toY = (elevationM: number): number =>
      PROFILE_TOP + (1 - elevationM / elevMax) * (PROFILE_H - PROFILE_TOP - PROFILE_BOTTOM)
    let summit: { x: number; y: number; elevationM: number } | undefined
    for (const [km, elevationM] of profile) {
      if (!summit || elevationM > summit.elevationM) summit = { x: toX(km), y: toY(elevationM), elevationM }
    }
    const stripeSlope = active.slopes[0]
    const snow = snowlineM(stripeSlope)
    return {
      maxKm,
      linePoints: profile.map(([km, elevationM]) => `${toX(km).toFixed(1)},${toY(elevationM).toFixed(1)}`).join(' '),
      stripes: stripeSlope.belts.map((belt) => ({
        color: belt.color,
        y: toY(belt.toM),
        height: Math.max(1, toY(belt.fromM) - toY(belt.toM))
      })),
      snowY: snow !== undefined ? toY(snow) : undefined,
      summit,
      baseY: toY(0),
      peakElevation: summit ? Math.round(summit.elevationM) : active.summitM,
      kmTicks: [0, Math.round(maxKm / 2), maxKm]
    }
  }, [active, profile])

  const sampleProfile = useCallback(
    async (mountain: ZonationMountain, targetViewer: Cesium.Viewer | undefined): Promise<void> => {
      profileRequestIdRef.current += 1
      const requestId = profileRequestIdRef.current
      setProfile([])
      if (!targetViewer || targetViewer.isDestroyed()) return
      setSampling(true)
      setDegraded(false)
      try {
        const { path, heights, degraded: sampledDegraded } = await sampleTransectGround(
          targetViewer,
          mountain.transect,
          undefined,
          mountain.summitM
        )
        if (requestId !== profileRequestIdRef.current) return
        setDegraded(sampledDegraded)
        let distance = 0
        setProfile(
          path.map((point, index) => {
            if (index > 0) {
              const [previousLon, previousLat] = path[index - 1]
              distance += greatCircleKm(previousLon, previousLat, point[0], point[1])
            }
            return [Math.round(distance * 10) / 10, Math.round((heights[index] ?? 0) * 10) / 10]
          })
        )
      } finally {
        if (requestId === profileRequestIdRef.current) setSampling(false)
      }
    },
    []
  )

  const focusMountain = useCallback(
    (mountain: ZonationMountain, targetViewer: Cesium.Viewer | undefined): void => {
      if (targetViewer && !targetViewer.isDestroyed()) {
        targetViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(mountain.longitude, mountain.latitude, mountain.viewHeight),
          duration: 1.4
        })
      }
      void sampleProfile(mountain, targetViewer)
    },
    [sampleProfile]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) {
      const mountain = mountainById(activeIdRef.current) ?? zonationMountains[0]
      focusMountain(mountain, viewer)
    }
    return () => {
      profileRequestIdRef.current += 1
      clearTransectOverlay(viewer)
    }
  }, [viewer, focusMountain])

  function selectMountain(mountainId: string): void {
    const mountain = mountainById(mountainId)
    if (!mountain) return
    activeIdRef.current = mountain.id
    setActiveId(mountain.id)
    setFlightNote('')
    focusMountain(mountain, viewer)
  }

  async function startFlight(): Promise<void> {
    if (flying) return
    if (!viewer || viewer.isDestroyed()) {
      setFlightNote('地球尚未就绪，稍后再试')
      return
    }
    setFlying(true)
    setFlightNote('正在采样沿线地形并计算安全飞行高度…')
    try {
      const result = await flyTransect(viewer, active.transect, {
        expectedMaxGroundM: active.summitM,
        onProgress: ({ stage, completed, total }) => {
          if (!mountedRef.current) return
          if (stage === 'prewarm') {
            setFlightNote(`飞行准备：并发预载沿线影像（画面短暂降暗）${completed}/${total}…`)
          } else if (stage === 'flying') {
            setFlightNote(`剖面飞行中（第 ${completed}/${total} 段）…`)
          }
        }
      })
      if (!mountedRef.current) return
      if ('error' in result) {
        setFlightNote(result.error)
      } else if (result.status === 'interrupted') {
        const reason =
          result.reason === 'exaggeration-changed'
            ? '飞行中垂直夸张被调整，高度计划已失效，请调整好后重新飞行'
            : result.reason === 'superseded'
              ? '本次飞行被新一次飞行取代'
              : '剖面飞行已停止'
        setFlightNote(reason)
      } else {
        const samplingNote =
          result.maxGroundM !== undefined
            ? `，沿线最高地表 ${result.maxGroundM} 米${result.degraded ? '（数据不完整，已用安全盲飞高度）' : ''}`
            : ''
        setFlightNote(
          `剖面飞行完成：全程约 ${result.totalKm} 千米，最高飞行高度约 ${result.flightAltitudeM} 米${samplingNote}`
        )
      }
    } finally {
      if (mountedRef.current) setFlying(false)
    }
  }

  return (
    <div className={styles.zonationPanel} role="group" aria-label="山地垂直带谱剖面">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>山地垂直带谱剖面</span>
        <Button type="text" size="small" aria-label="关闭山地垂直带谱剖面" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <Select
        size="small"
        value={activeId}
        options={mountainOptions}
        style={{ width: '100%' }}
        aria-label="选择山脉"
        onChange={(value) => selectMountain(String(value))}
      />

      <svg viewBox={`0 0 ${SPECTRUM_W} ${SPECTRUM_H}`} className={styles.spectrum} role="img" aria-label="垂直带谱示意">
        <defs>
          {slopeLayouts.map((layout) => (
            <clipPath id={layout.clipId} key={layout.clipId}>
              <path d={layout.triangle} />
            </clipPath>
          ))}
        </defs>
        <text x={SPECTRUM_LEFT - 4} y={SPECTRUM_BASE_Y + 3} textAnchor="end" className={styles.axisLabel}>
          0
        </text>
        <text x={SPECTRUM_LEFT - 4} y={SPECTRUM_TOP_Y + 4} textAnchor="end" className={styles.axisLabel}>
          {active.summitM}
        </text>
        {slopeLayouts.map((layout) => (
          <g key={layout.slope.label}>
            <g clipPath={`url(#${layout.clipId})`}>
              {layout.belts.map((belt) => (
                <rect
                  key={belt.id}
                  x={layout.cx - layout.halfW}
                  y={belt.y}
                  width={layout.halfW * 2}
                  height={belt.height}
                  fill={belt.color}
                />
              ))}
            </g>
            <path d={layout.triangle} fill="none" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1" />
            {layout.snowY !== undefined && (
              <>
                <line
                  x1={layout.cx - layout.halfW}
                  x2={layout.cx + layout.halfW}
                  y1={layout.snowY}
                  y2={layout.snowY}
                  stroke="#f5222d"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  opacity="0.7"
                />
                <text x={layout.cx + layout.halfW + 2} y={layout.snowY + 3} className={styles.snowlineLabel}>
                  雪线
                </text>
              </>
            )}
            <text x={layout.cx} y={SPECTRUM_BASE_Y + 14} textAnchor="middle" className={styles.slopeLabel}>
              {layout.slope.label}
            </text>
          </g>
        ))}
      </svg>

      <div
        className={
          active.slopes.length === 2
            ? `${styles.slopeLegends} ${styles.slopeLegendsPaired}`
            : styles.slopeLegends
        }
      >
        {slopeLayouts.map((layout) => (
          <div key={layout.slope.label} className={styles.slopeLegend}>
            {[...layout.slope.belts].reverse().map((belt) => (
              <div key={belt.id} className={styles.beltChip} title={belt.note}>
                <span className={styles.beltSwatch} style={{ background: belt.color }} />
                <span className={styles.beltName}>{belt.name}</span>
                <span className={styles.beltRange}>
                  {belt.fromM}–{belt.toM} m
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.flightRow}>
        <Button type="primary" size="small" loading={flying} onClick={() => void startFlight()}>
          沿剖面飞行
        </Button>
        {flying && (
          <Button size="small" onClick={cancelTransectFlight}>
            停止
          </Button>
        )}
        {flightNote && <span className={styles.flightNote}>{flightNote}</span>}
      </div>

      <div className={styles.chartTitle}>
        沿剖面真实地形
        {sampling && <LoadingOutlined className={styles.loadingIcon} />}
      </div>

      <svg viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`} className={styles.profile} role="img" aria-label="沿剖面真实地形高程">
        {profileLayout.stripes.map((stripe, index) => (
          <rect
            key={index}
            x={PROFILE_LEFT}
            y={stripe.y}
            width={PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT}
            height={stripe.height}
            fill={stripe.color}
            opacity="0.16"
          />
        ))}
        {profileLayout.snowY !== undefined && (
          <line
            x1={PROFILE_LEFT}
            x2={PROFILE_W - PROFILE_RIGHT}
            y1={profileLayout.snowY}
            y2={profileLayout.snowY}
            stroke="#f5222d"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.6"
          />
        )}
        <line
          x1={PROFILE_LEFT}
          x2={PROFILE_W - PROFILE_RIGHT}
          y1={profileLayout.baseY}
          y2={profileLayout.baseY}
          stroke="rgba(5, 5, 5, 0.15)"
          strokeWidth="1"
        />
        <polyline
          points={profileLayout.linePoints}
          fill="none"
          stroke="#1677ff"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {profileLayout.summit && (
          <g>
            <circle cx={profileLayout.summit.x} cy={profileLayout.summit.y} r="3.5" fill="#1677ff" />
            <text
              x={profileLayout.summit.x}
              y={profileLayout.summit.y - 6}
              textAnchor="middle"
              className={styles.peakLabel}
            >
              {profileLayout.peakElevation} m
            </text>
          </g>
        )}
        <text x={PROFILE_LEFT - 4} y={profileLayout.baseY + 3} textAnchor="end" className={styles.axisLabel}>
          0
        </text>
        <text x={PROFILE_LEFT - 4} y={PROFILE_TOP + 8} textAnchor="end" className={styles.axisLabel}>
          {profileLayout.peakElevation}
        </text>
        {profileLayout.kmTicks.map((tick) => (
          <text
            key={tick}
            x={PROFILE_LEFT + ((PROFILE_W - PROFILE_LEFT - PROFILE_RIGHT) * tick) / profileLayout.maxKm}
            y={PROFILE_H - 6}
            textAnchor="middle"
            className={styles.axisLabel}
          >
            {tick}
          </text>
        ))}
        <text x={PROFILE_W - PROFILE_RIGHT} y={PROFILE_H - 6} textAnchor="end" className={styles.axisUnit}>
          km
        </text>
      </svg>

      {degraded && <Alert type="warning" showIcon title="部分地形数据未加载，当前剖面仅供参考" />}

      <div className={styles.sectionTitle}>带谱解读</div>
      {active.facts.map((fact) => (
        <div key={fact} className={styles.fact}>
          · {fact}
        </div>
      ))}
      <div className={styles.sectionTitle}>垂直地域分异要点</div>
      {zonationPrinciples.map((principle) => (
        <div key={principle} className={styles.fact}>
          · {principle}
        </div>
      ))}
      <div className={styles.panelNote}>带谱界线为教学示意，可点击「沿剖面飞行」实地观察。</div>
    </div>
  )
}

export default ZonationPanel
