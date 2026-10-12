import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useVisibleAnimation } from './useVisibleAnimation'
import * as Cesium from 'cesium'
import type { EarthquakeEvent, EarthquakeFeed, ProvinceGeoDocument } from '../../../preload'
import { thematicLayerCatalog, useClimateStore, type ThematicLayerId } from '@renderer/stores/climate'
import { useSolarStore } from '@renderer/stores/solar'
import { useFailureStore } from '@renderer/stores/failure'
import { beltLabel, beltLabelPosition, beltOpacity, beltRing } from '@renderer/thematic/rainBelt'
import { summerMonsoonArrows, winterMonsoonArrows } from '@renderer/thematic/monsoonArrows'
import { oceanCurrents, pathPointAt } from '@renderer/thematic/oceanCurrents'
import { climateZones } from '@renderer/thematic/climateZones'
import { coriolisDemos, sampleTrack } from '@renderer/thematic/coriolis'
import { beltCenter, beltRingDegrees, pressureBelts, windBeltLatitude, windBelts, type PressureBeltSpec, type WindBeltSpec } from '@renderer/thematic/pressureBelts'
import { koppenZones } from '@renderer/thematic/koppenZones'
import { nearestBoundary, plateBoundaries, plateBoundaryKindName } from '@renderer/thematic/plateBoundaries'
import { volcanoes } from '@renderer/thematic/volcanoes'
import { temperatureZoneBands, temperatureZoneLines } from '@renderer/thematic/temperatureZones'
import { typhoonIntensityStyles, typhoonTracks } from '@renderer/thematic/typhoonTracks'
import { ensoAnomalyColor, ensoPhaseMeta } from '@renderer/thematic/ensoPhases'
import { subsolarPointDeg } from '@renderer/thematic/solarMath'
import { densityColor, densityOf, fanMigrationEndpoints, huLineEndpoints, huLineFacts, huLinePath, migrationFacts, migrationFlows, provincePopulation, provinceSummary, smoothMigrationPath } from '@renderer/thematic/populationCensus'
import { cityTierOf, FUNCTIONAL_ZONES, urbanCities, wuhanFunctionalDistricts } from '@renderer/thematic/urbanCities'
import { agriCategoryOf, agriculturalRegions, agriFacts, agriRegionSummary } from '@renderer/thematic/agriculturalRegions'
import { industrialBases, industrialTransferFacts, industrialTransferFlows } from '@renderer/thematic/industrialBases'
import { HSR_COLOR, hsrFacts, hsrLines } from '@renderer/thematic/hsrLines'
import { cacheKeyOf, coastalZones, gridPointsOf, heightCache, isLandCell, isInundated, scenarioSummary, SEA_COLOR } from '@renderer/thematic/seaLevelRise'
import { ensureSeaLevelSamples } from '@renderer/composables/seaLevelSampling'
import { useGlobeStore } from '@renderer/stores/globe'
import { useTransportStore } from '@renderer/stores/transport'

const WARM_COLOR = '#f5222d'
const COLD_COLOR = '#1677ff'
const RAIN_BELT_COLOR = '#1677ff'
const CORIOLIS_NORTH_COLOR = '#1677ff'
const CORIOLIS_SOUTH_COLOR = '#fa8c16'
const CORIOLIS_INERTIAL_COLOR = 'rgba(0, 0, 0, 0.45)'
const WIND_BELT_COLOR = '#722ed1'
const PLATE_DIVERGENT_COLOR = '#1677ff'
const PLATE_CONVERGENT_COLOR = '#f5222d'
const PLATE_TRANSFORM_COLOR = '#fa8c16'
const VOLCANO_COLOR = '#fa541c'
const SUBSOLAR_COLOR = '#fa8c16'
const ZONE_LINE_COLOR = 'rgba(0, 0, 0, 0.55)'
const TYPHOON_INTENSITY_COLOR = '#f5222d'
const TYPHOON_TRACK_COLOR = '#fa541c'
const TYPHOON_ANCHOR_LON = 138
const TYPHOON_ANCHOR_LAT = 15
const ENSO_BAND_LATITUDE = 20
const FRONTAL_CYCLONE_LON = 125
const FRONTAL_CYCLONE_LAT = 34
const BELT_LABEL_LON = 150
const WIND_ARROW_LONS = [-150, -90, -30, 30, 90, 150]
const LABEL_FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'
const HU_LINE_COLOR = '#531dab'
const MIGRATION_FLOW_COLOR = '#fa8c16'
const PROVINCE_BORDER_COLOR = 'rgba(0, 0, 0, 0.35)'
const INDUSTRIAL_TRANSFER_COLOR = '#722ed1'
const HU_LINE_MID_LON = 112.5
const HU_LINE_MID_LAT = 36.5

interface LayerView {
  longitude: number
  latitude: number
  height: number
}

function labelFont(size: number, weight = 400): string {
  return `${weight === 400 ? '' : `${weight} `}${size}px ${LABEL_FONT_FAMILY}`
}

function toCartesians(points: Array<[number, number]>): Cesium.Cartesian3[] {
  return Cesium.Cartesian3.fromDegreesArray(points.flat())
}

function toRingCartesians(points: Array<[number, number]>): Cesium.Cartesian3[] {
  return toCartesians(points).filter((cartesian, index, all) => index === 0 || !Cesium.Cartesian3.equals(cartesian, all[index - 1]))
}

interface LabeledPolygonRegionSpec {
  properties: Cesium.PropertyBag
  rings: Array<Array<[number, number]>>
  color: Cesium.Color
  fillAlpha: number
  lineAlpha: number
  lineWidth: number
  labelText: string
  labelAt: [number, number]
  labelFontSize: number
  labelPadding: [number, number]
  labelMaxDistance?: number
}

function addLabeledPolygonRegion(dataSource: Cesium.CustomDataSource, spec: LabeledPolygonRegionSpec): void {
  for (const ring of spec.rings) {
    dataSource.entities.add({
      properties: spec.properties,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(toRingCartesians(ring)),
        material: new Cesium.ColorMaterialProperty(spec.color.withAlpha(spec.fillAlpha))
      }
    })
    dataSource.entities.add({
      properties: spec.properties,
      polyline: {
        positions: toCartesians(ring),
        clampToGround: true,
        width: spec.lineWidth,
        material: spec.color.withAlpha(spec.lineAlpha)
      }
    })
  }
  dataSource.entities.add({
    properties: spec.properties,
    position: Cesium.Cartesian3.fromDegrees(spec.labelAt[0], spec.labelAt[1]),
    label: {
      text: spec.labelText,
      font: labelFont(spec.labelFontSize, 600),
      fillColor: spec.color,
      showBackground: true,
      backgroundColor: Cesium.Color.WHITE.withAlpha(0.75),
      backgroundPadding: new Cesium.Cartesian2(spec.labelPadding[0], spec.labelPadding[1]),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: spec.labelMaxDistance !== undefined
        ? new Cesium.DistanceDisplayCondition(0, spec.labelMaxDistance)
        : undefined
    }
  })
}

interface LabeledPointOverlaySpec {
  properties: Cesium.PropertyBag
  longitude: number
  latitude: number
  color: Cesium.Color
  labelText: string
  pixelSize: number
  labelFontWeight?: number
  labelFillColor?: Cesium.Color
  backgroundAlpha?: number
  pixelOffset?: [number, number]
  labelMaxDistance?: number
}

function addLabeledPointOverlay(dataSource: Cesium.CustomDataSource, spec: LabeledPointOverlaySpec): void {
  dataSource.entities.add({
    properties: spec.properties,
    position: Cesium.Cartesian3.fromDegrees(spec.longitude, spec.latitude),
    point: {
      pixelSize: spec.pixelSize,
      color: spec.color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 1.6,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: spec.labelText,
      font: labelFont(12, spec.labelFontWeight ?? 600),
      fillColor: spec.labelFillColor ?? spec.color,
      showBackground: true,
      backgroundColor: Cesium.Color.WHITE.withAlpha(spec.backgroundAlpha ?? 0.78),
      backgroundPadding: new Cesium.Cartesian2(6, 3),
      pixelOffset: new Cesium.Cartesian2(spec.pixelOffset?.[0] ?? 0, spec.pixelOffset?.[1] ?? -18),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: spec.labelMaxDistance !== undefined
        ? new Cesium.DistanceDisplayCondition(0, spec.labelMaxDistance)
        : undefined
    }
  })
}

function arrowHeadPositions(from: [number, number], to: [number, number], size: number): Cesium.Cartesian3[] {
  const latMidRad = (((from[1] + to[1]) / 2) * Math.PI) / 180
  const cosLat = Math.max(0.25, Math.cos(latMidRad))
  const dx = (to[0] - from[0]) * cosLat
  const dy = to[1] - from[1]
  const norm = Math.hypot(dx, dy) || 1
  const dirX = dx / norm
  const dirY = dy / norm
  const perpX = -dirY
  const perpY = dirX
  const tipLon = to[0] + (dirX * size) / cosLat
  const tipLat = to[1] + dirY * size
  const baseLon = to[0] - (dirX * size * 1.6) / cosLat
  const baseLat = to[1] - dirY * size * 1.6
  return Cesium.Cartesian3.fromDegreesArray([
    tipLon, tipLat,
    baseLon + (perpX * size) / cosLat, baseLat + perpY * size,
    baseLon - (perpX * size) / cosLat, baseLat - perpY * size
  ])
}

const MONSOON_RIBBON_SAMPLES = 40
const MONSOON_RIBBON_WIDTH = 1.5

function monsoonWidthProfile(t: number): number {
  const ramp = Math.min(1, t / 0.45)
  return 0.34 + 0.66 * ramp * ramp * (3 - 2 * ramp)
}

function monsoonRibbonPositions(smooth: Array<[number, number]>, maxWidthDeg: number): { body: Cesium.Cartesian3[]; head: Cesium.Cartesian3[] } {
  const total = migrationPathLength(smooth)
  const headBaseFrac = Math.max(0.3, 1 - (maxWidthDeg * 1.6) / total)
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i <= MONSOON_RIBBON_SAMPLES; i += 1) {
    const point = pathPointAt(smooth, (i / MONSOON_RIBBON_SAMPLES) * headBaseFrac)
    const [lon, lat] = point.position
    const cosLat = Math.max(0.25, Math.cos((lat * Math.PI) / 180))
    const half = maxWidthDeg * monsoonWidthProfile(i / MONSOON_RIBBON_SAMPLES)
    const perpX = -point.direction[1]
    const perpY = point.direction[0]
    left.push(lon + (perpX * half) / cosLat, lat + perpY * half)
    right.unshift(lon - (perpX * half) / cosLat, lat - perpY * half)
  }
  const body = Cesium.Cartesian3.fromDegreesArray([...left, ...right])
  const base = pathPointAt(smooth, headBaseFrac).position
  const tip = pathPointAt(smooth, 1).position
  return { body, head: arrowHeadPositions(base, tip, maxWidthDeg) }
}

function monsoonLabelAt(smooth: Array<[number, number]>, offset = 3.2): [number, number] {
  const point = pathPointAt(smooth, 0.5)
  const cosLat = Math.max(0.25, Math.cos((point.position[1] * Math.PI) / 180))
  return [
    point.position[0] - (point.direction[1] * offset) / cosLat,
    point.position[1] + point.direction[0] * offset
  ]
}

function migrationPathLength(path: Array<[number, number]>): number {
  let length = 0
  for (let index = 1; index < path.length; index += 1) {
    const [fromLon, fromLat] = path[index - 1]
    const [toLon, toLat] = path[index]
    const cosLat = Math.max(0.25, Math.cos(((fromLat + toLat) * 0.5 * Math.PI) / 180))
    length += Math.hypot((toLon - fromLon) * cosLat, toLat - fromLat)
  }
  return length
}

function migrationArrowHeadPositions(path: Array<[number, number]>, size: number): Cesium.Cartesian3[] {
  const tip = pathPointAt(path, 1)
  const cosLat = Math.max(0.25, Math.cos((tip.position[1] * Math.PI) / 180))
  const [dirX, dirY] = tip.direction
  const baseDistance = size * 1.7
  const halfWidth = size * 0.45
  const baseLon = tip.position[0] - (dirX * baseDistance) / cosLat
  const baseLat = tip.position[1] - dirY * baseDistance
  const perpX = -dirY
  const perpY = dirX
  return Cesium.Cartesian3.fromDegreesArray([
    tip.position[0], tip.position[1],
    baseLon + (perpX * halfWidth) / cosLat, baseLat + perpY * halfWidth,
    baseLon - (perpX * halfWidth) / cosLat, baseLat - perpY * halfWidth
  ])
}

function migrationHeadSize(path: Array<[number, number]>): number {
  return Math.min(0.4, Math.max(0.16, migrationPathLength(path) * 0.03))
}

function migrationLabelAt(path: Array<[number, number]>, offset: number): [number, number] {
  const point = pathPointAt(path, 0.52)
  const cosLat = Math.max(0.25, Math.cos((point.position[1] * Math.PI) / 180))
  const [dirX, dirY] = point.direction
  return [
    point.position[0] + (dirY * offset) / cosLat,
    point.position[1] - dirX * offset
  ]
}

export function useThematicLayers(viewer: Ref<Cesium.Viewer | undefined>): void {
  const store = useClimateStore()
  const solarStore = useSolarStore()
  const transportStore = useTransportStore()
  const failureStore = useFailureStore()
  const globeStore = useGlobeStore()
  const sources = new Map<ThematicLayerId, Cesium.CustomDataSource>()
  const coriolisProgress = ref(0)
  useVisibleAnimation(() => store.overlays['coriolis-demo'] && Boolean(viewer.value), (dt) => {
    if (dt > 0) coriolisProgress.value = (coriolisProgress.value + dt / 10) % 1
    const current = viewer.value
    if (current && !current.isDestroyed()) current.scene.requestRender()
  })

  let rainBeltEntity: Cesium.Entity | undefined
  let subsolarEntity: Cesium.Entity | undefined
  const seasonalCurrents: Array<{ entity: Cesium.Entity; season: 'summer' | 'winter' }> = []

  function refreshRainBelt(month: number): void {
    const entity = rainBeltEntity
    if (!entity?.polygon || !entity.label) return
    entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(beltRing(month))))
    entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(RAIN_BELT_COLOR).withAlpha(beltOpacity(month) * 0.7))
    entity.polygon.show = new Cesium.ConstantProperty(beltOpacity(month) > 0.02)
    const [lon, lat] = beltLabelPosition(month)
    entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(lon, lat))
    entity.label.text = new Cesium.ConstantProperty(beltLabel(month))
    entity.label.show = new Cesium.ConstantProperty(beltOpacity(month) > 0.05 && beltLabel(month) !== '')
  }

  function refreshSubsolarPoint(): void {
    if (!subsolarEntity?.label) return
    const point = subsolarPointDeg(solarStore.utcMs)
    subsolarEntity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude))
    subsolarEntity.label.text = new Cesium.ConstantProperty(`直射点 ${Math.abs(point.latitude).toFixed(1)}°${point.latitude >= 0 ? 'N' : 'S'}`)
  }

  function refreshSeasonalCurrents(): void {
    for (const { entity, season } of seasonalCurrents) entity.show = (season === 'summer' ? store.summerStrength : store.winterStrength) > 0.5
  }

  function buildRainBelt(dataSource: Cesium.CustomDataSource): void {
    rainBeltEntity = dataSource.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy([])
      },
      position: Cesium.Cartesian3.ZERO,
      label: {
        text: '',
        show: false,
        font: labelFont(15, 600),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString(RAIN_BELT_COLOR),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
    refreshRainBelt(store.month)
  }

  function buildMonsoonArrows(dataSource: Cesium.CustomDataSource, season: 'summer' | 'winter'): void {
    const color = Cesium.Color.fromCssColorString(season === 'summer' ? WARM_COLOR : COLD_COLOR)
    const arrows = season === 'summer' ? summerMonsoonArrows : winterMonsoonArrows
    const labeled = new Set<string>()
    for (const arrow of arrows) {
      const smooth = smoothMigrationPath(arrow.path)
      const { body, head } = monsoonRibbonPositions(smooth, MONSOON_RIBBON_WIDTH)
      dataSource.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(body),
          material: color.withAlpha(0.5)
        }
      })
      dataSource.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(head),
          material: color.withAlpha(0.92)
        }
      })
      if (!labeled.has(arrow.label)) {
        labeled.add(arrow.label)
        const [lon, lat] = monsoonLabelAt(smooth)
        dataSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          label: {
            text: arrow.label,
            font: labelFont(13, 600),
            fillColor: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      }
    }
  }

  function buildOceanCurrents(dataSource: Cesium.CustomDataSource): void {
    for (const current of oceanCurrents) {
      const color = Cesium.Color.fromCssColorString(current.kind === 'warm' ? WARM_COLOR : COLD_COLOR)
      const add = (options: Cesium.Entity.ConstructorOptions): void => {
        const entity = dataSource.entities.add(options)
        if (current.season) seasonalCurrents.push({ entity, season: current.season })
      }
      add({
        polyline: {
          positions: toCartesians(current.path),
          clampToGround: true,
          width: current.major ? 4.5 : 3,
          material: color.withAlpha(0.8)
        }
      })
      for (const fraction of [0.35, 0.8]) {
        const back = pathPointAt(current.path, fraction)
        const front = pathPointAt(current.path, fraction + 0.03)
        add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(arrowHeadPositions(back.position, front.position, 1.5)),
            material: color.withAlpha(0.9)
          }
        })
      }
      const mid = pathPointAt(current.path, 0.55)
      add({
        position: Cesium.Cartesian3.fromDegrees(mid.position[0], mid.position[1]),
        label: {
          text: current.name,
          font: labelFont(12),
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
    refreshSeasonalCurrents()
  }

  function buildClimateZones(dataSource: Cesium.CustomDataSource): void {
    for (const zone of climateZones) {
      const color = Cesium.Color.fromCssColorString(zone.color)
      for (const ring of zone.rings) {
        dataSource.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(toCartesians(ring)),
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.28))
          }
        })
        dataSource.entities.add({
          polyline: {
            positions: toCartesians(ring),
            clampToGround: true,
            width: 2,
            material: color.withAlpha(0.85)
          }
        })
      }
      dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(zone.labelAt[0], zone.labelAt[1]),
        label: {
          text: zone.name,
          font: labelFont(14, 600),
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.72),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
  }

  function buildCoriolis(dataSource: Cesium.CustomDataSource): void {
    const inertialColor = Cesium.Color.fromCssColorString(CORIOLIS_INERTIAL_COLOR)
    for (const demo of coriolisDemos) {
      const deflectedColor = Cesium.Color.fromCssColorString(demo.id === 'north' ? CORIOLIS_NORTH_COLOR : CORIOLIS_SOUTH_COLOR)
      dataSource.entities.add({
        polyline: {
          positions: toCartesians(demo.inertial),
          clampToGround: true,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color: inertialColor })
        }
      })
      dataSource.entities.add({
        polyline: {
          positions: toCartesians(demo.deflected),
          clampToGround: true,
          width: 3.5,
          material: deflectedColor.withAlpha(0.9)
        }
      })
      for (const track of [demo.inertial, demo.deflected]) {
        const isDeflected = track === demo.deflected
        dataSource.entities.add({
          position: new Cesium.CallbackPositionProperty(() => {
            const [lon, lat] = sampleTrack(track, coriolisProgress.value)
            return Cesium.Cartesian3.fromDegrees(lon, lat)
          }, false, Cesium.ReferenceFrame.FIXED),
          point: {
            pixelSize: 9,
            color: isDeflected ? deflectedColor : Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.65)'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      }
      const deflectedEnd = demo.deflected[demo.deflected.length - 1]
      dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(demo.start[0], demo.start[1]),
        label: {
          text: demo.label,
          font: labelFont(13, 600),
          fillColor: Cesium.Color.WHITE,
          outlineColor: deflectedColor,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
      dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(deflectedEnd[0], deflectedEnd[1]),
        label: {
          text: demo.id === 'north' ? '向右偏转' : '向左偏转',
          font: labelFont(12, 600),
          fillColor: deflectedColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
  }

  const beltLinks: Array<{ entity: Cesium.Entity; spec: PressureBeltSpec }> = []
  const windArrowLinks: Array<{ entity: Cesium.Entity; spec: WindBeltSpec; lon: number }> = []
  const windLabelLinks: Array<{ entity: Cesium.Entity; spec: WindBeltSpec }> = []

  function clearPressureBeltLinks(): void {
    beltLinks.length = 0
    windArrowLinks.length = 0
    windLabelLinks.length = 0
  }

  function refreshPressureBeltGeometry(month: number): void {
    for (const link of beltLinks) {
      const cartesians = Cesium.Cartesian3.fromDegreesArray(beltRingDegrees(link.spec, month))
      if (link.entity.polygon) link.entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(cartesians))
      if (link.entity.polyline) link.entity.polyline.positions = new Cesium.ConstantProperty(cartesians)
      link.entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(BELT_LABEL_LON, beltCenter(link.spec, month)))
    }
    for (const link of windArrowLinks) {
      const latitude = windBeltLatitude(link.spec, month)
      const from: [number, number] = [link.lon + link.spec.tailOffset[0], latitude + link.spec.tailOffset[1]]
      const to: [number, number] = [link.lon + link.spec.headOffset[0], latitude + link.spec.headOffset[1]]
      const cartesians = Cesium.Cartesian3.fromDegreesArray([from[0], from[1], to[0], to[1]])
      if (link.entity.polyline) link.entity.polyline.positions = new Cesium.ConstantProperty(cartesians)
      if (link.entity.polygon) link.entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(arrowHeadPositions(from, to, 1.6)))
    }
    for (const link of windLabelLinks) {
      link.entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(BELT_LABEL_LON, windBeltLatitude(link.spec, month)))
    }
  }

  function buildPressureBelts(dataSource: Cesium.CustomDataSource): void {
    for (const spec of pressureBelts) {
      const color = Cesium.Color.fromCssColorString(spec.kind === 'low' ? COLD_COLOR : WARM_COLOR)
      beltLinks.push({
        spec,
        entity: dataSource.entities.add({
          properties: new Cesium.PropertyBag({ name: spec.name, layerId: 'pressure-belts', summary: spec.summary }),
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy([]),
            material: new Cesium.ColorMaterialProperty(color.withAlpha(spec.kind === 'low' ? 0.14 : 0.1))
          },
          polyline: {
            positions: [],
            clampToGround: true,
            width: 1.5,
            material: color.withAlpha(0.55)
          },
          position: Cesium.Cartesian3.fromDegrees(BELT_LABEL_LON, 0),
          label: {
            text: spec.name,
            font: labelFont(13, 600),
            fillColor: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      })
    }
    for (const spec of windBelts) {
      const color = Cesium.Color.fromCssColorString(WIND_BELT_COLOR)
      const properties = new Cesium.PropertyBag({ name: spec.name, layerId: 'pressure-belts', summary: spec.summary })
      for (const lon of WIND_ARROW_LONS) {
        windArrowLinks.push({
          spec,
          lon,
          entity: dataSource.entities.add({
            properties,
            polyline: { positions: [], clampToGround: true, width: 3, material: color.withAlpha(0.85) },
            polygon: { hierarchy: new Cesium.PolygonHierarchy([]), material: color.withAlpha(0.9) }
          })
        })
      }
      windLabelLinks.push({
        spec,
        entity: dataSource.entities.add({
          properties,
          position: Cesium.Cartesian3.fromDegrees(BELT_LABEL_LON, 0),
          label: {
            text: spec.name,
            font: labelFont(12, 600),
            fillColor: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      })
    }
    refreshPressureBeltGeometry(Math.round(store.month * 4) / 4)
  }

  function buildKoppenZones(dataSource: Cesium.CustomDataSource): void {
    for (const zone of koppenZones) {
      const fillColor = Cesium.Color.fromCssColorString(zone.color)
      const edgeColor = Cesium.Color.fromCssColorString(zone.borderColor ?? zone.color)
      const properties = new Cesium.PropertyBag({ name: zone.name, layerId: 'koppen-zones', summary: zone.summary })
      for (const [west, east, south, north] of zone.boxes) {
        const ring: Array<[number, number]> = [[west, south], [east, south], [east, north], [west, north]]
        const ringPositions = toRingCartesians([...ring, ring[0]])
        if (ringPositions.length < 4) continue
        dataSource.entities.add({
          properties,
          polygon: { hierarchy: new Cesium.PolygonHierarchy(toRingCartesians(ring)), material: new Cesium.ColorMaterialProperty(fillColor.withAlpha(0.3)) },
          polyline: { positions: ringPositions, clampToGround: true, width: 1.5, material: edgeColor.withAlpha(0.85) }
        })
      }
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(zone.labelAt[0], zone.labelAt[1]),
        label: {
          text: zone.name,
          font: labelFont(13, 600),
          fillColor: edgeColor,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.72),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
  }

  function buildFrontalCyclone(dataSource: Cesium.CustomDataSource): void {
    dataSource.entities.add({
      properties: new Cesium.PropertyBag({
        name: '锋面气旋（北半球温带气旋）',
        layerId: 'frontal-cyclone',
        summary: '温带气旋多形成于中纬西风带的极锋上：冷暖空气相遇形成锋面，锋面上产生波动并发展为低压中心，北半球气流逆时针向中心辐合，波动东段为暖锋、西南段为冷锋。暖锋前暖气团沿锋面爬升，形成连续性降水的宽阔雨带；冷锋锋后冷空气推动锋面快速东移，多大风与阵性降水、雨带狭窄。气旋整体自西向东移动，先后经历：暖锋过境（连续性降水）→ 暖气团控制（气温升、气压降）→ 冷锋过境（大风、雨雪）→ 冷气团控制（气温降、气压升）。'
      }),
      position: Cesium.Cartesian3.fromDegrees(FRONTAL_CYCLONE_LON, FRONTAL_CYCLONE_LAT),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString(WIND_BELT_COLOR),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
  }

  function plateBoundaryColor(kind: 'divergent' | 'convergent' | 'transform'): Cesium.Color {
    return Cesium.Color.fromCssColorString(
      kind === 'divergent' ? PLATE_DIVERGENT_COLOR : kind === 'convergent' ? PLATE_CONVERGENT_COLOR : PLATE_TRANSFORM_COLOR
    )
  }

  function quakeStyle(magnitude: number): { color: string; pixelSize: number } {
    if (magnitude >= 7) return { color: '#f5222d', pixelSize: 12 }
    if (magnitude >= 6.5) return { color: '#fa541c', pixelSize: 9 }
    if (magnitude >= 5.5) return { color: '#fa8c16', pixelSize: 7 }
    return { color: '#faad14', pixelSize: 5 }
  }

  function earthquakeSummary(event: EarthquakeEvent): string {
    const nearest = nearestBoundary(event.longitude, event.latitude)
    const distanceKm = Math.round(nearest.distanceKm)
    const boundaryNote = distanceKm <= 600
      ? `震中位于「${nearest.boundary.name}」（${plateBoundaryKindName[nearest.boundary.kind]}）约 ${distanceKm} 千米处，与板块运动关系密切。`
      : `震中距最近的板块边界「${nearest.boundary.name}」约 ${distanceKm} 千米，属板块内部（板缘远端）的地震活动。`
    return `${event.place}发生 M${event.magnitude} 地震，震源深度约 ${event.depthKm} 千米。${boundaryNote}地震是地壳应力积累超过岩层强度后快速释放能量并以地震波传播的结果，全球地震大多分布于板块边界及其附近。`
  }

  async function addEarthquakeEntities(dataSource: Cesium.CustomDataSource): Promise<void> {
    let feed: EarthquakeFeed
    try {
      feed = await window.guEarth.datasets.getEarthquakes()
    } catch {
      if (sources.get('plate-tectonics') === dataSource) {
        failureStore.reportFailure({ scope: 'dataset', message: '近期地震数据获取失败，本次仅显示板块边界与火山', detail: '网络恢复后点击重试即可补上地震点', retryable: true })
      }
      return
    }
    if (sources.get('plate-tectonics') !== dataSource) return
    failureStore.clearFailure('dataset')
    buildEntities(dataSource, () => {
      for (const entity of [...dataSource.entities.values]) {
        if (entity.id.startsWith('earthquake-')) dataSource.entities.remove(entity)
      }
      for (const [index, event] of feed.events.entries()) {
        const style = quakeStyle(event.magnitude)
        dataSource.entities.add({
          id: `earthquake-${index}`,
          properties: new Cesium.PropertyBag({
            name: `M${event.magnitude} 地震`,
            layerId: 'plate-tectonics',
            summary: earthquakeSummary(event)
          }),
          position: Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude),
          point: {
            pixelSize: style.pixelSize,
            color: Cesium.Color.fromCssColorString(style.color),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      }
    })
    viewer.value?.scene.requestRender()
  }

  function buildPlateTectonics(dataSource: Cesium.CustomDataSource): void {
    for (const boundary of plateBoundaries) {
      const color = plateBoundaryColor(boundary.kind)
      const properties = new Cesium.PropertyBag({
        name: boundary.name,
        layerId: 'plate-tectonics',
        summary: `${plateBoundaryKindName[boundary.kind]}。${boundary.summary}`
      })
      dataSource.entities.add({
        properties,
        polyline: {
          positions: toCartesians(boundary.path),
          clampToGround: true,
          width: boundary.kind === 'convergent' ? 4.5 : 3,
          material: color.withAlpha(0.9)
        }
      })
      const mid = pathPointAt(boundary.path, 0.55)
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(mid.position[0], mid.position[1]),
        label: {
          text: boundary.name,
          font: labelFont(12, 600),
          fillColor: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 7000000)
        }
      })
    }
    for (const volcano of volcanoes) {
      const color = Cesium.Color.fromCssColorString(VOLCANO_COLOR)
      const properties = new Cesium.PropertyBag({
        name: `${volcano.name}（${volcano.region}）`,
        layerId: 'plate-tectonics',
        summary: `${volcano.summary}海拔约 ${volcano.heightM} 米。火山是岩浆喷出地表形成的山体，多分布于板块边界（尤其消亡边界）与地壳薄弱地带。`
      })
      dataSource.entities.add({
        properties,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray([
            volcano.lon, volcano.lat + 0.55,
            volcano.lon - 0.42, volcano.lat - 0.3,
            volcano.lon + 0.42, volcano.lat - 0.3
          ])),
          material: color.withAlpha(0.95)
        }
      })
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(volcano.lon, volcano.lat),
        label: {
          text: volcano.name,
          font: labelFont(11, 600),
          fillColor: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2600000)
        }
      })
    }
    void addEarthquakeEntities(dataSource)
  }

  function buildTemperatureZones(dataSource: Cesium.CustomDataSource): void {
    for (const band of temperatureZoneBands) {
      const color = Cesium.Color.fromCssColorString(band.color)
      const properties = new Cesium.PropertyBag({ name: band.name, layerId: 'temperature-zones', summary: band.summary })
      for (const west of [-180, -90, 0, 90]) {
        const south = Math.max(-89.9, band.south)
        const north = Math.min(89.9, band.north)
        dataSource.entities.add({
          properties,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray([
              west, south, west + 90, south, west + 90, north, west, north
            ])),
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.12))
          }
        })
      }
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(band.labelAt[0], band.labelAt[1]),
        label: {
          text: band.name,
          font: labelFont(14, 600),
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.72),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
    const lineColor = Cesium.Color.fromCssColorString(ZONE_LINE_COLOR)
    for (const line of temperatureZoneLines) {
      const properties = new Cesium.PropertyBag({ name: line.name, layerId: 'temperature-zones', summary: line.summary })
      dataSource.entities.add({
        properties,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([-180, line.latitude, -90, line.latitude, 0, line.latitude, 90, line.latitude, 180, line.latitude]),
          clampToGround: true,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color: lineColor })
        }
      })
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(line.labelLon, line.latitude),
        label: {
          text: `${line.name}（${Math.abs(line.latitude).toFixed(1)}°${line.latitude > 0 ? 'N' : 'S'}）`,
          font: labelFont(12, 600),
          fillColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.65)'),
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.72),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
    const subsolarColor = Cesium.Color.fromCssColorString(SUBSOLAR_COLOR)
    subsolarEntity = dataSource.entities.add({
      properties: new Cesium.PropertyBag({
        name: '太阳直射点',
        layerId: 'temperature-zones',
        summary: '太阳光线垂直照射的地面位置。直射点以直射纬度在最北 23.5°N 与最南 23.5°S 之间做回归运动：春分指向赤道，夏至最北，秋分返回赤道，冬至最南，周期为一个回归年。调节日期、时刻或播放「回归运动」即可观察其移动。'
      }),
      position: Cesium.Cartesian3.ZERO,
      point: {
        pixelSize: 10,
        color: subsolarColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: '',
        font: labelFont(13, 600),
        fillColor: subsolarColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
    refreshSubsolarPoint()
  }

  function buildTyphoon(dataSource: Cesium.CustomDataSource): void {
    dataSource.entities.add({
      properties: new Cesium.PropertyBag({
        name: '台风（热带气旋）结构锚点',
        layerId: 'typhoon',
        summary: '台风是形成于热带、副热带洋面上强度达到一定级别的热带气旋（中心风力 12 级以上），西北太平洋是全球台风发生最多的海区。结构自内向外分为三部分：台风眼（中心 10~50 千米范围内无风少云、气压最低）、眼墙（环绕眼区的高耸对流云墙，狂风暴雨最强烈）、外围漩涡风雨区（螺旋云雨带，风速与降水向外减弱）。北半球气流逆时针向中心辐合旋转，夏秋季（7~10 月）最活跃。'
      }),
      position: Cesium.Cartesian3.fromDegrees(TYPHOON_ANCHOR_LON, TYPHOON_ANCHOR_LAT),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString(TYPHOON_INTENSITY_COLOR),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
    for (const track of typhoonTracks) {
      const trackColor = Cesium.Color.fromCssColorString(TYPHOON_TRACK_COLOR)
      const properties = new Cesium.PropertyBag({ name: `${track.year} 年第${track.name}台风路径`, layerId: 'typhoon', summary: track.summary })
      for (let index = 0; index < track.points.length - 1; index += 1) {
        const from = track.points[index]
        const to = track.points[index + 1]
        const stronger = Math.max(
          Object.keys(typhoonIntensityStyles).indexOf(from.intensity),
          Object.keys(typhoonIntensityStyles).indexOf(to.intensity)
        )
        const intensityKey = Object.keys(typhoonIntensityStyles)[stronger] as keyof typeof typhoonIntensityStyles
        dataSource.entities.add({
          properties,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray([from.longitude, from.latitude, to.longitude, to.latitude]),
            clampToGround: true,
            width: 3.5,
            material: Cesium.Color.fromCssColorString(typhoonIntensityStyles[intensityKey].color).withAlpha(0.9)
          }
        })
      }
      for (const point of track.points) {
        const note = point.note ? `。${point.note}` : ''
        dataSource.entities.add({
          properties: new Cesium.PropertyBag({
            name: `${track.name}（${track.englishName}，${track.year}）`,
            layerId: 'typhoon',
            summary: `${track.year} 年台风「${track.name}」（${track.englishName}）路径点：位于 ${point.longitude.toFixed(1)}°E，${Math.abs(point.latitude).toFixed(1)}°${point.latitude >= 0 ? 'N' : 'S'}，强度为${typhoonIntensityStyles[point.intensity].name}${note}。${track.summary}`
          }),
          position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude),
          point: {
            pixelSize: 6,
            color: Cesium.Color.fromCssColorString(typhoonIntensityStyles[point.intensity].color),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      }
      const mid = track.points[Math.floor(track.points.length / 2)]
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(mid.longitude, mid.latitude),
        label: {
          text: `${track.name}·${track.year}`,
          font: labelFont(12, 600),
          fillColor: trackColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
  }

  function buildEnso(dataSource: Cesium.CustomDataSource): void {
    const phase = ensoPhaseMeta[store.ensoPhase]
    for (const item of phase.bands) {
      dataSource.entities.add({
        properties: new Cesium.PropertyBag({
          name: `ENSO 海温距平：${phase.name}`,
          layerId: 'enso',
          summary: `${phase.summary} 对地理格局的影响：${phase.impacts.map((line) => line).join('；')}。`
        }),
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(item.west, -ENSO_BAND_LATITUDE, item.east, ENSO_BAND_LATITUDE),
          material: Cesium.Color.fromCssColorString(ensoAnomalyColor(item.anomaly)).withAlpha(0.8)
        }
      })
    }
    dataSource.entities.add({
      properties: new Cesium.PropertyBag({
        name: 'Niño3.4 关键监测区',
        layerId: 'enso',
        summary: 'Niño3.4 区（5°N–5°S，170°W–120°W）海温距平是判定厄尔尼诺与拉尼娜的主要指标：距平持续 ≥ +0.5℃ 判定为厄尔尼诺事件，≤ -0.5℃ 判定为拉尼娜事件。'
      }),
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([-170, -5, -120, -5, -120, 5, -170, 5, -170, -5]),
        clampToGround: true,
        width: 2.5,
        material: Cesium.Color.fromCssColorString('#531dab')
      }
    })
  }

  function buildHuLine(dataSource: Cesium.CustomDataSource): void {
    const lineColor = Cesium.Color.fromCssColorString(HU_LINE_COLOR)
    const properties = new Cesium.PropertyBag({
      name: '胡焕庸线（黑河—腾冲线）',
      layerId: 'hu-line',
      summary: `${huLineFacts[1]}${huLineFacts[2]}${huLineFacts[3]}`
    })
    dataSource.entities.add({
      properties,
      polyline: {
        positions: toCartesians(huLinePath),
        clampToGround: true,
        width: 2.5,
        material: new Cesium.PolylineDashMaterialProperty({ color: lineColor })
      }
    })
    for (const endpoint of huLineEndpoints) {
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(endpoint.longitude, endpoint.latitude),
        label: {
          text: endpoint.name,
          font: labelFont(13, 600),
          fillColor: lineColor,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }
    dataSource.entities.add({
      properties,
      position: Cesium.Cartesian3.fromDegrees(HU_LINE_MID_LON, HU_LINE_MID_LAT),
      label: {
        text: '胡焕庸线',
        font: labelFont(14, 600),
        fillColor: Cesium.Color.WHITE,
        outlineColor: lineColor,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })
  }

  function buildMigrationFlows(dataSource: Cesium.CustomDataSource): void {
    const color = Cesium.Color.fromCssColorString(MIGRATION_FLOW_COLOR)
    const overview = migrationFacts[0] + migrationFacts[3]
    const fannedEndpoints = fanMigrationEndpoints(migrationFlows)
    for (const flow of migrationFlows) {
      const rawPath = flow.path ?? [flow.from, flow.to]
      const endpoint = fannedEndpoints.get(flow) ?? flow.to
      const adjustedPath: Array<[number, number]> = [...rawPath.slice(0, -1), endpoint]
      const path = smoothMigrationPath(adjustedPath)
      const label = `${flow.fromName}→${flow.toName}`
      const properties = new Cesium.PropertyBag({
        name: `人口迁移流向：${label}`,
        layerId: 'migration-flows',
        summary: `人口由${flow.fromName}流向${flow.toName}${flow.note ? `（${flow.note}）` : ''}。${overview}`
      })
      const lengthDeg = migrationPathLength(path)
      const arcHeight = Math.min(380000, Math.max(40000, lengthDeg * 22000))
      const baseHeight = 0
      const heights = path.map((_, index) => {
        const t = index / (path.length - 1)
        return baseHeight + arcHeight * Math.sin(Math.PI * t)
      })
      dataSource.entities.add({
        properties,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(path.flatMap((point, index) => [point[0], point[1], heights[index]])),
          arcType: Cesium.ArcType.NONE,
          width: flow.weight === 'major' ? 3.5 : 2.2,
          material: color.withAlpha(flow.weight === 'major' ? 0.9 : 0.72)
        }
      })
      const headSize = migrationHeadSize(path)
      dataSource.entities.add({
        properties,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(migrationArrowHeadPositions(path, headSize)),
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          material: color.withAlpha(0.96)
        }
      })
      const primaryLabel = flow.weight === 'major' || flow.fromName === '甘肃' || flow.fromName === '黑龙江'
      const [lon, lat] = migrationLabelAt(path, primaryLabel ? 0.9 : 0.75)
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, arcHeight),
        label: {
          text: label,
          font: labelFont(12, 600),
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, primaryLabel ? 15000000 : 4200000)
        }
      })
    }
  }

  function circleRingDegrees(longitude: number, latitude: number, km: number, segments = 48): Array<[number, number]> {
    const ring: Array<[number, number]> = []
    const latRad = (latitude * Math.PI) / 180
    const degPerKmLng = 111.32 * Math.cos(latRad)
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * 2 * Math.PI
      ring.push([
        Number((longitude + (km * Math.cos(angle)) / Math.max(degPerKmLng, 1e-6)).toFixed(4)),
        Number((latitude + (km * Math.sin(angle)) / 110.57).toFixed(4))
      ])
    }
    return ring
  }

  function buildCityTiers(dataSource: Cesium.CustomDataSource): void {
    for (const city of urbanCities) {
      const tier = cityTierOf(city.tier)
      const color = Cesium.Color.fromCssColorString(tier.color)
      const properties = new Cesium.PropertyBag({
        name: `${city.name}（${tier.name}）`,
        layerId: 'city-tiers',
        summary: `${city.role}。常住人口 ${city.populationWan} 万${city.urbanizationPct !== null ? `，城镇化率 ${city.urbanizationPct}%` : ''}。${tier.description}。`
      })
      const pointSize = city.tier === 'national-center' ? 14 : city.tier === 'regional-center' ? 12 : city.tier === 'provincial-center' ? 10 : city.tier === 'prefecture' ? 8 : 6
      addLabeledPointOverlay(dataSource, {
        properties,
        longitude: city.longitude,
        latitude: city.latitude,
        color,
        labelText: city.name,
        pixelSize: pointSize,
        labelFontWeight: city.tier === 'county' ? 400 : 600,
        labelFillColor: Cesium.Color.fromCssColorString(city.tier === 'county' ? 'rgba(0,0,0,0.65)' : tier.color),
        backgroundAlpha: 0.72,
        pixelOffset: [0, -(pointSize + 9)],
        labelMaxDistance: city.tier === 'county' ? 6500000 : 17000000
      })
      const ring = circleRingDegrees(city.longitude, city.latitude, tier.serviceRadiusKm)
      dataSource.entities.add({
        properties,
        polyline: {
          positions: toCartesians(ring),
          clampToGround: true,
          width: 1.4,
          material: color.withAlpha(0.45)
        }
      })
    }
  }

  function buildFunctionalZones(dataSource: Cesium.CustomDataSource): void {
    for (const district of wuhanFunctionalDistricts) {
      const spec = FUNCTIONAL_ZONES.find((item) => item.kind === district.kind) ?? FUNCTIONAL_ZONES[0]
      const color = Cesium.Color.fromCssColorString(spec.color)
      const properties = new Cesium.PropertyBag({
        name: `${district.name}（${spec.name}）`,
        layerId: 'functional-zones',
        summary: `${district.note}。${spec.summary}`
      })
      const ringCartesians = toRingCartesians(circleRingDegrees(district.longitude, district.latitude, district.radiusKm, 48))
      dataSource.entities.add({
        properties,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(ringCartesians),
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          material: color.withAlpha(0.25)
        }
      })
      dataSource.entities.add({
        properties,
        polyline: {
          positions: ringCartesians,
          clampToGround: true,
          width: 2.2,
          material: color.withAlpha(0.9)
        }
      })
      addLabeledPointOverlay(dataSource, {
        properties,
        longitude: district.longitude,
        latitude: district.latitude,
        color,
        labelText: district.name,
        pixelSize: 9,
        labelMaxDistance: 600000
      })
    }
  }

  function buildAgriRegions(dataSource: Cesium.CustomDataSource): void {
    const overview = agriFacts[0]
    for (const region of agriculturalRegions) {
      const meta = agriCategoryOf(region.category)
      addLabeledPolygonRegion(dataSource, {
        properties: new Cesium.PropertyBag({
          name: `${region.name}（${meta.name}·${region.crop}）`,
          layerId: 'agri-regions',
          summary: `${agriRegionSummary(region)}${overview}`
        }),
        rings: region.rings,
        color: Cesium.Color.fromCssColorString(meta.color),
        fillAlpha: 0.22,
        lineAlpha: 0.8,
        lineWidth: 1.6,
        labelText: region.name,
        labelAt: region.labelAt,
        labelFontSize: 12,
        labelPadding: [6, 3],
        labelMaxDistance: region.category === 'grain' ? 10500000 : 7800000
      })
    }
  }

  function buildIndustrialBases(dataSource: Cesium.CustomDataSource): void {
    for (const base of industrialBases) {
      addLabeledPolygonRegion(dataSource, {
        properties: new Cesium.PropertyBag({
          name: base.name,
          layerId: 'industrial-bases',
          summary: `${base.summary}主导区位：${base.pillars.join('；')}。`
        }),
        rings: base.rings,
        color: Cesium.Color.fromCssColorString(base.color),
        fillAlpha: 0.24,
        lineAlpha: 0.85,
        lineWidth: 2,
        labelText: base.name,
        labelAt: base.labelAt,
        labelFontSize: 13,
        labelPadding: [7, 4]
      })
    }
  }

  function buildIndustrialTransfers(dataSource: Cesium.CustomDataSource): void {
    const color = Cesium.Color.fromCssColorString(INDUSTRIAL_TRANSFER_COLOR)
    const overview = industrialTransferFacts[0] + industrialTransferFacts[1]
    const fannedEndpoints = fanMigrationEndpoints(industrialTransferFlows)
    for (const flow of industrialTransferFlows) {
      const rawPath = flow.path ?? [flow.from, flow.to]
      const endpoint = fannedEndpoints.get(flow) ?? flow.to
      const adjustedPath: Array<[number, number]> = [...rawPath.slice(0, -1), endpoint]
      const path = smoothMigrationPath(adjustedPath)
      const label = `${flow.fromName}→${flow.toName}`
      const properties = new Cesium.PropertyBag({
        name: `产业转移：${label}`,
        layerId: 'industrial-transfers',
        summary: `产业由${flow.fromName}向${flow.toName}转移${flow.note ? `（${flow.note}）` : ''}。${overview}`
      })
      const lengthDeg = migrationPathLength(path)
      const arcHeight = Math.min(380000, Math.max(40000, lengthDeg * 22000))
      const heights = path.map((_, index) => {
        const t = index / (path.length - 1)
        return arcHeight * Math.sin(Math.PI * t)
      })
      dataSource.entities.add({
        properties,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(path.flatMap((point, index) => [point[0], point[1], heights[index]])),
          arcType: Cesium.ArcType.NONE,
          width: flow.weight === 'major' ? 3.5 : 2.2,
          material: color.withAlpha(flow.weight === 'major' ? 0.9 : 0.72)
        }
      })
      dataSource.entities.add({
        properties,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(migrationArrowHeadPositions(path, migrationHeadSize(path))),
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          material: color.withAlpha(0.96)
        }
      })
      const primaryLabel = flow.weight === 'major'
      const [lon, lat] = migrationLabelAt(path, primaryLabel ? 0.9 : 0.75)
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, arcHeight),
        label: {
          text: label,
          font: labelFont(12, 600),
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, primaryLabel ? 15000000 : 4600000)
        }
      })
    }
  }

  function buildHsrNetwork(dataSource: Cesium.CustomDataSource): void {
    const color = Cesium.Color.fromCssColorString(HSR_COLOR)
    const overview = hsrFacts[0]
    for (const line of hsrLines) {
      const properties = new Cesium.PropertyBag({
        name: `${line.name}（${line.openedYear} 年开通）`,
        layerId: 'hsr-network',
        summary: `${line.note}。全长约 ${line.lengthKm} 公里，设计时速 ${line.designSpeed} 公里。${overview}`
      })
      const opened = new Cesium.CallbackProperty(() => line.openedYear <= Math.floor(transportStore.year), false)
      dataSource.entities.add({
        properties,
        polyline: {
          positions: toCartesians(line.path),
          clampToGround: true,
          width: 2.6,
          material: color.withAlpha(0.9),
          show: opened
        }
      })
      const mid = line.path[Math.floor(line.path.length / 2)]
      dataSource.entities.add({
        properties,
        position: Cesium.Cartesian3.fromDegrees(mid[0], mid[1]),
        label: {
          text: `${line.name}·${line.openedYear}`,
          font: labelFont(11, 600),
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, line.lengthKm > 1000 ? 12000000 : 7500000),
          show: opened
        }
      })
    }
  }

  function buildSeaLevelRise(dataSource: Cesium.CustomDataSource): void {
    void addInundationCells(dataSource)
  }

  async function addInundationCells(dataSource: Cesium.CustomDataSource): Promise<void> {
    const current = viewer.value
    if (!current || current.isDestroyed()) return
    const outcome = await ensureSeaLevelSamples(current)
    if (sources.get('sea-level-rise') !== dataSource) return
    if (outcome === 'terrain-required') {
      failureStore.reportFailure({ scope: 'sea-level-terrain', message: '未加载真实地形，淹没模拟不可用', detail: '可能因启动时网络较慢，地形源已被自动降级为椭球。请在「图层管理 → 地形」选择「全球 3D 地形」，切换后本图层会自动重建', retryable: true })
      return
    }
    if (outcome === 'failed') {
      failureStore.reportFailure({ scope: 'sea-level-terrain', message: '地形采样失败，淹没模拟不可用', detail: '地形源不可达或网络受限，稍后点击重试', retryable: true })
      return
    }
    failureStore.clearFailure('sea-level-terrain')
    const rise = store.seaLevelRise
    const color = Cesium.Color.fromCssColorString(SEA_COLOR)
    const properties = new Cesium.PropertyBag({
      name: `海平面上升 +${rise} 米情景`,
      layerId: 'sea-level-rise',
      summary: scenarioSummary(rise)
    })
    for (const zone of coastalZones) {
      for (const [lon, lat] of gridPointsOf(zone)) {
        const height = heightCache.get(cacheKeyOf(lon, lat))
        if (height === undefined || !isLandCell(lon, lat, height) || !isInundated(height, rise)) continue
        const half = zone.step / 2
        dataSource.entities.add({
          properties,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray([lon - half, lat - half, lon + half, lat - half, lon + half, lat + half, lon - half, lat + half])
            ),
            height: rise,
            material: color.withAlpha(0.5)
          }
        })
      }
    }
    for (const zone of coastalZones) {
      dataSource.entities.add({
        properties: new Cesium.PropertyBag({
          name: zone.name,
          layerId: 'sea-level-rise',
          summary: `${zone.note}。${scenarioSummary(store.seaLevelRise)}`
        }),
        position: Cesium.Cartesian3.fromDegrees(zone.center[0], zone.center[1]),
        label: {
          text: zone.name,
          font: labelFont(12, 600),
          fillColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.65)'),
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.75),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9000000)
        }
      })
    }
  }

  function rebuildSeaLevelRise(): void {
    const current = viewer.value
    if (!current || current.isDestroyed()) return
    const existing = sources.get('sea-level-rise')
    if (!existing) return
    current.dataSources.remove(existing, true)
    sources.delete('sea-level-rise')
    const dataSource = new Cesium.CustomDataSource('sea-level-rise')
    try {
      buildSeaLevelRise(dataSource)
    } catch (error) {
      console.error('[thematic] failed to rebuild sea-level layer', error)
    }
    void current.dataSources.add(dataSource)
    sources.set('sea-level-rise', dataSource)
  }

  function provinceRingsToHierarchy(rings: number[][][]): Cesium.PolygonHierarchy | null {
    const [outer, ...holes] = rings.map((ring) => toRingCartesians(ring.map(([lon, lat]) => [lon, lat] as [number, number])))
    if (!outer || outer.length < 3) return null
    return new Cesium.PolygonHierarchy(
      outer,
      holes.filter((hole) => hole.length >= 3).map((hole) => new Cesium.PolygonHierarchy(hole))
    )
  }

  async function addProvinceEntities(dataSource: Cesium.CustomDataSource): Promise<void> {
    let document: ProvinceGeoDocument
    try {
      document = await window.guEarth.datasets.getProvinces()
    } catch {
      if (sources.get('province-population') === dataSource) {
        failureStore.reportFailure({ scope: 'province-dataset', message: '省级行政区划数据加载失败，人口密度图层不完整', detail: '重启应用可重新加载内置数据', retryable: false })
      }
      return
    }
    if (sources.get('province-population') !== dataSource) return
    failureStore.clearFailure('province-dataset')
    buildEntities(dataSource, () => {
      for (const feature of document.features) {
        const population = provincePopulation.find((item) => item.name === feature.name)
        if (!population) continue
        const fillColor = Cesium.Color.fromCssColorString(densityColor(densityOf(population)))
        const borderColor = Cesium.Color.fromCssColorString(PROVINCE_BORDER_COLOR)
        const properties = new Cesium.PropertyBag({
          name: feature.name,
          layerId: 'province-population',
          summary: provinceSummary(feature.name) ?? ''
        })
        for (const rings of feature.polygons) {
          const hierarchy = provinceRingsToHierarchy(rings)
          if (!hierarchy) continue
          dataSource.entities.add({
            properties,
            polygon: { hierarchy, material: new Cesium.ColorMaterialProperty(fillColor.withAlpha(0.65)) }
          })
          dataSource.entities.add({
            polyline: { positions: hierarchy.positions, clampToGround: true, width: 1.2, material: borderColor }
          })
        }
      }
    })
    viewer.value?.scene.requestRender()
  }

  function buildProvincePopulation(dataSource: Cesium.CustomDataSource): void {
    void addProvinceEntities(dataSource)
  }

  const builders: Record<ThematicLayerId, (dataSource: Cesium.CustomDataSource) => void> = {
    'wind-particles': () => undefined,
    'pressure-belts': buildPressureBelts,
    'koppen-zones': buildKoppenZones,
    'frontal-cyclone': buildFrontalCyclone,
    'rain-belt': buildRainBelt,
    'summer-monsoon': (dataSource) => buildMonsoonArrows(dataSource, 'summer'),
    'winter-monsoon': (dataSource) => buildMonsoonArrows(dataSource, 'winter'),
    'ocean-currents': buildOceanCurrents,
    'climate-zones': buildClimateZones,
    'coriolis-demo': buildCoriolis,
    'plate-tectonics': buildPlateTectonics,
    'temperature-zones': buildTemperatureZones,
    'typhoon': buildTyphoon,
    'enso': buildEnso,
    'province-population': buildProvincePopulation,
    'hu-line': buildHuLine,
    'migration-flows': buildMigrationFlows,
    'city-tiers': buildCityTiers,
    'functional-zones': buildFunctionalZones,
    'agri-regions': buildAgriRegions,
    'industrial-bases': buildIndustrialBases,
    'industrial-transfers': buildIndustrialTransfers,
    'hsr-network': buildHsrNetwork,
    'sea-level-rise': buildSeaLevelRise
  }

  const enableViews: Partial<Record<ThematicLayerId, LayerView>> = {
    'pressure-belts': { longitude: 150, latitude: 8, height: 17000000 },
    'koppen-zones': { longitude: 25, latitude: 12, height: 17000000 },
    'frontal-cyclone': { longitude: 125, latitude: 30, height: 4800000 },
    'rain-belt': { longitude: 112, latitude: 30, height: 4500000 },
    'summer-monsoon': { longitude: 96, latitude: 24, height: 7500000 },
    'winter-monsoon': { longitude: 108, latitude: 32, height: 7500000 },
    'ocean-currents': { longitude: 150, latitude: 8, height: 17000000 },
    'climate-zones': { longitude: 104, latitude: 34, height: 5200000 },
    'coriolis-demo': { longitude: 100, latitude: 0, height: 12000000 },
    'plate-tectonics': { longitude: 180, latitude: 5, height: 17000000 },
    'temperature-zones': { longitude: 20, latitude: 0, height: 17000000 },
    'typhoon': { longitude: 132, latitude: 18, height: 10500000 },
    'enso': { longitude: -155, latitude: 0, height: 9500000 },
    'province-population': { longitude: 104, latitude: 35, height: 11000000 },
    'hu-line': { longitude: 112, latitude: 36, height: 9000000 },
    'migration-flows': { longitude: 110, latitude: 30, height: 10000000 },
    'city-tiers': { longitude: 108, latitude: 33, height: 10500000 },
    'functional-zones': { longitude: 114.34, latitude: 30.56, height: 130000 },
    'agri-regions': { longitude: 108, latitude: 34, height: 9500000 },
    'industrial-bases': { longitude: 118, latitude: 32, height: 8500000 },
    'industrial-transfers': { longitude: 112, latitude: 28, height: 9000000 },
    'hsr-network': { longitude: 113, latitude: 33, height: 10000000 },
    'sea-level-rise': { longitude: 119.6, latitude: 31.6, height: 9500000 }
  }

  function buildEntities(dataSource: Cesium.CustomDataSource, build: () => void): void {
    dataSource.entities.suspendEvents()
    try {
      build()
    } finally {
      dataSource.entities.resumeEvents()
    }
  }

  function releaseLayer(id: ThematicLayerId): void {
    if (id === 'pressure-belts') clearPressureBeltLinks()
    if (id === 'rain-belt') rainBeltEntity = undefined
    if (id === 'temperature-zones') subsolarEntity = undefined
    if (id === 'ocean-currents') seasonalCurrents.length = 0
  }

  function clearSources(current?: Cesium.Viewer): void {
    for (const [id, source] of sources) {
      if (current && !current.isDestroyed()) current.dataSources.remove(source, true)
      releaseLayer(id)
    }
    sources.clear()
  }

  function syncOverlays(): void {
    const current = viewer.value
    if (!current || current.isDestroyed()) return
    for (const layer of thematicLayerCatalog) {
      const enabled = store.overlays[layer.id]
      const existing = sources.get(layer.id)
      if (enabled && !existing) {
        const dataSource = new Cesium.CustomDataSource(layer.id)
        sources.set(layer.id, dataSource)
        try {
          buildEntities(dataSource, () => builders[layer.id](dataSource))
        } catch (error) {
          sources.delete(layer.id)
          releaseLayer(layer.id)
          console.error(`[thematic] failed to build layer: ${layer.id}`, error)
          continue
        }
        void current.dataSources.add(dataSource).then(() => {
          if (viewer.value !== current || sources.get(layer.id) !== dataSource) {
            if (!current.isDestroyed()) current.dataSources.remove(dataSource, true)
            return
          }
          current.scene.requestRender()
        })
        const view = enableViews[layer.id]
        if (view) current.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(view.longitude, view.latitude, view.height), duration: 1.2 })
      } else if (!enabled && existing) {
        sources.delete(layer.id)
        current.dataSources.remove(existing, true)
        releaseLayer(layer.id)
        current.scene.requestRender()
      }
    }
  }

  watch(() => store.overlays, syncOverlays, { deep: true })
  watch(() => store.ensoPhase, () => {
    const current = viewer.value
    const source = sources.get('enso')
    if (!current || current.isDestroyed() || !source) return
    buildEntities(source, () => {
      source.entities.removeAll()
      buildEnso(source)
    })
    current.scene.requestRender()
  })
  failureStore.registerRetry('dataset', async () => {
    const dataSource = sources.get('plate-tectonics')
    if (!dataSource) {
      failureStore.clearFailure('dataset')
      return
    }
    await addEarthquakeEntities(dataSource)
  })
  failureStore.registerRetry('sea-level-terrain', async () => {
    if (!sources.get('sea-level-rise')) {
      failureStore.clearFailure('sea-level-terrain')
      return
    }
    rebuildSeaLevelRise()
  })
  watch(() => Math.round(store.month * 4) / 4, refreshPressureBeltGeometry)
  function requestRender(): void {
    const current = viewer.value
    if (current && !current.isDestroyed()) current.scene.requestRender()
  }
  watch(() => Math.round(store.month * 20) / 20, (month) => { refreshRainBelt(month); requestRender() })
  watch([() => store.summerStrength > 0.5, () => store.winterStrength > 0.5], () => { refreshSeasonalCurrents(); requestRender() })
  watch(() => solarStore.utcMs, () => { refreshSubsolarPoint(); requestRender() })
  watch(() => store.seaLevelRise, rebuildSeaLevelRise)
  watch(() => globeStore.activeTerrainId, () => {
    if (sources.get('sea-level-rise')) rebuildSeaLevelRise()
  })
  watch(viewer, (_current, previous) => {
    clearSources(previous)
    syncOverlays()
  }, { immediate: true })

  onBeforeUnmount(() => clearSources(viewer.value))
}
