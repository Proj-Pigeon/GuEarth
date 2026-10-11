import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import * as Cesium from 'cesium'
import { useDrawingStore } from '@renderer/stores/drawing'
import { useSolarStore } from '@renderer/stores/solar'
import { formatClock, localSolarTime } from '@renderer/thematic/solarMath'

export interface TimezonePick {
  label: 'A' | 'B'
  longitude: number
  latitude: number
}

export interface TimezoneComparison {
  picks: TimezonePick[]
  differenceHours: number
}

const PICK_A_COLOR = '#1677ff'
const PICK_B_COLOR = '#fa8c16'
const LABEL_FONT = '13px SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'

export function useTimezoneCompare(viewer: Ref<Cesium.Viewer | undefined>) {
  const drawingStore = useDrawingStore()
  const solarStore = useSolarStore()
  const comparison = ref<TimezoneComparison | null>(null)
  let handler: Cesium.ScreenSpaceEventHandler | undefined
  let dataSource: Cesium.CustomDataSource | undefined
  let picks: TimezonePick[] = []

  function currentViewer(): Cesium.Viewer | undefined {
    const current = viewer.value
    return current && !current.isDestroyed() ? current : undefined
  }

  function utcHoursNow(): number {
    if (solarStore.active) return solarStore.utcHour
    const now = new Date()
    return now.getUTCHours() + now.getUTCMinutes() / 60
  }

  function longitudeText(longitude: number): string {
    return `${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`
  }

  function clearEntities(): void {
    const current = currentViewer()
    if (dataSource) {
      if (current) current.dataSources.remove(dataSource, true)
      dataSource = undefined
    }
  }

  function clearComparison(): void {
    picks = []
    clearEntities()
    comparison.value = null
  }

  function closeTimezoneCompare(): void {
    drawingStore.setActiveTool(null)
    clearComparison()
  }

  function addPick(pick: TimezonePick, color: string): void {
    const current = currentViewer()
    if (!current || !dataSource) return
    const cesiumColor = Cesium.Color.fromCssColorString(color)
    dataSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pick.longitude, pick.latitude),
      point: {
        pixelSize: 10,
        color: cesiumColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: new Cesium.CallbackProperty(
          () => `${pick.label} ${longitudeText(pick.longitude)} 地方时 ${formatClock(localSolarTime(utcHoursNow(), pick.longitude))}`,
          false
        ),
        font: LABEL_FONT,
        fillColor: cesiumColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
    dataSource.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([pick.longitude, 84, pick.longitude, 0, pick.longitude, -84]),
        clampToGround: true,
        width: 1.5,
        material: cesiumColor.withAlpha(0.55)
      }
    })
  }

  function handleClick(movement: { position: Cesium.Cartesian2 }): void {
    const current = currentViewer()
    if (!current) return
    const picked = current.scene.pickPositionSupported ? current.scene.pickPosition(movement.position) : undefined
    const cartesian = picked ?? current.camera.pickEllipsoid(movement.position)
    if (!cartesian) return
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
    const longitude = Cesium.Math.toDegrees(cartographic.longitude)
    const latitude = Cesium.Math.toDegrees(cartographic.latitude)
    if (picks.length >= 2) clearComparison()
    picks.push({ label: picks.length === 0 ? 'A' : 'B', longitude, latitude })
    if (!dataSource) {
      dataSource = new Cesium.CustomDataSource('timezone-compare')
      current.dataSources.add(dataSource)
    }
    addPick(picks[picks.length - 1], picks.length === 1 ? PICK_A_COLOR : PICK_B_COLOR)
    if (picks.length === 2) {
      const rawDifference = (picks[1].longitude - picks[0].longitude) / 15
      comparison.value = {
        picks: [...picks],
        differenceHours: ((((rawDifference + 12) % 24) + 24) % 24) - 12
      }
    }
  }

  watch(
    [() => drawingStore.activeTool, viewer],
    ([tool]) => {
      const current = currentViewer()
      if (tool === 'timezone' && current && !handler) {
        handler = new Cesium.ScreenSpaceEventHandler(current.scene.canvas)
        handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      } else if (tool !== 'timezone' && handler) {
        handler.destroy()
        handler = undefined
        clearComparison()
      }
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    if (handler) {
      handler.destroy()
      handler = undefined
    }
    clearEntities()
  })

  return { comparison, clearComparison, closeTimezoneCompare }
}
