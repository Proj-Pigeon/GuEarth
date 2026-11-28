export interface ProvincePopulation {
  name: string
  populationWan: number
  areaWanKm2: number
  urbanizationPct: number | null
  huSide: 'east' | 'west' | 'cross'
  note: string
}

export const POPULATION_CENSUS_YEAR = '2020年第七次全国人口普查'

export const provincePopulation: ProvincePopulation[] = [
  {
    name: '广东省',
    populationWan: 12_601.25,
    areaWanKm2: 17.97,
    urbanizationPct: 74.15,
    huSide: 'east',
    note: '经济发达、就业机会多,外来人口大量流入,珠三角人口高度集聚'
  },
  {
    name: '山东省',
    populationWan: 10_152.75,
    areaWanKm2: 15.79,
    urbanizationPct: 63.94,
    huSide: 'east',
    note: '平原广阔、农业开发历史悠久,人口大省'
  },
  {
    name: '河南省',
    populationWan: 9936.55,
    areaWanKm2: 16.7,
    urbanizationPct: 55.43,
    huSide: 'east',
    note: '黄淮平原农业发达,人口大省,劳务输出多'
  },
  {
    name: '江苏省',
    populationWan: 8474.8,
    areaWanKm2: 10.72,
    urbanizationPct: 73.44,
    huSide: 'east',
    note: '地势平坦、水网密布,工农业俱发达'
  },
  {
    name: '四川省',
    populationWan: 8367.49,
    areaWanKm2: 48.6,
    urbanizationPct: 56.73,
    huSide: 'cross',
    note: '人口集中于成都平原,西部山地高原稀疏'
  },
  {
    name: '河北省',
    populationWan: 7461.02,
    areaWanKm2: 18.88,
    urbanizationPct: 60.07,
    huSide: 'east',
    note: '华北平原面积广,环绕京津'
  },
  {
    name: '湖南省',
    populationWan: 6644.49,
    areaWanKm2: 21.18,
    urbanizationPct: 58.76,
    huSide: 'east',
    note: '洞庭湖流域农业发达'
  },
  {
    name: '浙江省',
    populationWan: 6456.76,
    areaWanKm2: 10.55,
    urbanizationPct: 72.17,
    huSide: 'east',
    note: '沿海经济发达,城镇密集,外来流入多'
  },
  {
    name: '安徽省',
    populationWan: 6102.72,
    areaWanKm2: 14.01,
    urbanizationPct: 58.33,
    huSide: 'east',
    note: '淮河与长江沿岸平原稠密,劳务输出大省'
  },
  {
    name: '湖北省',
    populationWan: 5775.26,
    areaWanKm2: 18.59,
    urbanizationPct: 62.89,
    huSide: 'east',
    note: '江汉平原富庶,武汉集聚效应强'
  },
  {
    name: '广西壮族自治区',
    populationWan: 5012.68,
    areaWanKm2: 23.76,
    urbanizationPct: 54.2,
    huSide: 'east',
    note: '盆地与河谷平原聚集,喀斯特山地限制承载'
  },
  {
    name: '云南省',
    populationWan: 4720.93,
    areaWanKm2: 39.41,
    urbanizationPct: 50.05,
    huSide: 'cross',
    note: '山区广布,人口集中于山间坝子'
  },
  {
    name: '江西省',
    populationWan: 4518.86,
    areaWanKm2: 16.69,
    urbanizationPct: 60.44,
    huSide: 'east',
    note: '鄱阳湖平原集中'
  },
  {
    name: '辽宁省',
    populationWan: 4259.14,
    areaWanKm2: 14.86,
    urbanizationPct: 72.14,
    huSide: 'east',
    note: '老工业基地,辽河平原与沿海集中'
  },
  {
    name: '福建省',
    populationWan: 4154.01,
    areaWanKm2: 12.4,
    urbanizationPct: 68.75,
    huSide: 'east',
    note: '八山一水一分田,沿海平原承载大部分人口'
  },
  {
    name: '陕西省',
    populationWan: 3952.9,
    areaWanKm2: 20.56,
    urbanizationPct: 62.66,
    huSide: 'cross',
    note: '关中平原集中,陕北高原与秦岭山地稀疏'
  },
  {
    name: '贵州省',
    populationWan: 3856.21,
    areaWanKm2: 17.62,
    urbanizationPct: 53.15,
    huSide: 'east',
    note: '喀斯特高原山地,人口集中于坝区'
  },
  {
    name: '山西省',
    populationWan: 3491.56,
    areaWanKm2: 15.67,
    urbanizationPct: 62.53,
    huSide: 'east',
    note: '黄土高原,汾河谷地集中'
  },
  {
    name: '重庆市',
    populationWan: 3205.42,
    areaWanKm2: 8.24,
    urbanizationPct: 69.46,
    huSide: 'east',
    note: '丘陵山地,沿长江与槽谷分布'
  },
  {
    name: '黑龙江省',
    populationWan: 3185.01,
    areaWanKm2: 47.3,
    urbanizationPct: 65.61,
    huSide: 'east',
    note: '地广人稀,松嫩平原与农场集中'
  },
  {
    name: '新疆维吾尔自治区',
    populationWan: 2585.23,
    areaWanKm2: 166,
    urbanizationPct: 56.53,
    huSide: 'west',
    note: '人口沿山麓绿洲与河流呈串珠状分布'
  },
  {
    name: '甘肃省',
    populationWan: 2501.98,
    areaWanKm2: 42.58,
    urbanizationPct: 52.23,
    huSide: 'west',
    note: '河西走廊绿洲与黄河谷地集中'
  },
  {
    name: '上海市',
    populationWan: 2487.09,
    areaWanKm2: 0.63,
    urbanizationPct: 89.3,
    huSide: 'east',
    note: '全国经济中心,城市化率居前,密度极高'
  },
  {
    name: '吉林省',
    populationWan: 2407.35,
    areaWanKm2: 18.74,
    urbanizationPct: 62.64,
    huSide: 'east',
    note: '松嫩平原集中,东部山地稀疏'
  },
  {
    name: '内蒙古自治区',
    populationWan: 2404.92,
    areaWanKm2: 118.3,
    urbanizationPct: 67.48,
    huSide: 'west',
    note: '高原牧区为主,人口沿黄河与交通干线分布'
  },
  {
    name: '北京市',
    populationWan: 2189.31,
    areaWanKm2: 1.64,
    urbanizationPct: 87.55,
    huSide: 'east',
    note: '首都,政治文化中心'
  },
  {
    name: '宁夏回族自治区',
    populationWan: 720.27,
    areaWanKm2: 5.19,
    urbanizationPct: 64.96,
    huSide: 'west',
    note: '黄河灌区(银川平原)集中'
  },
  {
    name: '青海省',
    populationWan: 592.4,
    areaWanKm2: 72.23,
    urbanizationPct: 60.08,
    huSide: 'west',
    note: '高寒缺氧,集中于河湟谷地'
  },
  {
    name: '海南省',
    populationWan: 1008.12,
    areaWanKm2: 3.54,
    urbanizationPct: 60.27,
    huSide: 'east',
    note: '岛屿经济,沿海平原集中'
  },
  {
    name: '天津市',
    populationWan: 1386.6,
    areaWanKm2: 1.19,
    urbanizationPct: 84.7,
    huSide: 'east',
    note: '北方港口城市,海河平原'
  },
  {
    name: '西藏自治区',
    populationWan: 364.81,
    areaWanKm2: 122.8,
    urbanizationPct: 35.73,
    huSide: 'west',
    note: '高寒缺氧,集中于雅鲁藏布江谷地'
  },
  {
    name: '香港特别行政区',
    populationWan: 747.42,
    areaWanKm2: 0.11,
    urbanizationPct: null,
    huSide: 'east',
    note: '城市化率近100%,高度密集'
  },
  {
    name: '台湾省',
    populationWan: 2356.12,
    areaWanKm2: 3.6,
    urbanizationPct: null,
    huSide: 'east',
    note: '西部平原密集,东部山地稀疏'
  },
  {
    name: '澳门特别行政区',
    populationWan: 68.32,
    areaWanKm2: 0.0033,
    urbanizationPct: null,
    huSide: 'east',
    note: '全球人口密度最高的地区之一'
  }
]

export function densityOf(province: ProvincePopulation): number {
  return province.populationWan / province.areaWanKm2
}

export interface DensityBin {
  max: number | null
  label: string
  color: string
}

export const densityBins: DensityBin[] = [
  { max: 10, label: '<10', color: '#fff1b8' },
  { max: 50, label: '10–50', color: '#ffe58f' },
  { max: 100, label: '50–100', color: '#ffd666' },
  { max: 200, label: '100–200', color: '#faad14' },
  { max: 400, label: '200–400', color: '#fa8c16' },
  { max: 800, label: '400–800', color: '#fa541c' },
  { max: null, label: '≥800', color: '#a8071a' }
]

export function densityColor(density: number): string {
  for (const bin of densityBins) {
    if (bin.max === null || density < bin.max) {
      return bin.color
    }
  }
  return densityBins[densityBins.length - 1].color
}

function rankBy(name: string, value: (province: ProvincePopulation) => number): number {
  const sorted = [...provincePopulation].sort((a, b) => value(b) - value(a))
  const index = sorted.findIndex(province => province.name === name)
  return index + 1
}

export function populationRank(name: string): number {
  return rankBy(name, province => province.populationWan)
}

export function densityRank(name: string): number {
  return rankBy(name, densityOf)
}

export function huSideLabelOf(huSide: ProvincePopulation['huSide']): string {
  if (huSide === 'east') {
    return '胡焕庸线以东'
  }
  if (huSide === 'west') {
    return '胡焕庸线以西'
  }
  return '胡焕庸线穿过'
}

export function provinceSummary(name: string): string | null {
  const province = provincePopulation.find(item => item.name === name)
  if (!province) {
    return null
  }
  const density = Math.round(densityOf(province))
  const urbanization =
    province.urbanizationPct === null ? '—' : `${province.urbanizationPct.toFixed(1)}%`
  const side = huSideLabelOf(province.huSide)
  return `人口 ${formatWan(province.populationWan)} · 陆域面积 ${province.areaWanKm2} 万km² · 人口密度约 ${density} 人/km²(全国第 ${densityRank(province.name)}) · 城镇化率 ${urbanization} · ${side} · ${province.note}`
}

export function formatWan(value: number): string {
  return value >= 10_000
    ? `${(value / 10_000).toFixed(2)} 亿`
    : `${Math.round(value * 100) / 100} 万`
}

export const pyramidAgeGroups = [
  '0-4',
  '5-9',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80+'
] as const

export const pyramid2020 = {
  male: [
    4096.93, 4801.75, 4560.68, 3905.33, 3967.6, 4816.23, 6387.18, 5093.2, 4763.27, 5819.17, 6110.55,
    5081.6, 3687.11, 3633.79, 2416.27, 1475.24, 1525.77
  ],
  female: [
    3691.46, 4222.66, 3964.92, 3363.08, 3526.57, 4368.51, 6027.34, 4808.09, 4532.26, 5603.32,
    6005.88, 5058.48, 3651.18, 3766.76, 2542.73, 1648.64, 2054.36
  ]
}

export const pyramidFacts = [
  '金字塔底部(0-14岁)收窄、顶部(60岁及以上)变宽,人口年龄结构由扩张型转向收缩趋势',
  '60岁及以上人口占 18.7%,65岁及以上占 13.5%,已接近深度老龄化(14%)',
  '30-34岁与 50-54岁两个凸出年龄组分别对应 1986-1990 与 1966-1970 生育高峰',
  '劳动年龄人口(15-59岁)占 63.35%,人口红利仍在但趋于消退'
]

export interface CensusAgeStructure {
  year: number
  youngPct: number
  workingPct: number
  elderlyPct: number
}

export const censusAgeStructure: CensusAgeStructure[] = [
  { year: 1953, youngPct: 36.28, workingPct: 59.31, elderlyPct: 4.41 },
  { year: 1964, youngPct: 40.69, workingPct: 55.75, elderlyPct: 3.56 },
  { year: 1982, youngPct: 33.59, workingPct: 61.5, elderlyPct: 4.91 },
  { year: 1990, youngPct: 27.69, workingPct: 66.74, elderlyPct: 5.57 },
  { year: 2000, youngPct: 22.89, workingPct: 70.15, elderlyPct: 6.96 },
  { year: 2010, youngPct: 16.6, workingPct: 74.53, elderlyPct: 8.87 },
  { year: 2020, youngPct: 17.95, workingPct: 68.55, elderlyPct: 13.5 }
]

export const nationalPopulation = [
  { year: 1953, populationWan: 58_260 },
  { year: 1964, populationWan: 69_458 },
  { year: 1982, populationWan: 100_818 },
  { year: 1990, populationWan: 113_368 },
  { year: 2000, populationWan: 126_583 },
  { year: 2010, populationWan: 133_972 },
  { year: 2020, populationWan: 141_178 }
]

export const urbanizationSeries: [number, number][] = [
  [1949, 10.64],
  [1955, 13.48],
  [1960, 19.75],
  [1965, 17.98],
  [1970, 17.38],
  [1975, 17.34],
  [1978, 17.92],
  [1980, 19.39],
  [1982, 21.13],
  [1985, 23.71],
  [1990, 26.41],
  [1995, 29.04],
  [2000, 36.22],
  [2005, 42.99],
  [2010, 49.95],
  [2015, 57.33],
  [2020, 63.89],
  [2023, 66.16]
]

export const urbanizationFacts = [
  '1978年改革开放后城镇化进入加速期,1996-2010年每年提高约1.4个百分点',
  '诺瑟姆曲线:城镇化率低于30%为缓慢发展阶段,30%-70%为加速阶段,高于70%进入成熟阶段',
  '2023年常住人口城镇化率66.16%,但户籍城镇化率仍明显偏低,存在"半城镇化"现象',
  '东部沿海城市群(长三角、珠三角、京津冀)为主要人口承载区'
]

export const huLineEndpoints = [
  { name: '黑河', longitude: 127.53, latitude: 50.24 },
  { name: '腾冲', longitude: 98.5, latitude: 25.03 }
]

export const huLinePath: [number, number][] = [
  [127.53, 50.24],
  [117.4, 40.4],
  [108, 32.4],
  [98.5, 25.03]
]

export const huComparison = {
  eastAreaPct: 43.8,
  eastPopPct: 94.1,
  westAreaPct: 56.2,
  westPopPct: 5.9
}

export const huLineFacts = [
  '1935年胡焕庸提出"瑷珲—腾冲线":东南侧约36%的国土集中了96%的人口',
  '如今东南半壁以约44%的国土承载约94%的人口,八十多年来比例基本稳定',
  '东侧成因:地形以平原丘陵为主、季风气候湿润、水源充足、交通便捷、开发历史悠久',
  '西侧成因:深居内陆干旱高寒、地形以高原山地为主、生态承载力和开发条件有限'
]

export interface MigrationFlow {
  fromName: string
  from: [number, number]
  toName: string
  to: [number, number]
  path: [number, number][]
  weight: 'major' | 'minor'
  note?: string
}

export const migrationFlows: MigrationFlow[] = [
  {
    fromName: '湖南',
    from: [112.94, 28.23],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [112.94, 28.23],
      [113.55, 26.55],
      [113.92, 24.85],
      [113.26, 23.13]
    ],
    weight: 'major'
  },
  {
    fromName: '广西',
    from: [108.37, 22.82],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [108.37, 22.82],
      [109.72, 24.55],
      [111.42, 24.42],
      [113.26, 23.13]
    ],
    weight: 'major'
  },
  {
    fromName: '湖北',
    from: [114.31, 30.6],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [114.31, 30.6],
      [114.02, 28.25],
      [114.38, 25.72],
      [113.26, 23.13]
    ],
    weight: 'major'
  },
  {
    fromName: '河南',
    from: [113.63, 34.75],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [113.63, 34.75],
      [114.72, 31.95],
      [115.78, 28.82],
      [114.72, 25.2],
      [113.26, 23.13]
    ],
    weight: 'minor'
  },
  {
    fromName: '江西',
    from: [115.86, 28.68],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [115.86, 28.68],
      [115.42, 27.05],
      [114.88, 25.18],
      [113.26, 23.13]
    ],
    weight: 'minor'
  },
  {
    fromName: '四川',
    from: [104.07, 30.57],
    toName: '广东',
    to: [113.26, 23.13],
    path: [
      [104.07, 30.57],
      [106.62, 29.1],
      [109.2, 26.82],
      [111.28, 24.58],
      [113.26, 23.13]
    ],
    weight: 'minor'
  },
  {
    fromName: '安徽',
    from: [117.28, 31.86],
    toName: '江苏',
    to: [118.8, 32.06],
    path: [
      [117.28, 31.86],
      [117.82, 31.72],
      [118.8, 32.06]
    ],
    weight: 'major'
  },
  {
    fromName: '安徽',
    from: [117.28, 31.86],
    toName: '上海',
    to: [121.47, 31.23],
    path: [
      [117.28, 31.86],
      [118.62, 31.5],
      [120.02, 31.48],
      [121.47, 31.23]
    ],
    weight: 'major'
  },
  {
    fromName: '河南',
    from: [113.63, 34.75],
    toName: '江苏',
    to: [118.8, 32.06],
    path: [
      [113.63, 34.75],
      [115.08, 34.18],
      [116.72, 32.8],
      [118.8, 32.06]
    ],
    weight: 'minor'
  },
  {
    fromName: '贵州',
    from: [106.63, 26.65],
    toName: '浙江',
    to: [120.15, 30.27],
    path: [
      [106.63, 26.65],
      [108.62, 27.18],
      [112.88, 27.62],
      [116.35, 29.22],
      [120.15, 30.27]
    ],
    weight: 'minor'
  },
  {
    fromName: '江西',
    from: [115.86, 28.68],
    toName: '浙江',
    to: [120.15, 30.27],
    path: [
      [115.86, 28.68],
      [116.58, 28.92],
      [118.05, 29.18],
      [120.15, 30.27]
    ],
    weight: 'minor'
  },
  {
    fromName: '四川',
    from: [104.07, 30.57],
    toName: '浙江',
    to: [120.15, 30.27],
    path: [
      [104.07, 30.57],
      [106.42, 31.18],
      [110.52, 29.68],
      [115.02, 30.02],
      [120.15, 30.27]
    ],
    weight: 'minor'
  },
  {
    fromName: '甘肃',
    from: [103.83, 36.06],
    toName: '新疆',
    to: [87.62, 43.79],
    path: [
      [103.83, 36.06],
      [99.52, 38.72],
      [94.48, 41.02],
      [90.52, 42.76],
      [87.62, 43.79]
    ],
    weight: 'minor',
    note: '劳务与建设兵团流动'
  },
  {
    fromName: '黑龙江',
    from: [126.53, 45.8],
    toName: '海南',
    to: [110.2, 20.04],
    path: [
      [126.53, 45.8],
      [124.12, 39.52],
      [120.48, 33.5],
      [114.82, 27.02],
      [111.18, 23.02],
      [110.2, 20.04]
    ],
    weight: 'minor',
    note: '候鸟式养老流动'
  }
]

export const migrationFacts = [
  '全国流动人口3.76亿,其中跨省流动约1.25亿(2020年第七次人口普查)',
  '广东跨省流入人口约2962万居全国首位,浙江、上海、江苏、北京次之',
  '河南、安徽、四川、贵州、广西等为主要人口流出省',
  '迁移主线:由中西部内陆流向东部与南部沿海,由乡村流向城镇,由欠发达地区流向发达地区'
]

export function smoothMigrationPath(
  points: [number, number][],
  samplesPerSegment = 12
): [number, number][] {
  if (points.length < 3) {
    return [...points]
  }
  const padded = [points[0], ...points, points[points.length - 1]]
  const result: [number, number][] = []
  for (let i = 0; i < padded.length - 3; i += 1) {
    const p0 = padded[i]
    const p1 = padded[i + 1]
    const p2 = padded[i + 2]
    const p3 = padded[i + 3]
    for (let j = 0; j < samplesPerSegment; j += 1) {
      const t = j / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      result.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ])
    }
  }
  result.push(points[points.length - 1])
  return result
}

export function fanMigrationEndpoints(
  flows: MigrationFlow[],
  stepDeg = 0.9
): Map<MigrationFlow, [number, number]> {
  const groups = new Map<string, MigrationFlow[]>()
  for (const flow of flows) {
    const group = groups.get(flow.toName) ?? []
    group.push(flow)
    groups.set(flow.toName, group)
  }
  const endpoints = new Map<MigrationFlow, [number, number]>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.fromName.localeCompare(b.fromName))
    sorted.forEach((flow, index) => {
      if (sorted.length === 1) {
        endpoints.set(flow, flow.to)
        return
      }
      const path = flow.path ?? [flow.from, flow.to]
      const [prevLon, prevLat] = path[path.length - 2]
      const [tipLon, tipLat] = flow.to
      const cosLat = Math.max(0.25, Math.cos((tipLat * Math.PI) / 180))
      const dx = (tipLon - prevLon) * cosLat
      const dy = tipLat - prevLat
      const norm = Math.hypot(dx, dy) || 1
      const offset = (index - (sorted.length - 1) / 2) * stepDeg
      endpoints.set(flow, [
        tipLon + ((-dy / norm) * offset) / cosLat,
        tipLat + (dx / norm) * offset
      ])
    })
  }
  return endpoints
}
