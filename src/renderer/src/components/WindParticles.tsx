import { useClimateStore } from '@renderer/stores/climate'
import { sampleWind, windRampStops, WIND_RAMP_MAX_SPEED } from '@renderer/thematic/windField'
import * as Cesium from 'cesium'
import { useEffect, useRef } from 'react'

import styles from './WindParticles.module.css'

export interface WindParticlesProps {
  viewer?: Cesium.Viewer
}

interface Particle {
  lon: number
  lat: number
  height: number
  age: number
  maxAge: number
  position: Cesium.Cartesian3
  trail: Cesium.Cartesian3[]
  trailScreens: number[]
}

const COLOR_BINS = 16
const TRAIL_MAX_POINTS = 20
const TRAIL_SAMPLE_PIXELS = 3
const TRAIL_LENGTH_PIXELS = 32
const SPEED_PIXELS_PER_SEC_PER_UNIT = 3.4
const OFFSCREEN_MARGIN = 40
const MAX_PARTICLES = 1100
const MIN_PARTICLES = 250
const AREA_PER_PARTICLE = 1000
const TRAIL_REPROJECT_BUDGET = 250
const SPAWN_COLUMNS = 16
const SPAWN_ROWS = 12

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ]
}

function buildBinColors(): string[] {
  const stops = windRampStops.map(hexToRgb)
  return Array.from({ length: COLOR_BINS }, (_, i) => {
    const t = (i / (COLOR_BINS - 1)) * (stops.length - 1)
    const index = Math.min(stops.length - 2, Math.floor(t))
    const local = t - index
    const [r0, g0, b0] = stops[index]
    const [r1, g1, b1] = stops[index + 1]
    return `rgba(${Math.round(r0 + (r1 - r0) * local)},${Math.round(g0 + (g1 - g0) * local)},${Math.round(b0 + (b1 - b0) * local)},`
  })
}

const binColorPrefixes = buildBinColors()

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function WindParticles({ viewer }: WindParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeViewer = viewer && !viewer.isDestroyed() ? viewer : undefined
    const trailBins: number[][] = Array.from({ length: COLOR_BINS }, () => [])
    const headBins: number[][] = Array.from({ length: COLOR_BINS }, () => [])
    const particles: Particle[] = []
    const spawnCells: number[] = []
    const scratchScreen = new Cesium.Cartesian2()
    const scratchHead = new Cesium.Cartesian2()
    const scratchTrail = new Cesium.Cartesian2()
    const scratchPosition = new Cesium.Cartesian3()
    const scratchNormal = new Cesium.Cartesian3()
    const scratchToCamera = new Cesium.Cartesian3()
    const scratchCartographic = new Cesium.Cartographic()
    const particleBounds = new Cesium.BoundingSphere(new Cesium.Cartesian3(), 1)
    const previousView = new Cesium.Matrix4()
    const previousProjection = new Cesium.Matrix4()

    let context: CanvasRenderingContext2D | undefined
    let animationFrame = 0
    let cssWidth = 0
    let cssHeight = 0
    let pixelRatio = 0
    let lastTime = 0
    let viewDirty = true
    let previousMode: Cesium.SceneMode | undefined
    let trailsStale = true
    let reprojectIndex = 0

    function projectToScreen(
      position: Cesium.Cartesian3,
      currentViewer: Cesium.Viewer,
      result: Cesium.Cartesian2
    ): boolean {
      if (currentViewer.scene.mode === Cesium.SceneMode.SCENE3D) {
        currentViewer.scene.globe.ellipsoid.geodeticSurfaceNormal(position, scratchNormal)
        Cesium.Cartesian3.subtract(currentViewer.camera.positionWC, position, scratchToCamera)
        if (Cesium.Cartesian3.dot(scratchNormal, scratchToCamera) <= 0) return false
      }
      const projected = Cesium.SceneTransforms.worldToWindowCoordinates(
        currentViewer.scene,
        position,
        result
      )
      return Boolean(projected && Number.isFinite(projected.x) && Number.isFinite(projected.y))
    }

    function isOnscreen(point: Cesium.Cartesian2): boolean {
      return (
        point.x >= -OFFSCREEN_MARGIN &&
        point.x <= cssWidth + OFFSCREEN_MARGIN &&
        point.y >= -OFFSCREEN_MARGIN &&
        point.y <= cssHeight + OFFSCREEN_MARGIN
      )
    }

    function updatePosition(particle: Particle, currentViewer: Cesium.Viewer): void {
      Cesium.Cartesian3.fromDegrees(
        particle.lon,
        particle.lat,
        particle.height,
        currentViewer.scene.globe.ellipsoid,
        particle.position
      )
    }

    function respawn(particle: Particle, currentViewer: Cesium.Viewer): boolean {
      particle.trail.length = 0
      particle.trailScreens.length = 0
      particle.age = 0
      particle.maxAge = 3 + Math.random() * 3
      for (let attempt = 0; attempt < 8 && spawnCells.length; attempt += 1) {
        const cell = spawnCells[Math.floor(Math.random() * spawnCells.length)]
        scratchScreen.x = (((cell % SPAWN_COLUMNS) + Math.random()) * cssWidth) / SPAWN_COLUMNS
        scratchScreen.y =
          ((Math.floor(cell / SPAWN_COLUMNS) + Math.random()) * cssHeight) / SPAWN_ROWS
        const position = currentViewer.camera.pickEllipsoid(
          scratchScreen,
          currentViewer.scene.globe.ellipsoid,
          scratchPosition
        )
        if (!position) continue
        const location = currentViewer.scene.globe.ellipsoid.cartesianToCartographic(
          position,
          scratchCartographic
        )
        particle.lon = Cesium.Math.toDegrees(location.longitude)
        particle.lat = Cesium.Math.toDegrees(location.latitude)
        particle.height = 0
        updatePosition(particle, currentViewer)
        if (
          !projectToScreen(particle.position, currentViewer, scratchHead) ||
          !isOnscreen(scratchHead)
        )
          continue
        particle.trail.push(Cesium.Cartesian3.clone(particle.position))
        particle.trailScreens.push(scratchHead.x, scratchHead.y)
        return true
      }
      return false
    }

    function refreshVisibleArea(currentViewer: Cesium.Viewer): void {
      const camera = currentViewer.camera
      if (
        !viewDirty &&
        previousMode === currentViewer.scene.mode &&
        Cesium.Matrix4.equals(previousView, camera.viewMatrix) &&
        Cesium.Matrix4.equals(previousProjection, camera.frustum.projectionMatrix)
      ) {
        return
      }
      viewDirty = false
      previousMode = currentViewer.scene.mode
      Cesium.Matrix4.clone(camera.viewMatrix, previousView)
      Cesium.Matrix4.clone(camera.frustum.projectionMatrix, previousProjection)
      spawnCells.length = 0
      for (let row = 0; row < SPAWN_ROWS; row += 1) {
        for (let column = 0; column < SPAWN_COLUMNS; column += 1) {
          scratchScreen.x = ((column + 0.5) * cssWidth) / SPAWN_COLUMNS
          scratchScreen.y = ((row + 0.5) * cssHeight) / SPAWN_ROWS
          if (
            camera.pickEllipsoid(
              scratchScreen,
              currentViewer.scene.globe.ellipsoid,
              scratchPosition
            )
          ) {
            spawnCells.push(row * SPAWN_COLUMNS + column)
          }
        }
      }
      const visibleArea = (cssWidth * cssHeight * spawnCells.length) / (SPAWN_COLUMNS * SPAWN_ROWS)
      const target = spawnCells.length
        ? Math.min(
            MAX_PARTICLES,
            Math.max(MIN_PARTICLES, Math.round(visibleArea / AREA_PER_PARTICLE))
          )
        : 0
      if (particles.length > target) particles.length = target
      while (particles.length < target) {
        const particle: Particle = {
          lon: 0,
          lat: 0,
          height: 0,
          age: 0,
          maxAge: 1,
          position: new Cesium.Cartesian3(),
          trail: [],
          trailScreens: []
        }
        if (respawn(particle, currentViewer)) particle.age = Math.random() * particle.maxAge
        particles.push(particle)
      }
    }

    function resizeCanvas(): void {
      if (!canvas) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (
        cssWidth === canvas.clientWidth &&
        cssHeight === canvas.clientHeight &&
        pixelRatio === dpr
      )
        return
      cssWidth = canvas.clientWidth
      cssHeight = canvas.clientHeight
      pixelRatio = dpr
      canvas.width = Math.max(1, Math.round(cssWidth * dpr))
      canvas.height = Math.max(1, Math.round(cssHeight * dpr))
      context = canvas.getContext('2d') ?? undefined
      context?.setTransform(dpr, 0, 0, dpr, 0, 0)
      viewDirty = true
    }

    function advanceParticle(
      particle: Particle,
      currentViewer: Cesium.Viewer,
      dt: number,
      u: number,
      v: number,
      metersPerPixel: number
    ): void {
      const degreesPerMeter =
        Cesium.Math.DEGREES_PER_RADIAN / currentViewer.scene.globe.ellipsoid.maximumRadius
      const step = SPEED_PIXELS_PER_SEC_PER_UNIT * metersPerPixel * degreesPerMeter * dt
      particle.lon = wrapLon(
        particle.lon + (u * step) / Math.max(0.02, Math.cos(Cesium.Math.toRadians(particle.lat)))
      )
      particle.lat = Math.min(89.9, Math.max(-89.9, particle.lat + v * step))
      updatePosition(particle, currentViewer)
      const last = particle.trail[particle.trail.length - 1]
      if (
        !last ||
        Cesium.Cartesian3.distance(last, particle.position) >= metersPerPixel * TRAIL_SAMPLE_PIXELS
      ) {
        const recycled =
          particle.trail.length >= TRAIL_MAX_POINTS ? particle.trail.shift() : undefined
        if (recycled) particle.trailScreens.splice(0, 2)
        particle.trail.push(Cesium.Cartesian3.clone(particle.position, recycled))
        if (projectToScreen(particle.position, currentViewer, scratchTrail)) {
          particle.trailScreens.push(scratchTrail.x, scratchTrail.y)
        } else {
          particle.trailScreens.push(Number.NaN, Number.NaN)
        }
      }
    }

    function reprojectParticle(particle: Particle, currentViewer: Cesium.Viewer): void {
      const screens = particle.trailScreens
      screens.length = 0
      for (const point of particle.trail) {
        if (projectToScreen(point, currentViewer, scratchTrail))
          screens.push(scratchTrail.x, scratchTrail.y)
        else screens.push(Number.NaN, Number.NaN)
      }
    }

    function frameMetersPerPixel(currentViewer: Cesium.Viewer): number {
      scratchScreen.x = cssWidth / 2
      scratchScreen.y = cssHeight / 2
      const center = currentViewer.camera.pickEllipsoid(
        scratchScreen,
        currentViewer.scene.globe.ellipsoid,
        scratchPosition
      )
      if (!center) return 0
      Cesium.Cartesian3.clone(center, particleBounds.center)
      const value = currentViewer.camera.getPixelSize(particleBounds, cssWidth, cssHeight)
      return Number.isFinite(value) && value > 0 ? value : 0
    }

    function collectTrail(particle: Particle, bin: number): void {
      const segments = trailBins[bin]
      const screens = particle.trailScreens
      let x = scratchHead.x
      let y = scratchHead.y
      let remaining = TRAIL_LENGTH_PIXELS
      segments.push(x, y)
      for (let i = screens.length - 2; i >= 0 && remaining > 0; i -= 2) {
        const trailX = screens[i]
        const trailY = screens[i + 1]
        if (!Number.isFinite(trailX) || !Number.isFinite(trailY)) break
        const distance = Math.hypot(trailX - x, trailY - y)
        if (distance < 0.01) continue
        if (distance > Math.max(cssWidth, cssHeight) * 0.5) break
        const ratio = Math.min(1, remaining / distance)
        x += (trailX - x) * ratio
        y += (trailY - y) * ratio
        segments.push(x, y)
        remaining -= distance
      }
      segments.push(Number.NaN, Number.NaN)
      headBins[bin].push(scratchHead.x, scratchHead.y)
    }

    function frame(): void {
      const currentViewer = activeViewer
      const ctx = context
      if (!currentViewer || currentViewer.isDestroyed() || !ctx || !cssWidth || !cssHeight) return
      if (document.hidden) {
        lastTime = 0
        return
      }
      const now = performance.now()
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0
      lastTime = now
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      if (currentViewer.scene.mode === Cesium.SceneMode.MORPHING) {
        viewDirty = true
        return
      }
      const viewMoved =
        viewDirty ||
        previousMode !== currentViewer.scene.mode ||
        !Cesium.Matrix4.equals(previousView, currentViewer.camera.viewMatrix) ||
        !Cesium.Matrix4.equals(previousProjection, currentViewer.camera.frustum.projectionMatrix)
      if (viewMoved) {
        for (const particle of particles) particle.trailScreens.length = 0
        trailsStale = true
        reprojectIndex = 0
      }
      refreshVisibleArea(currentViewer)
      if (trailsStale && !viewMoved) {
        let remaining = TRAIL_REPROJECT_BUDGET
        while (remaining > 0 && reprojectIndex < particles.length) {
          reprojectParticle(particles[reprojectIndex], currentViewer)
          reprojectIndex += 1
          remaining -= 1
        }
        if (reprojectIndex >= particles.length) trailsStale = false
      }
      const metersPerPixel = frameMetersPerPixel(currentViewer)
      for (const bin of trailBins) bin.length = 0
      for (const bin of headBins) bin.length = 0

      const month = useClimateStore.getState().month
      for (const particle of particles) {
        particle.age += dt
        if (
          particle.age > particle.maxAge ||
          !particle.trail.length ||
          !projectToScreen(particle.position, currentViewer, scratchHead) ||
          !isOnscreen(scratchHead)
        ) {
          if (!respawn(particle, currentViewer)) continue
        }
        const wind = sampleWind(particle.lon, particle.lat, month)
        const speed = Math.hypot(wind.u, wind.v)
        if (metersPerPixel > 0)
          advanceParticle(particle, currentViewer, dt, wind.u, wind.v, metersPerPixel)
        if (
          !projectToScreen(particle.position, currentViewer, scratchHead) ||
          !isOnscreen(scratchHead)
        )
          continue
        const bin = Math.min(COLOR_BINS - 1, Math.floor((speed / WIND_RAMP_MAX_SPEED) * COLOR_BINS))
        collectTrail(particle, bin)
      }

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let bin = 0; bin < COLOR_BINS; bin += 1) {
        const segments = trailBins[bin]
        ctx.strokeStyle = `${binColorPrefixes[bin]}0.5)`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        let drawing = false
        for (let i = 0; i < segments.length; i += 2) {
          if (Number.isNaN(segments[i])) drawing = false
          else if (drawing) ctx.lineTo(segments[i], segments[i + 1])
          else {
            ctx.moveTo(segments[i], segments[i + 1])
            drawing = true
          }
        }
        ctx.stroke()
        const heads = headBins[bin]
        ctx.fillStyle = `${binColorPrefixes[bin]}0.95)`
        ctx.beginPath()
        for (let i = 0; i < heads.length; i += 2) {
          ctx.moveTo(heads[i] + 1.3, heads[i + 1])
          ctx.arc(heads[i], heads[i + 1], 1.3, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    function stopAnimation(): void {
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      lastTime = 0
    }

    function animate(now: number): void {
      animationFrame = 0
      if (document.hidden || !activeViewer || activeViewer.isDestroyed()) return
      if (!lastTime || now - lastTime >= 1000 / 60) frame()
      animationFrame = requestAnimationFrame(animate)
    }

    function syncAnimation(): void {
      stopAnimation()
      if (!document.hidden && activeViewer && !activeViewer.isDestroyed()) {
        viewDirty = true
        animationFrame = requestAnimationFrame(animate)
      }
    }

    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvas)
    window.addEventListener('resize', resizeCanvas)
    document.addEventListener('visibilitychange', syncAnimation)
    resizeCanvas()
    syncAnimation()

    return () => {
      stopAnimation()
      resizeObserver.disconnect()
      window.removeEventListener('resize', resizeCanvas)
      document.removeEventListener('visibilitychange', syncAnimation)
      particles.length = 0
      if (context && cssWidth && cssHeight) {
        context.clearRect(0, 0, cssWidth, cssHeight)
      }
    }
  }, [viewer])

  return <canvas ref={canvasRef} className={styles.windCanvas} aria-hidden='true' />
}

export default WindParticles
