export type PressureBeltKind = 'low' | 'high'

export interface PressureBeltSpec {
  id: string
  name: string
  kind: PressureBeltKind
  janCenter: number
  julCenter: number
  halfWidth: number
  summary: string
}

export interface WindBeltSpec {
  id: string
  name: string
  fromBeltId: string
  toBeltId: string
  tailOffset: [number, number]
  headOffset: [number, number]
  summary: string
}

export const pressureBelts: PressureBeltSpec[] = [
  {
    id: 'equatorial-low',
    name: '赤道低压带',
    kind: 'low',
    janCenter: -6,
    julCenter: 8,
    halfWidth: 5,
    summary: '赤道附近终年正午太阳高度大、受热多，空气强烈膨胀上升，近地面形成低压带（热力原因），多对流雨；其位置随太阳直射点季节移动，又称赤道辐合带。'
  },
  {
    id: 'subtropical-high-n',
    name: '副热带高压带（北）',
    kind: 'high',
    janCenter: 28,
    julCenter: 34,
    halfWidth: 5,
    summary: '赤道上升气流在高空向极地输送，受地转偏向力影响偏转成西风，约在北纬30°附近上空堆积下沉，近地面形成高压带（动力原因），夏季位置偏北、冬季偏南，控制时天气晴燥。'
  },
  {
    id: 'subpolar-low-n',
    name: '副极地低压带（北）',
    kind: 'low',
    janCenter: 57,
    julCenter: 63,
    halfWidth: 4,
    summary: '北纬60°附近，暖湿的盛行西风与干冷的极地东风相遇（极锋），暖气团沿锋面爬升，近地面形成低压带，锋面气旋活动频繁。'
  },
  {
    id: 'polar-high-n',
    name: '极地高压带（北）',
    kind: 'high',
    janCenter: 81,
    julCenter: 84,
    halfWidth: 6,
    summary: '北极地区终年获得太阳辐射极少，空气冷却收缩下沉，近地面形成高压带（热力原因），是极地东风的源地。'
  },
  {
    id: 'subtropical-high-s',
    name: '副热带高压带（南）',
    kind: 'high',
    janCenter: 34,
    julCenter: 28,
    halfWidth: 5,
    summary: '南半球副热带地区终年受高空下沉气流控制（动力原因），近地面形成环绕全球的高压带；南半球海洋面积大，高压带比北半球更连续，夏季（1月）位置偏南。'
  },
  {
    id: 'subpolar-low-s',
    name: '副极地低压带（南）',
    kind: 'low',
    janCenter: -63,
    julCenter: -57,
    halfWidth: 4,
    summary: '南纬60°附近西风带与极地东风辐合抬升形成低压带；环绕南极海洋，低压带连续呈环状，多温带气旋活动。'
  },
  {
    id: 'polar-high-s',
    name: '极地高压带（南）',
    kind: 'high',
    janCenter: -82,
    julCenter: -82,
    halfWidth: 8,
    summary: '南极大陆终年冰雪覆盖、强烈辐射冷却，空气收缩下沉形成高压（热力原因），是南极极地东风与南极气团的源地。'
  }
]

export const windBelts: WindBeltSpec[] = [
  {
    id: 'trade-n',
    name: '东北信风带',
    fromBeltId: 'subtropical-high-n',
    toBeltId: 'equatorial-low',
    tailOffset: [6, 8],
    headOffset: [-6, -7],
    summary: '由副热带高压带吹向赤道低压带的偏北风，受地转偏向力（北右南左）偏转成东北风，故称东北信风，风向终年稳定。'
  },
  {
    id: 'trade-s',
    name: '东南信风带',
    fromBeltId: 'subtropical-high-s',
    toBeltId: 'equatorial-low',
    tailOffset: [6, -8],
    headOffset: [-6, 7],
    summary: '由南半球副热带高压带吹向赤道低压带的偏南风，左偏成东南信风；夏季越过赤道后偏转为西南季风，是南亚雨季的重要水汽输送带。'
  },
  {
    id: 'westerlies-n',
    name: '盛行西风带（北）',
    fromBeltId: 'subtropical-high-n',
    toBeltId: 'subpolar-low-n',
    tailOffset: [-8, 0],
    headOffset: [8, 0],
    summary: '由副热带高压带吹向副极地低压带的偏南风，右偏成西南风，终年以西风为主；常年多温带气旋活动，欧洲西部终年温和多雨即受其控制。'
  },
  {
    id: 'westerlies-s',
    name: '盛行西风带（南）',
    fromBeltId: 'subtropical-high-s',
    toBeltId: 'subpolar-low-s',
    tailOffset: [-8, 0],
    headOffset: [8, 0],
    summary: '南半球30°—60°之间的西北风终年强劲稳定（咆哮西风带），沿岸多温带气旋，南美智利南部与新西兰终年温和多雨受其影响。'
  },
  {
    id: 'polar-easterlies-n',
    name: '极地东风带（北）',
    fromBeltId: 'polar-high-n',
    toBeltId: 'subpolar-low-n',
    tailOffset: [6, 4],
    headOffset: [-6, -4],
    summary: '由极地高压吹向副极地低压的偏东风，北半球右偏为东北风；干冷的极地东风与暖湿西风在60°N附近相遇形成极锋。'
  },
  {
    id: 'polar-easterlies-s',
    name: '极地东风带（南）',
    fromBeltId: 'polar-high-s',
    toBeltId: 'subpolar-low-s',
    tailOffset: [6, -4],
    headOffset: [-6, 4],
    summary: '由南极高压吹向副极地低压带的偏东风，南半球左偏为东南风，干冷强劲。'
  }
]

export function seasonBlend(month: number): number {
  return (1 - Math.cos((2 * Math.PI * (month - 1)) / 12)) / 2
}

export function beltCenter(spec: PressureBeltSpec, month: number): number {
  return spec.janCenter + (spec.julCenter - spec.janCenter) * seasonBlend(month)
}

export function beltCenterById(beltId: string, month: number): number {
  const spec = pressureBelts.find((belt) => belt.id === beltId)
  return spec ? beltCenter(spec, month) : 0
}

export function windBeltLatitude(spec: WindBeltSpec, month: number): number {
  return (beltCenterById(spec.fromBeltId, month) + beltCenterById(spec.toBeltId, month)) / 2
}

export function beltRingDegrees(spec: PressureBeltSpec, month: number): number[] {
  const center = beltCenter(spec, month)
  const south = Math.max(-89.5, center - spec.halfWidth)
  const north = Math.min(89.5, center + spec.halfWidth)
  const ring: number[] = []
  for (let lon = -180; lon <= 180; lon += 30) {ring.push(lon, south)}
  for (let lon = 180; lon >= -180; lon -= 30) {ring.push(lon, north)}
  return ring
}
