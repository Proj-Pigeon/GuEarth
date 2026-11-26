export type CurrentKind = 'warm' | 'cold'

export interface OceanCurrent {
  name: string
  kind: CurrentKind
  path: [number, number][]
  major?: boolean
  season?: 'summer' | 'winter'
}

export const oceanCurrents: OceanCurrent[] = [
  { name: '北赤道暖流', kind: 'warm', path: [[-128, 12], [-152, 12], [-176, 12], [156, 13], [138, 13]] },
  { name: '赤道逆流', kind: 'warm', path: [[130, 6], [160, 6.5], [195, 6.5], [224, 6]] },
  { name: '日本暖流（黑潮）', kind: 'warm', major: true, path: [[122.5, 23], [125.5, 28], [131, 33.5], [139, 38], [144, 41]] },
  { name: '北太平洋暖流', kind: 'warm', path: [[146, 42], [162, 44], [180, 46], [200, 47], [214, 48]] },
  { name: '阿拉斯加暖流', kind: 'warm', path: [[218, 50], [206, 54], [196, 56], [186, 57]] },
  { name: '加利福尼亚寒流', kind: 'cold', path: [[-127, 42], [-125, 36], [-121, 30], [-116, 25]] },
  { name: '千岛寒流（亲潮）', kind: 'cold', path: [[156, 55], [152, 48], [148, 42], [145, 38]] },
  { name: '秘鲁寒流', kind: 'cold', path: [[-74, -42], [-73, -30], [-77, -18], [-81, -8]] },
  { name: '东澳大利亚暖流', kind: 'warm', path: [[153, -24], [153, -31], [150, -38]] },
  { name: '西风漂流', kind: 'cold', major: true, path: [[20, -55], [80, -56], [140, -56], [180, -55], [220, -56], [280, -56], [320, -55], [355, -55]] },
  { name: '北赤道暖流', kind: 'warm', path: [[-22, 12], [-40, 12], [-55, 12], [-60, 13]] },
  { name: '墨西哥湾暖流', kind: 'warm', major: true, path: [[-88, 25], [-80, 28], [-75, 33], [-66, 38], [-55, 42]] },
  { name: '北大西洋暖流', kind: 'warm', major: true, path: [[-52, 44], [-35, 50], [-18, 56], [-2, 62], [8, 68]] },
  { name: '加那利寒流', kind: 'cold', path: [[-13, 31], [-12, 25], [-15, 19], [-17, 15]] },
  { name: '拉布拉多寒流', kind: 'cold', path: [[-58, 60], [-57, 53], [-55, 47]] },
  { name: '南赤道暖流', kind: 'warm', path: [[-14, -4], [-30, -5], [-40, -6], [-48, -6]] },
  { name: '几内亚湾暖流', kind: 'warm', path: [[-14, 2], [-4, 3.5], [6, 4], [12, 4.5]] },
  { name: '巴西暖流', kind: 'warm', path: [[-38, -10], [-39, -20], [-42, -30], [-45, -36]] },
  { name: '本格拉寒流', kind: 'cold', path: [[17, -32], [14, -24], [12, -17], [10, -11]] },
  { name: '南赤道暖流', kind: 'warm', path: [[100, -12], [80, -12], [62, -12], [52, -11]] },
  { name: '莫桑比克暖流', kind: 'warm', path: [[41, -16], [39, -24], [35, -30]] },
  { name: '厄加勒斯暖流', kind: 'warm', path: [[35, -31], [30, -36], [24, -40], [18, -42]] },
  { name: '西澳大利亚寒流', kind: 'cold', path: [[110, -31], [109, -25], [111, -20], [113, -16]] },
  { name: '索马里寒流', kind: 'cold', season: 'summer', path: [[50, 3], [49, 10], [47, 16]] },
  { name: '北印度洋季风洋流（夏季顺时针）', kind: 'warm', season: 'summer', path: [[58, 10], [68, 12], [80, 14], [88, 16], [91, 12], [88, 6], [76, 4], [62, 6]] },
  { name: '北印度洋季风洋流（冬季逆时针）', kind: 'cold', season: 'winter', path: [[62, 6], [76, 4], [88, 6], [91, 12], [88, 16], [80, 14], [68, 12], [58, 10]] }
]

export interface PathPoint {
  position: [number, number]
  direction: [number, number]
}

function shortestLonDelta(lon0: number, lon1: number): number {
  const delta = lon1 - lon0
  return delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta
}

export function pathPointAt(path: [number, number][], fraction: number): PathPoint {
  if (path.length < 2) {return { position: path[0] ?? [0, 0], direction: [1, 0] }}
  const weights: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    const [lon0, lat0] = path[i - 1]
    const [lon1, lat1] = path[i]
    const dLon = shortestLonDelta(lon0, lon1)
    const length = Math.hypot(dLon * Math.cos((lat0 + lat1) * 0.5 * (Math.PI / 180)), lat1 - lat0)
    weights.push(length)
    total += length
  }
  const target = Math.min(1, Math.max(0, fraction)) * total
  let accumulated = 0
  for (let i = 1; i < path.length; i += 1) {
    if (accumulated + weights[i - 1] >= target || i === path.length - 1) {
      const t = weights[i - 1] > 0 ? (target - accumulated) / weights[i - 1] : 0
      const [lon0, lat0] = path[i - 1]
      const [lon1, lat1] = path[i]
      const dLon = shortestLonDelta(lon0, lon1)
      const dirX = dLon * Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180))
      const dirY = lat1 - lat0
      const norm = Math.hypot(dirX, dirY) || 1
      return {
        position: [lon0 + dLon * t, lat0 + (lat1 - lat0) * t],
        direction: [dirX / norm, dirY / norm]
      }
    }
    accumulated += weights[i - 1]
  }
  const [lon, lat] = path[path.length - 1]
  return { position: [lon, lat], direction: [1, 0] }
}
