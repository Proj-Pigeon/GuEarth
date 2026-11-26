export interface ClimateZone {
  name: string
  color: string
  rings: [number, number][][]
  labelAt: [number, number]
}

const tropicsLine: [number, number][] = [
  [97.8, 21.7], [100, 21.8], [102.5, 22.1], [104.5, 22.4], [106.5, 22],
  [108.5, 21.7], [110.5, 21.3], [112.5, 21.5], [114.5, 21.8], [116.3, 22.4], [117.2, 23.2]
]

const qinlingLine: [number, number][] = [
  [104.5, 33], [106.5, 33.4], [108.5, 33.6], [110.5, 33.5], [112.5, 33.4],
  [114.5, 33.5], [116.5, 33.7], [118.5, 33.8], [120.5, 33.9], [121.8, 32.2]
]

const monsoonBoundaryNorth: [number, number][] = [
  [124, 53.3], [122, 50.3], [118.5, 46.3], [115.5, 42.8], [112, 40.8], [107.5, 39.2], [104, 37.4]
]

const plateauNorthEdge: [number, number][] = [
  [104, 37.4], [100.5, 38.2], [95.5, 36.6], [89, 36], [83, 34.8], [78, 32.6]
]

const tropicalMainlandRing: [number, number][] = [
  ...tropicsLine,
  [116, 22.6], [114.5, 22.3], [113, 22], [111.5, 21.5], [110.3, 20.4],
  [109.3, 21], [108.2, 21.5], [104, 21.6], [100, 21.5]
]

const hainanRing: [number, number][] = [
  [108.8, 19.9], [110.6, 20], [111, 19.2], [110.3, 18.2], [108.9, 18.5]
]

const taiwanTropicRing: [number, number][] = [
  [120.1, 22.5], [121.5, 22.2], [121.9, 23.9], [121, 24.6], [120.1, 23.3]
]

const taiwanSubtropicRing: [number, number][] = [
  [120.2, 23.4], [121, 24.9], [121.9, 25.2], [122, 24], [121.6, 22.4]
]

const subtropicRing: [number, number][] = [
  ...qinlingLine,
  [121.9, 31.4], [120.7, 27.9], [119.6, 26.1], [116.7, 23.4],
  ...[...tropicsLine].reverse(),
  [99, 23], [100.3, 26], [101.3, 29], [102.3, 31.5]
]

const temperateMonsoonRing: [number, number][] = [
  ...qinlingLine,
  [122.4, 37], [121.8, 40.9], [124.3, 39.8], [127.5, 41.9], [130.5, 42.9],
  [131.3, 45.2], [134.7, 48.4], [127.5, 50.2], [124, 53.3],
  ...[...monsoonBoundaryNorth].reverse().slice(1),
  [103.5, 35], [104.5, 33]
]

const continentalRing: [number, number][] = [
  ...monsoonBoundaryNorth,
  ...plateauNorthEdge.slice(1),
  [76, 34], [73.5, 37], [74.5, 40], [79, 44.5], [83, 47.3], [87.5, 49.1],
  [95, 49.2], [106, 49.2], [116, 49.5], [122, 53.4]
]

const plateauRing: [number, number][] = [
  ...plateauNorthEdge,
  [76.5, 31], [79, 29.5], [84, 28.2], [90, 27.8], [96, 27.5], [99.5, 26.5],
  [100.8, 25.5], [101.8, 28.5], [102.8, 31.5], [103.5, 34.8], [104, 37.4]
]

export const climateZones: ClimateZone[] = [
  {
    name: '热带季风气候',
    color: '#fa8c16',
    rings: [tropicalMainlandRing, hainanRing, taiwanTropicRing],
    labelAt: [109.5, 19.2]
  },
  {
    name: '亚热带季风气候',
    color: '#52c41a',
    rings: [subtropicRing, taiwanSubtropicRing],
    labelAt: [110.5, 27.5]
  },
  {
    name: '温带季风气候',
    color: '#1677ff',
    rings: [temperateMonsoonRing],
    labelAt: [119, 43]
  },
  {
    name: '温带大陆性气候',
    color: '#faad14',
    rings: [continentalRing],
    labelAt: [88, 44]
  },
  {
    name: '高原山地气候',
    color: '#13c2c2',
    rings: [plateauRing],
    labelAt: [88, 33]
  }
]
