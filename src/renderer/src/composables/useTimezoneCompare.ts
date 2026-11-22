import { useDrawingStore } from '@renderer/stores/drawing'
import { useSolarStore } from '@renderer/stores/solar'
import { formatClock, localSolarTime } from '@renderer/thematic/solarMath'
import * as Cesium from 'cesium'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface TimezonePick {
  label: 'A' | 'B'
  longitude: number
  latitude: number
}

export interface TimezoneComparison {
  picks: TimezonePick[]
  differenceHours: number
}

export interface UseTimezoneCompareResult {
  comparison: TimezoneComparison | null
  clearComparison: () => void
  closeTimezoneCompare: () => void
}

const PICK_A_COLOR = '#1677ff'
const PICK_B_COLOR = '#fa8c16'
const LABEL_FONT = '13px SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'

function utcHoursNow(): number {
  const solarStore = useSolarStore.getState()
  if (solarStore.active) return solarStore.utcHour
  const now = new Date()
  return now.getUTCHours() + now.getUTCMinutes() / 60
}

function longitudeText(longitude: number): string {
  return `${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`
}

export function useTimezoneCompare(viewer: Cesium.Viewer | undefined): UseTimezoneCompareResult {
  const activeTool = useDrawingStore(state => state.activeTool)
  const [comparison, setComparison] = useState<TimezoneComparison | null>(null)
  const viewerRef = useRef<Cesium.Viewer | undefined>(viewer)
  const dataSourceRef = useRef<Cesium.CustomDataSource | undefined>(undefined)
  const picksRef = useRef<TimezonePick[]>([])

  viewerRef.current = viewer

  const currentViewer = useCallback((): Cesium.Viewer | undefined => {
    const current = viewerRef.current
    return current && !current.isDestroyed() ? current : undefined
  }, [])

  const clearEntities = useCallback((): void => {
    const current = currentViewer()
    if (dataSourceRef.current) {
      if (current) current.dataSources.remove(dataSourceRef.current, true)
      dataSourceRef.current = undefined
    }
  }, [currentViewer])

  const clearComparison = useCallback((): void => {
    picksRef.current = []
    clearEntities()
    setComparison(null)
  }, [clearEntities])

  const closeTimezoneCompare = useCallback((): void => {
    useDrawingStore.getState().setActiveTool(null)
    clearComparison()
  }, [clearComparison])

  const addPick = useCallback(
    (pick: TimezonePick, color: string): void => {
      const current = currentViewer()
      const dataSource = dataSourceRef.current
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
            () =>
              `${pick.label} ${longitudeText(pick.longitude)} 地方时 ${formatClock(localSolarTime(utcHoursNow(), pick.longitude))}`,
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
          positions: Cesium.Cartesian3.fromDegreesArray([
            pick.longitude,
            84,
            pick.longitude,
            0,
            pick.longitude,
            -84
          ]),
          clampToGround: true,
          width: 1.5,
          material: cesiumColor.withAlpha(0.55)
        }
      })
    },
    [currentViewer]
  )

  const handleClick = useCallback(
    (movement: { position: Cesium.Cartesian2 }): void => {
      const current = currentViewer()
      if (!current) return
      const picked = current.scene.pickPositionSupported
        ? current.scene.pickPosition(movement.position)
        : undefined
      const cartesian = picked ?? current.camera.pickEllipsoid(movement.position)
      if (!cartesian) return
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
      const longitude = Cesium.Math.toDegrees(cartographic.longitude)
      const latitude = Cesium.Math.toDegrees(cartographic.latitude)
      if (picksRef.current.length >= 2) clearComparison()
      picksRef.current.push({
        label: picksRef.current.length === 0 ? 'A' : 'B',
        longitude,
        latitude
      })
      if (!dataSourceRef.current) {
        dataSourceRef.current = new Cesium.CustomDataSource('timezone-compare')
        current.dataSources.add(dataSourceRef.current)
      }
      addPick(
        picksRef.current[picksRef.current.length - 1],
        picksRef.current.length === 1 ? PICK_A_COLOR : PICK_B_COLOR
      )
      if (picksRef.current.length === 2) {
        const rawDifference = (picksRef.current[1].longitude - picksRef.current[0].longitude) / 15
        setComparison({
          picks: [...picksRef.current],
          differenceHours: ((((rawDifference + 12) % 24) + 24) % 24) - 12
        })
      }
    },
    [addPick, clearComparison, currentViewer]
  )

  useEffect(() => {
    const current = viewer && !viewer.isDestroyed() ? viewer : undefined
    if (activeTool !== 'timezone' || !current) {
      clearComparison()
      return
    }
    const handler = new Cesium.ScreenSpaceEventHandler(current.scene.canvas)
    handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    return () => {
      handler.destroy()
      if (dataSourceRef.current) {
        if (!current.isDestroyed()) current.dataSources.remove(dataSourceRef.current, true)
        dataSourceRef.current = undefined
      }
      picksRef.current = []
    }
  }, [activeTool, viewer, clearComparison, handleClick])

  return useMemo(
    () => ({ comparison, clearComparison, closeTimezoneCompare }),
    [comparison, clearComparison, closeTimezoneCompare]
  )
}
