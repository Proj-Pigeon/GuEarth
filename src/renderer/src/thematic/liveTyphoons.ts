import * as Cesium from 'cesium'
import type { LiveStorm, StormPoint, TyphoonFeed } from '../../../common/onlineData'
import type { TyphoonIntensityStyle } from './typhoonTracks'

export const liveTyphoonIntensityStyles: Record<string, TyphoonIntensityStyle> = {
  TD: { name: '热带低压', color: '#1677ff' },
  TS: { name: '热带风暴', color: '#13c2c2' },
  STS: { name: '强热带风暴', color: '#52c41a' },
  TY: { name: '台风', color: '#faad14' },
  STY: { name: '强台风', color: '#fa8c16' },
  SuperTY: { name: '超强台风', color: '#f5222d' }
}

export const unknownTyphoonIntensityStyle: TyphoonIntensityStyle = {
  name: '未知强度', color: 'rgba(0, 0, 0, 0.65)'
}

export function formatOnlineTime(value: string | number): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : '时间未知'
}

function intensityStyle(type: string): TyphoonIntensityStyle {
  return Object.hasOwn(liveTyphoonIntensityStyles, type) ? liveTyphoonIntensityStyles[type] : unknownTyphoonIntensityStyle
}

function validPoint(point: StormPoint): boolean {
  return Number.isFinite(Date.parse(point.time))
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
}

function orderedPoints(points: StormPoint[]): StormPoint[] {
  const byTime = new Map(points.filter(validPoint).map((point) => [Date.parse(point.time), point]))
  return [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

function pointProperties(storm: LiveStorm, point: StormPoint, kind: '实况' | '预报' | '最新中心', feed: TyphoonFeed, cached: boolean): Cesium.PropertyBag {
  const wind = point.windSpeed === null ? '未提供' : `${point.windSpeed} km/h`
  const pressure = point.pressure === null ? '未提供' : `${point.pressure} hPa`
  const source = `和风天气 QWeather${feed.sources.length ? `；${feed.sources.join('；')}` : ''}`
  const publication = kind === '预报' && storm.now ? `最新实况发布时间：${formatOnlineTime(storm.now.time)}。` : ''
  return new Cesium.PropertyBag({
    name: `${storm.name}（${storm.id}）·${kind}`,
    layerId: 'typhoon',
    summary: `${kind}时间：${formatOnlineTime(point.time)}。${publication}强度：${intensityStyle(point.type).name}（${point.type || 'unknown'}）。风速：${wind}；中心气压：${pressure}。经纬度：${point.longitude}°，${point.latitude}°。状态：${storm.active ? '活跃' : '已结束'}。来源：${source}。抓取时间：${formatOnlineTime(feed.fetchedAt)}。数据状态：${cached ? '更新失败，使用缓存快照' : '本次启动获取的快照'}。${storm.forecastError ? `预报获取异常：${storm.forecastError}` : ''}`,
    time: point.time,
    type: point.type,
    windSpeed: point.windSpeed,
    pressure: point.pressure,
    fetchedAt: feed.fetchedAt,
    cached
  })
}

export function buildLiveTyphoons(dataSource: Cesium.CustomDataSource, feed: TyphoonFeed, cached: boolean): void {
  for (const storm of feed.storms) {
    const latest = storm.now && validPoint(storm.now) ? storm.now : null
    const now = storm.active ? latest : null
    const observed = orderedPoints([...storm.track, ...(latest ? [latest] : [])])
    const forecast = now ? orderedPoints(storm.forecast).filter((point) => Date.parse(point.time) > Date.parse(now.time)) : []

    function addPath(points: StormPoint[], predicted: boolean): void {
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]
        const to = points[index]
        const color = Cesium.Color.fromCssColorString(intensityStyle(to.type).color)
        dataSource.entities.add({
          properties: pointProperties(storm, to, predicted ? '预报' : '实况', feed, cached),
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray([from.longitude, from.latitude, to.longitude, to.latitude]),
            clampToGround: true,
            width: 3,
            material: predicted ? new Cesium.PolylineDashMaterialProperty({ color, dashLength: 16 }) : color
          }
        })
      }
    }

    function addPoint(point: StormPoint, kind: '实况' | '预报' | '最新中心'): void {
      const center = kind === '最新中心'
      const color = Cesium.Color.fromCssColorString(intensityStyle(point.type).color)
      dataSource.entities.add({
        properties: pointProperties(storm, point, kind, feed, cached),
        position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude),
        point: {
          pixelSize: center ? 14 : 6,
          color: kind === '预报' ? Cesium.Color.WHITE : color,
          outlineColor: kind === '预报' ? color : Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: center ? {
          text: `${storm.name}${storm.active ? '' : '（已结束）'}\n发布 ${formatOnlineTime(point.time)}${cached ? '\n缓存快照' : ''}`,
          font: '600 12px "Microsoft YaHei", "PingFang SC", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.88)'),
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE,
          backgroundPadding: new Cesium.Cartesian2(8, 4),
          pixelOffset: new Cesium.Cartesian2(0, -24),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        } : undefined
      })
    }

    addPath(observed, false)
    for (const point of observed) {
      if (point !== now) addPoint(point, '实况')
    }
    if (now) {
      addPath([now, ...forecast], true)
      for (const point of forecast) addPoint(point, '预报')
      addPoint(now, '最新中心')
    }
  }
}
