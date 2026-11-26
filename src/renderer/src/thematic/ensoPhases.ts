export type EnsoPhase = 'normal' | 'el-nino' | 'la-nina'

export interface EnsoSstBand {
  west: number
  east: number
  anomaly: number
}

export interface EnsoPhaseMeta {
  name: string
  summary: string
  walker: string
  impacts: string[]
  bands: EnsoSstBand[]
}

const BIN_WEST = 120
const BIN_EAST = 280

function normalizeLongitude(value: number): number {
  return value > 180 ? value - 360 : value
}

export function ensoAnomalyColor(anomaly: number): string {
  if (anomaly <= -1.5) {return '#1677ff'}
  if (anomaly <= -0.5) {return '#69b1ff'}
  if (anomaly < 0.5) {return '#bae7ff'}
  if (anomaly < 1.5) {return '#ffc061'}
  if (anomaly < 2.2) {return '#fa8c16'}
  return '#fa541c'
}

export function buildEnsoBands(values: number[]): EnsoSstBand[] {
  const bands: EnsoSstBand[] = []
  for (let index = 0; index < values.length; index += 1) {
    const west = normalizeLongitude(BIN_WEST + index * ((BIN_EAST - BIN_WEST) / values.length))
    const east = normalizeLongitude(BIN_WEST + (index + 1) * ((BIN_EAST - BIN_WEST) / values.length))
    bands.push({ west, east, anomaly: values[index] })
  }
  return bands
}

export const ensoPhaseMeta: Record<EnsoPhase, EnsoPhaseMeta> = {
  normal: {
    name: '正常年份（中性）',
    summary: '信风自东向西吹拂，赤道太平洋表面暖水被推向西岸，在西太平洋堆积形成“暖池”；东太平洋深层冷水上涌补偿，形成“冷舌”。沃克环流正常运行，海温分布西暖东冷。',
    walker: '沃克环流正常：西太平洋（印度尼西亚一带）气流上升、东太平洋（南美沿岸）气流下沉，近地面信风稳定。',
    impacts: [
      '秘鲁沿岸冷海水上涌带来丰富营养盐，秘鲁渔场渔业兴旺',
      '西太平洋（印尼、澳洲北部）多雨，东太平洋沿岸（秘鲁沿海）干燥',
      '沃克环流与哈德莱环流维持正常位置，全球大气环流相对稳定'
    ],
    bands: buildEnsoBands([0.4, 0.3, 0.2, 0.1, 0, -0.1, -0.1, -0.2, -0.3, -0.3, -0.3, -0.3, -0.2, -0.2, -0.2, -0.2])
  },
  'el-nino': {
    name: '厄尔尼诺（El Niño）',
    summary: '信风异常减弱，西太平洋暖水回流东移，赤道中东太平洋海温异常偏高（Niño3.4 区海温距平持续 ≥ +0.5℃ 即判定发生）。东太平洋冷水上涌减弱，秘鲁渔场饵料减少。海气相互作用下，赤道太平洋大气环流发生明显调整。',
    walker: '沃克环流减弱东移：上升气流区从印尼东移到中太平洋，南美沿岸下沉减弱，信风进一步减弱甚至转向，形成海气正反馈。',
    impacts: [
      '秘鲁、厄瓜多尔沿岸出现暴雨洪涝，秘鲁渔场鱼类大量死亡或迁移，渔业减产',
      '印度尼西亚、澳大利亚东部干旱，森林火灾多发',
      '我国夏季雨带偏南，北方干旱、南方洪涝风险增大；登陆台风个数往往偏少；冬季容易出现暖冬',
      '印度季风减弱、非洲东部多雨等全球性气候异常'
    ],
    bands: buildEnsoBands([-0.3, -0.2, 0, 0.3, 0.5, 0.7, 0.9, 1.1, 1.4, 1.7, 1.9, 2.1, 2.3, 2.4, 2.4, 2.3])
  },
  'la-nina': {
    name: '拉尼娜（La Niña）',
    summary: '信风异常增强，暖水被更强烈地推向西太平洋，东太平洋冷水上涌更强，赤道中东太平洋海温异常偏低（Niño3.4 区海温距平持续 ≤ -0.5℃ 即判定发生）。海温分布比正常年份更“西暖东冷”。',
    walker: '沃克环流显著增强：西太平洋上升气流与东太平洋下沉气流都比正常年份更强，信风加强，海气正反馈向相反方向发展。',
    impacts: [
      '秘鲁渔场条件比正常年份更有利，渔业常获丰收',
      '印尼、澳洲北部降水更多，秘鲁沿岸更加干燥',
      '我国冬季容易出现冷冬，次年夏季雨带偏北、北方降水偏多；登陆台风个数往往偏多',
      '赤道中东太平洋台风生成位置偏西，发展路径更靠近我国'
    ],
    bands: buildEnsoBands([0.5, 0.6, 0.5, 0.4, 0.2, 0, -0.3, -0.6, -0.9, -1.2, -1.4, -1.6, -1.8, -2, -2, -1.9])
  }
}

export const ensoPhaseOptions: { value: EnsoPhase; label: string }[] = [
  { value: 'normal', label: '正常年份' },
  { value: 'el-nino', label: '厄尔尼诺' },
  { value: 'la-nina', label: '拉尼娜' }
]
