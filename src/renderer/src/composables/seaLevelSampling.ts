import * as Cesium from 'cesium'
import {
  buildLandMask, cacheKeyOf, coastalZones, gridPointsOf, heightCache, landMask, recordSamples,
  seaSamplingStatus, setLandMask
} from '@renderer/thematic/seaLevelRise'
import { useFailureStore } from '@renderer/stores/failure'

export type SeaSampleOutcome = 'ready' | 'partial' | 'terrain-required' | 'failed'

let maskPromise: Promise<boolean> | undefined
let maskDegradeReported = false
let samplePromise: Promise<SeaSampleOutcome> | undefined

const allPointsCached = (): boolean =>
  coastalZones.every((zone) => gridPointsOf(zone).every(([lon, lat]) => heightCache.has(cacheKeyOf(lon, lat))))

export function ensureLandMask(): Promise<boolean> {
  if (landMask.value) return Promise.resolve(true)
  maskPromise ??= window.guEarth.datasets
    .getProvinces()
    .then((document) => {
      setLandMask(buildLandMask(document.features))
      return true
    })
    .catch(() => {
      maskPromise = undefined
      if (!maskDegradeReported) {
        maskDegradeReported = true
        useFailureStore().reportDegrade('省界海陆判定数据不可用，淹没模拟将按高程阈值粗略排除海面，面积估算可能偏差较大')
      }
      return false
    })
  return maskPromise
}

export async function ensureSeaLevelSamples(viewer: Cesium.Viewer): Promise<SeaSampleOutcome> {
  if (samplePromise) return samplePromise
  if (allPointsCached()) {
    seaSamplingStatus.value = 'ready'
    return 'ready'
  }
  samplePromise = (async (): Promise<SeaSampleOutcome> => {
    seaSamplingStatus.value = 'sampling'
    if (viewer.isDestroyed()) {
      seaSamplingStatus.value = 'idle'
      return 'failed'
    }
    if (viewer.scene.terrainProvider instanceof Cesium.EllipsoidTerrainProvider) {
      seaSamplingStatus.value = 'terrain-required'
      return 'terrain-required'
    }
    await ensureLandMask()
    const points = coastalZones.flatMap((zone) => gridPointsOf(zone))
    const cartographics = points.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat))
    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics)
      recordSamples(points, sampled.map((cartographic) => cartographic.height))
    } catch {
      recordSamples(points, cartographics.map((cartographic) => viewer.scene.globe.getHeight(cartographic) ?? Number.NaN))
    }
    if (!heightCache.size) {
      seaSamplingStatus.value = 'idle'
      return 'failed'
    }
    const missing = points.filter(([lon, lat]) => !heightCache.has(cacheKeyOf(lon, lat))).length
    seaSamplingStatus.value = 'ready'
    return missing > 0 ? 'partial' : 'ready'
  })()
  try {
    return await samplePromise
  } finally {
    samplePromise = undefined
  }
}
