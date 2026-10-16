import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import * as Cesium from 'cesium'
import { DEFAULT_DRAW_STYLE, useDrawingStore, type DrawTool, type DrawnShape, type GeoPosition } from '@renderer/stores/drawing'
import { thematicLayerCatalog } from '@renderer/stores/climate'
import { useFeatureFocusStore, type FocusedFeature } from '@renderer/stores/featureFocus'
import { useGlobeStore } from '@renderer/stores/globe'
import { formatArea, formatDistance, isUsablePosition, pathDistance, polygonArea, textOutlineColor, terrainPath, dedupe, LABEL_STYLE, SHAPE_COLOR, centroidOf, isGroundPolylineSupported, measurementFor, pointGraphics, polygonGraphics, polylineOptions, ringOf, sanitizePositions, shapeColorOf, shapeLabelOptions, surfacePosition, terrainSurfacePositions, toCartesian } from '@renderer/lib/shapeGraphics'

type EllipsoidalOccluderLike = { cameraPosition: Cesium.Cartesian3; isPointVisible: (point: Cesium.Cartesian3) => boolean }
const createEllipsoidalOccluder = Cesium as unknown as { EllipsoidalOccluder: new (ellipsoid: Cesium.Ellipsoid, position: Cesium.Cartesian3) => EllipsoidalOccluderLike }

function toGeo(cartesian: Cesium.Cartesian3): GeoPosition {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
  return { longitude: Cesium.Math.toDegrees(cartographic.longitude), latitude: Cesium.Math.toDegrees(cartographic.latitude), height: cartographic.height }
}

function arrowGeometry(cartesians: Cesium.Cartesian3[]): { shaft: Cesium.Cartesian3[]; head: Cesium.Cartesian3[] } {
  if (cartesians.length < 2) return { shaft: cartesians, head: [] }
  const start = cartesians[0]
  const end = cartesians[cartesians.length - 1]
  const distance = Cesium.Cartesian3.distance(start, end)
  if (!Number.isFinite(distance) || distance < 1) return { shaft: [start, end], head: [] }
  const direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(end, start, new Cesium.Cartesian3()), new Cesium.Cartesian3())
  const headLength = Math.min(distance * 0.18, 200000)
  const base = Cesium.Cartesian3.subtract(end, Cesium.Cartesian3.multiplyByScalar(direction, headLength, new Cesium.Cartesian3()), new Cesium.Cartesian3())
  const normal = Cesium.Cartesian3.normalize(end, new Cesium.Cartesian3())
  let side = Cesium.Cartesian3.cross(direction, normal, new Cesium.Cartesian3())
  if (Cesium.Cartesian3.magnitudeSquared(side) < 1e-8) side = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3())
  side = Cesium.Cartesian3.normalize(side, side)
  const halfWidth = headLength * 0.48
  const offset = Cesium.Cartesian3.multiplyByScalar(side, halfWidth, new Cesium.Cartesian3())
  return {
    shaft: [start, base],
    head: [end, Cesium.Cartesian3.add(base, offset, new Cesium.Cartesian3()), Cesium.Cartesian3.subtract(base, offset, new Cesium.Cartesian3())]
  }
}

export function measureShape(shape: DrawnShape): string {
  return measurementFor(shape.kind, shape.positions.map(toCartesian))
}

function previewPolylinePositions(viewer: Cesium.Viewer, positions: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  const sanitized = sanitizePositions(positions)
  return isGroundPolylineSupported(viewer) ? sanitized : terrainSurfacePositions(viewer, terrainPath(sanitized, 128))
}

export function useDrawing(viewer: Ref<Cesium.Viewer | undefined>) {
  const store = useDrawingStore()
  const focusStore = useFeatureFocusStore()
  const globeStore = useGlobeStore()
  const entities = new Map<string, Cesium.Entity>()
  const renderSignatures = new Map<string, string>()
  const drapedPolylines = new Map<string, { entity: Cesium.Entity; path: Cesium.Cartographic[] }>()
  const horizonVisibility = new Map<string, boolean>()
  const horizonOccluder = new createEllipsoidalOccluder.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, Cesium.Cartesian3.ZERO)
  const DRAPE_REFRESH_DELAY_MS = 500
  let drapeRefreshTimer: number | undefined
  let handler: Cesium.ScreenSpaceEventHandler | undefined
  let draft: Cesium.Cartesian3[] = []
  let cursor: Cesium.Cartesian3 | undefined
  let previewEntity: Cesium.Entity | undefined
  let tool: DrawTool | null = null

  function currentViewer(): Cesium.Viewer | undefined {
    const current = viewer.value
    return current && !current.isDestroyed() ? current : undefined
  }

  function isPolygonTool(next: DrawTool | null = tool): boolean {
    return next === 'polygon'
  }

  function removeEntity(id: string): void {
    const current = currentViewer()
    const entity = entities.get(id)
    if (entity && current) current.entities.remove(entity)
    entities.delete(id)
    renderSignatures.delete(id)
    drapedPolylines.delete(id)
    horizonVisibility.delete(id)
  }

  function updateHorizonVisibility(): void {
    const current = currentViewer()
    if (!current) return
    if (current.scene.mode !== Cesium.SceneMode.SCENE3D) {
      for (const [id, visible] of horizonVisibility) {
        if (visible) continue
        const entity = entities.get(id)
        if (entity) entity.show = true
      }
      horizonVisibility.clear()
      return
    }
    horizonOccluder.cameraPosition = current.camera.positionWC
    const time = current.clock.currentTime
    for (const [id, entity] of entities) {
      if (!entity.position) continue
      const position = entity.position.getValue(time)
      if (!position) continue
      const visible = horizonOccluder.isPointVisible(position)
      if (horizonVisibility.get(id) === visible) continue
      horizonVisibility.set(id, visible)
      entity.show = visible
    }
  }

  function refreshDrapedPolylines(): void {
    const current = currentViewer()
    if (!current) return
    for (const [id, link] of drapedPolylines) {
      if (!current.entities.contains(link.entity)) {
        drapedPolylines.delete(id)
        continue
      }
      const polyline = link.entity.polyline
      if (polyline) polyline.positions = new Cesium.ConstantProperty(terrainSurfacePositions(current, link.path))
    }
  }

  function scheduleDrapeRefresh(): void {
    if (!drapedPolylines.size || drapeRefreshTimer !== undefined) return
    drapeRefreshTimer = window.setTimeout(() => {
      drapeRefreshTimer = undefined
      refreshDrapedPolylines()
    }, DRAPE_REFRESH_DELAY_MS)
  }

  function renderShape(shape: DrawnShape): void {
    const current = currentViewer()
    if (!current) return
    const groundSupported = isGroundPolylineSupported(current)
    const textSelected = shape.kind === 'text' && store.selectedShapeId === shape.id
    const signature = JSON.stringify([shape.kind, shape.color, shape.textColor, shape.fontFamily, shape.fontSize, shape.textFrame, shape.lineWidth, shape.annotation, textSelected, groundSupported, shape.positions])
    if (entities.has(shape.id) && renderSignatures.get(shape.id) === signature) return
    removeEntity(shape.id)
    const cartesians = shape.positions.map(toCartesian)
    if (!cartesians.length) return
    const color = shapeColorOf(shape)
    const options: Cesium.Entity.ConstructorOptions = { id: shape.id }
    let drapedPath: Cesium.Cartographic[] | undefined
    if (shape.kind === 'point') {
      options.position = surfacePosition(cartesians[0])
      options.point = pointGraphics(color)
    } else if (shape.kind === 'polyline') {
      options.position = surfacePosition(centroidOf(cartesians))
      const polyline = polylineOptions(current, cartesians, shape.lineWidth, color)
      if (polyline) {
        options.polyline = polyline.graphics
        drapedPath = polyline.drapedPath
      }
    } else if (shape.kind === 'polygon') {
      options.position = surfacePosition(centroidOf(cartesians))
      const hierarchy = sanitizePositions(cartesians)
      if (hierarchy.length >= 3) options.polygon = polygonGraphics(color, hierarchy)
      const polyline = polylineOptions(current, ringOf(cartesians), shape.lineWidth, color)
      if (polyline) {
        options.polyline = polyline.graphics
        drapedPath = polyline.drapedPath
      }
    } else if (shape.kind === 'arrow') {
      const geometry = arrowGeometry(cartesians)
      options.position = surfacePosition(cartesians[cartesians.length - 1])
      const polyline = polylineOptions(current, geometry.shaft, shape.lineWidth, color)
      if (polyline) {
        options.polyline = polyline.graphics
        drapedPath = polyline.drapedPath
      }
      const head = sanitizePositions(geometry.head)
      if (head.length >= 3) options.polygon = { hierarchy: new Cesium.PolygonHierarchy(head), material: color, outline: true, outlineColor: color, outlineWidth: shape.lineWidth }
    } else {
      options.position = surfacePosition(cartesians[0])
      options.point = {
        color: Cesium.Color.TRANSPARENT,
        outlineColor: Cesium.Color.TRANSPARENT,
        pixelSize: 8,
        show: !shape.annotation,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    }
    const label = shapeLabelOptions(shape, cartesians)
    if (label) options.label = { ...label, show: shape.kind !== 'text' || store.selectedShapeId !== shape.id }
    const entity = new Cesium.Entity(options)
    current.entities.add(entity)
    entities.set(shape.id, entity)
    renderSignatures.set(shape.id, signature)
    if (drapedPath) drapedPolylines.set(shape.id, { entity, path: drapedPath })
  }

  function syncEntities(): void {
    if (!currentViewer()) return
    for (const id of [...entities.keys()]) {
      if (!store.shapes.some((shape) => shape.id === id)) removeEntity(id)
    }
    for (const shape of store.shapes) renderShape(shape)
  }

  function clearPreview(): void {
    const current = currentViewer()
    if (previewEntity && current) current.entities.remove(previewEntity)
    previewEntity = undefined
    cursor = undefined
  }

  function cancelDraft(): void {
    clearPreview()
    draft = []
  }

  function pickAt(screenPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
    const current = currentViewer()
    if (!current) return undefined
    if (current.scene.pickPositionSupported) {
      const picked = current.scene.pickPosition(screenPosition)
      if (isUsablePosition(picked)) return picked
    }
    const onEllipsoid = current.camera.pickEllipsoid(screenPosition) ?? undefined
    return isUsablePosition(onEllipsoid) ? onEllipsoid : undefined
  }

  function previewPositions(): Cesium.Cartesian3[] {
    return cursor ? [...draft, cursor] : [...draft]
  }

  function draftMeasurement(): string {
    const current = previewPositions()
    if (isPolygonTool()) return current.length >= 3 ? formatArea(polygonArea(current)) : ''
    return current.length >= 2 ? formatDistance(pathDistance(current)) : ''
  }

  function draftAnchor(): Cesium.Cartesian3 | undefined {
    const anchor = cursor ?? draft[draft.length - 1]
    return anchor ? surfacePosition(anchor) : undefined
  }

  function createPreview(): void {
    const current = currentViewer()
    if (!current) return
    clearPreview()
    const options: Cesium.Entity.ConstructorOptions = {
      position: new Cesium.CallbackPositionProperty(draftAnchor, false),
      label: { ...LABEL_STYLE, text: new Cesium.CallbackProperty(draftMeasurement, false) }
    }
    if (tool === 'arrow') {
      options.polyline = {
        positions: new Cesium.CallbackProperty(() => previewPolylinePositions(current, arrowGeometry(previewPositions()).shaft), false),
        width: DEFAULT_DRAW_STYLE.lineWidth,
        material: SHAPE_COLOR.withAlpha(0.7),
        ...(isGroundPolylineSupported(current) ? { clampToGround: true } : { depthFailMaterial: new Cesium.ColorMaterialProperty(SHAPE_COLOR.withAlpha(0.7)) })
      }
      options.polygon = {
        hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(sanitizePositions(arrowGeometry(previewPositions()).head)), false),
        material: SHAPE_COLOR.withAlpha(0.7),
      }
    } else if (isPolygonTool()) {
      options.polygon = { hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(sanitizePositions(previewPositions())), false), material: SHAPE_COLOR.withAlpha(0.15) }
      options.polyline = {
        positions: new Cesium.CallbackProperty(() => previewPolylinePositions(current, ringOf(previewPositions())), false),
        width: 2,
        material: SHAPE_COLOR.withAlpha(0.6),
        ...(isGroundPolylineSupported(current) ? { clampToGround: true } : { depthFailMaterial: new Cesium.ColorMaterialProperty(SHAPE_COLOR.withAlpha(0.6)) })
      }
    } else {
      options.polyline = {
        positions: new Cesium.CallbackProperty(() => previewPolylinePositions(current, previewPositions()), false),
        width: 2,
        material: SHAPE_COLOR.withAlpha(0.6),
        ...(isGroundPolylineSupported(current) ? { clampToGround: true } : { depthFailMaterial: new Cesium.ColorMaterialProperty(SHAPE_COLOR.withAlpha(0.6)) })
      }
    }
    previewEntity = new Cesium.Entity(options)
    current.entities.add(previewEntity)
  }

  function commit(cartesians: Cesium.Cartesian3[]): void {
    const kind: DrawnShape['kind'] = tool === 'point' ? 'point' : tool === 'text' ? 'text' : tool === 'arrow' ? 'arrow' : isPolygonTool() ? 'polygon' : 'polyline'
    const positions = sanitizePositions(cartesians)
    const minimum = kind === 'polygon' ? 3 : kind === 'point' || kind === 'text' ? 1 : 2
    cancelDraft()
    if (positions.length < minimum) return
    const id = crypto.randomUUID()
    store.addShape({ ...DEFAULT_DRAW_STYLE, id, kind, positions: positions.map(toGeo), annotation: '', textFrame: kind === 'text', createdAt: Date.now() })
    store.setSelectedShapeId(id)
    tool = null
    store.setActiveTool(null)
  }

  function thematicFeatureOf(entity: Cesium.Entity): FocusedFeature | null {
    if (!(entity.properties instanceof Cesium.PropertyBag)) return null
    const values = entity.properties.getValue(Cesium.JulianDate.now()) as Record<string, unknown>
    const name = typeof values.name === 'string' ? values.name : ''
    const layerId = typeof values.layerId === 'string' ? values.layerId : ''
    const summary = typeof values.summary === 'string' ? values.summary : ''
    if (!name || !layerId || !summary) return null
    const layerName = thematicLayerCatalog.find((layer) => layer.id === layerId)?.name ?? layerId
    return { name, layerName, summary }
  }

  function handleClick(movement: { position: Cesium.Cartesian2 }): void {
    if (!tool) {
      const current = currentViewer()
      if (!current) return
      const picked = current.scene.pick(movement.position)
      if (picked && picked.id instanceof Cesium.Entity) {
        const entity = picked.id
        if (entities.has(entity.id)) {
          store.setSelectedShapeId(entity.id)
          focusStore.clearFocus()
          return
        }
        const feature = thematicFeatureOf(entity)
        if (feature) {
          focusStore.setFocus(feature)
          store.setSelectedShapeId(null)
          return
        }
      }
      store.setSelectedShapeId(null)
      focusStore.clearFocus()
      return
    }
    if (tool === 'timezone') return
    const position = pickAt(movement.position)
    if (!position) return
    if (tool === 'point' || tool === 'text') {
      commit([position])
      return
    }
    if (tool === 'arrow' && draft.length) {
      if (sanitizePositions([draft[0], position]).length < 2) return
      commit([draft[0], position])
      return
    }
    draft.push(position)
    if (draft.length === 1) createPreview()
  }

  function handleDoubleClick(): void {
    if (!tool || tool === 'point' || tool === 'text' || tool === 'arrow') return
    const positions = dedupe([...draft])
    const minimum = isPolygonTool() ? 3 : 2
    if (positions.length < minimum) return
    commit(positions)
  }

  function handleMove(movement: { endPosition: Cesium.Cartesian2 }): void {
    if (!tool || tool === 'point' || tool === 'text' || !draft.length) return
    cursor = pickAt(movement.endPosition)
  }

  function handleRightClick(): void {
    if (!tool || tool === 'point' || tool === 'text' || tool === 'arrow' || dedupe(draft).length < (isPolygonTool() ? 3 : 2)) {
      cancelDraft()
      return
    }
    commit(draft)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    cancelDraft()
    if (tool) {
      tool = null
      store.setActiveTool(null)
    }
    store.setSelectedShapeId(null)
  }

  function flyToShape(shape: DrawnShape): void {
    const current = currentViewer()
    if (!current) return
    const cartesians = shape.positions.map(toCartesian)
    if (!cartesians.length) return
    if (shape.kind === 'point' || shape.kind === 'text') {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesians[0])
      current.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude), 8000), duration: 1.2 })
      return
    }
    const sphere = Cesium.BoundingSphere.fromPoints(cartesians)
    current.camera.flyToBoundingSphere(sphere, { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), Math.max(sphere.radius * 3, 1000)), duration: 1.2 })
  }

  watch(
    viewer,
    (current) => {
      if (!current || current.isDestroyed()) return
      current.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
      handler = new Cesium.ScreenSpaceEventHandler(current.scene.canvas)
      handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      handler.setInputAction(handleMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
      handler.setInputAction(handleDoubleClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
      handler.setInputAction(handleRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
      entities.clear()
      renderSignatures.clear()
      drapedPolylines.clear()
      horizonVisibility.clear()
      current.scene.globe.tileLoadProgressEvent.addEventListener(scheduleDrapeRefresh)
      current.scene.preUpdate.addEventListener(updateHorizonVisibility)
      void store.load()
      syncEntities()
    },
    { flush: 'post' }
  )

  watch(() => store.activeTool, (next) => {
    cancelDraft()
    tool = next
  })

  watch(() => store.shapes, syncEntities, { deep: true })
  watch(() => store.selectedShapeId, syncEntities)
  watch(() => globeStore.terrainExaggeration, syncEntities)

  onMounted(() => window.addEventListener('keydown', handleKeydown))

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    if (drapeRefreshTimer !== undefined) window.clearTimeout(drapeRefreshTimer)
    drapeRefreshTimer = undefined
    handler?.destroy()
    handler = undefined
  })

  return { flyToShape }
}
