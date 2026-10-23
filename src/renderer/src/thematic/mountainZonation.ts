export interface ZonationBelt {
  id: string
  name: string
  fromM: number
  toM: number
  color: string
  note: string
}

export interface ZonationSlope {
  side: 'south' | 'north' | 'single'
  label: string
  baseM: number
  belts: ZonationBelt[]
}

export interface ZonationMountain {
  id: string
  name: string
  range: string
  longitude: number
  latitude: number
  summitM: number
  viewHeight: number
  slopes: ZonationSlope[]
  facts: string[]
  transect: Array<[number, number]>
}

export const zonationMountains: ZonationMountain[] = [
  {
    id: 'everest',
    name: '珠穆朗玛峰',
    range: '喜马拉雅山脉',
    longitude: 86.925,
    latitude: 27.988,
    summitM: 8848,
    viewHeight: 200000,
    slopes: [
      {
        side: 'south',
        label: '南坡（迎风坡）',
        baseM: 500,
        belts: [
          { id: 'ev-s-forested', name: '常绿阔叶林带', fromM: 500, toM: 2500, color: '#2e7d32', note: '基带，与当地水平自然带一致' },
          { id: 'ev-s-mixed', name: '山地针阔叶混交林带', fromM: 2500, toM: 3100, color: '#558b2f', note: '阔叶树比例随海拔升高而减少' },
          { id: 'ev-s-conifer', name: '山地针叶林带', fromM: 3100, toM: 3900, color: '#1b5e20', note: '耐寒针叶树，气温随海拔下降' },
          { id: 'ev-s-shrub', name: '高山灌丛草甸带', fromM: 3900, toM: 4700, color: '#7cb342', note: '乔木不能生长，灌丛与草甸为主' },
          { id: 'ev-s-meadow', name: '高寒草甸带', fromM: 4700, toM: 5200, color: '#9ccc65', note: '低矮草本，生长期极短' },
          { id: 'ev-s-cold-desert', name: '高寒荒漠带', fromM: 5200, toM: 5900, color: '#bda88a', note: '寒冷干旱，植被稀疏呈垫状' },
          { id: 'ev-s-snow', name: '积雪冰川带', fromM: 5900, toM: 8848, color: '#e8f4fa', note: '南坡雪线约 5900 米，低于北坡' }
        ]
      },
      {
        side: 'north',
        label: '北坡（青藏高原一侧）',
        baseM: 4000,
        belts: [
          { id: 'ev-n-steppe', name: '高寒草原带', fromM: 4000, toM: 4800, color: '#c5b97a', note: '基带，起点高，缺失森林带' },
          { id: 'ev-n-cold-desert', name: '高寒荒漠带', fromM: 4800, toM: 6200, color: '#bda88a', note: '背风坡降水少，荒漠上限更高' },
          { id: 'ev-n-snow', name: '积雪冰川带', fromM: 6200, toM: 8848, color: '#e8f4fa', note: '北坡雪线约 6200 米' }
        ]
      }
    ],
    facts: [
      '珠峰是地球海拔最高点，纬度低、相对高度近 8400 米，南坡拥有教科书中最完整的垂直带谱',
      '南坡基带为常绿阔叶林带、北坡基带为高寒草原带——基带直接反映山麓所在的水平自然带',
      '南坡是西南季风迎风坡，降水多、雪线低；北坡背风少雨、雪线高，且缺失全部森林带'
    ],
    transect: [[86.55, 28.45], [86.78, 28.2], [86.92, 27.99], [87.1, 27.8], [87.35, 27.55]]
  },
  {
    id: 'bogda',
    name: '博格达峰（天山）',
    range: '天山东段',
    longitude: 88.35,
    latitude: 43.82,
    summitM: 5445,
    viewHeight: 160000,
    slopes: [
      {
        side: 'north',
        label: '北坡（迎风坡）',
        baseM: 600,
        belts: [
          { id: 'bd-n-desert', name: '荒漠带', fromM: 600, toM: 1100, color: '#d4a373', note: '基带，反映温带大陆性干旱气候' },
          { id: 'bd-n-steppe', name: '山地草原带', fromM: 1100, toM: 1700, color: '#c0ca33', note: '降水随海拔升高而增多' },
          { id: 'bd-n-conifer', name: '山地针叶林带', fromM: 1700, toM: 2700, color: '#2f5d3a', note: '雪岭云杉，只出现在水分较充足的北坡' },
          { id: 'bd-n-meadow', name: '高山草甸带', fromM: 2700, toM: 3400, color: '#8bc34a', note: '林线以上，夏季牧场' },
          { id: 'bd-n-snow', name: '积雪冰川带', fromM: 3400, toM: 5445, color: '#e8f4fa', note: '北坡降水多、雪线较低' }
        ]
      },
      {
        side: 'south',
        label: '南坡（背风坡）',
        baseM: 800,
        belts: [
          { id: 'bd-s-desert', name: '荒漠带', fromM: 800, toM: 1500, color: '#d4a373', note: '基带上限高于北坡' },
          { id: 'bd-s-steppe', name: '山地草原带', fromM: 1500, toM: 2500, color: '#c0ca33', note: '背风坡水分条件差' },
          { id: 'bd-s-cold-desert', name: '高寒荒漠带', fromM: 2500, toM: 3600, color: '#bda88a', note: '缺失云杉林带，草原直接过渡到寒漠' },
          { id: 'bd-s-snow', name: '积雪冰川带', fromM: 3600, toM: 5445, color: '#e8f4fa', note: '南坡雪线高于北坡' }
        ]
      }
    ],
    facts: [
      '天山深居亚欧大陆内部，基带荒漠直接反映当地温带大陆性干旱气候',
      '北坡是西风带迎风坡，发育雪岭云杉林；南坡背风干旱，森林带整体缺失',
      '同一座山两侧带谱结构不同，是坡向影响垂直地域分异的经典案例'
    ],
    transect: [[87.6, 44.1], [87.95, 43.95], [88.35, 43.82], [88.7, 43.7], [89.1, 43.55]]
  },
  {
    id: 'kilimanjaro',
    name: '乞力马扎罗山',
    range: '东非高原（坦桑尼亚）',
    longitude: 37.356,
    latitude: -3.067,
    summitM: 5895,
    viewHeight: 140000,
    slopes: [
      {
        side: 'single',
        label: '东南坡（迎风坡）',
        baseM: 1000,
        belts: [
          { id: 'kj-rainforest', name: '热带雨林带', fromM: 1000, toM: 2900, color: '#227a4b', note: '基带，反映赤道多雨气候' },
          { id: 'kj-moorland', name: '高山灌丛荒原带', fromM: 2900, toM: 3800, color: '#a1887f', note: '巨型欧石南与半边莲等特有植物' },
          { id: 'kj-alpine-desert', name: '高山荒漠带', fromM: 3800, toM: 5000, color: '#c9a97e', note: '昼夜温差极大，植被稀少' },
          { id: 'kj-snow', name: '积雪冰川带', fromM: 5000, toM: 5895, color: '#e8f4fa', note: '赤道地区雪线最高，顶部仍存冰川' }
        ]
      }
    ],
    facts: [
      '赤道附近雪线最高，但乞力马扎罗山顶仍发育积雪冰川带，成为“赤道雪峰”奇观',
      '从山麓热带雨林到山顶冰雪，被形容为“从赤道到北极”的缩影',
      '近几十年山顶冰川快速退缩，是全球变暖的直观例证'
    ],
    transect: [[36.6, -3.4], [37.0, -3.25], [37.356, -3.067], [37.7, -2.9], [38.1, -2.75]]
  },
  {
    id: 'alps',
    name: '勃朗峰（阿尔卑斯山）',
    range: '阿尔卑斯山脉',
    longitude: 6.865,
    latitude: 45.833,
    summitM: 4808,
    viewHeight: 150000,
    slopes: [
      {
        side: 'single',
        label: '北坡',
        baseM: 300,
        belts: [
          { id: 'al-deciduous', name: '落叶阔叶林带', fromM: 300, toM: 1000, color: '#679b3b', note: '基带，温带气候下的典型植被' },
          { id: 'al-conifer', name: '山地针叶林带', fromM: 1000, toM: 2000, color: '#2f5d3a', note: '冷杉云杉为主' },
          { id: 'al-meadow', name: '高山草甸带', fromM: 2000, toM: 2900, color: '#8bc34a', note: '夏季高山牧场' },
          { id: 'al-snow', name: '积雪冰川带', fromM: 2900, toM: 4808, color: '#e8f4fa', note: '雪线约 2900 米，低于赤道高山' }
        ]
      }
    ],
    facts: [
      '温带山地基带为落叶阔叶林带，带谱比珠峰简单——纬度更高、相对高度更小',
      '雪线约 2900 米，明显低于赤道地区的山峰，体现纬度对雪线高度的控制'
    ],
    transect: [[6.0, 46.15], [6.4, 46.0], [6.865, 45.833], [7.3, 45.7], [7.7, 45.55]]
  },
  {
    id: 'changbai',
    name: '长白山',
    range: '长白山脉（吉林）',
    longitude: 128.06,
    latitude: 42.0,
    summitM: 2749,
    viewHeight: 90000,
    slopes: [
      {
        side: 'single',
        label: '北坡',
        baseM: 600,
        belts: [
          { id: 'cb-mixed', name: '针阔叶混交林带', fromM: 600, toM: 1100, color: '#558b2f', note: '基带，红松与阔叶树混生' },
          { id: 'cb-conifer', name: '山地针叶林带', fromM: 1100, toM: 1800, color: '#2f5d3a', note: '云杉冷杉暗针叶林' },
          { id: 'cb-birch', name: '岳桦林带', fromM: 1800, toM: 2100, color: '#86925a', note: '森林分布上限（林线）的典型示例' },
          { id: 'cb-tundra', name: '高山苔原带', fromM: 2100, toM: 2749, color: '#b5a48b', note: '矮小灌木与苔藓地衣，山顶无常年积雪带' }
        ]
      }
    ],
    facts: [
      '温带季风气候下的山地，基带为针阔叶混交林，与当地水平自然带一致',
      '山体相对高度仅约 2100 米，只有 4 个自然带、无积雪冰川带——相对高度限制带谱完整性'
    ],
    transect: [[127.3, 42.3], [127.7, 42.15], [128.06, 42.0], [128.4, 41.85], [128.8, 41.7]]
  }
]

export function mountainById(id: string): ZonationMountain | undefined {
  return zonationMountains.find((mountain) => mountain.id === id)
}

export function beltAtAltitude(slope: ZonationSlope, altitudeM: number): ZonationBelt | undefined {
  return slope.belts.find((belt) => altitudeM >= belt.fromM && altitudeM < belt.toM)
}

export function snowlineM(slope: ZonationSlope): number | undefined {
  const snow = slope.belts.find((belt) => belt.name.includes('积雪冰川'))
  return snow?.fromM
}

export const zonationPrinciples: string[] = [
  '垂直地域分异：山地自然带随海拔升高发生有规律更替，实质是水热条件随高度的变化',
  '基带与山地所在地的水平自然带一致，从基带类型可以推知山体所处的纬度与气候区',
  '纬度越低、相对高度越大，垂直带谱越完整、自然带数目越多',
  '迎风坡降水多、雪线低，背风坡降水少、雪线高；阳坡热量充足，同一自然带分布上限更高',
  '从山麓到山顶的水热变化类似从赤道到两极的水平地域分异，但前提是山体有足够的相对高度'
]
