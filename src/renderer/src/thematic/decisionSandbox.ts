export interface DecisionFactor {
  id: string
  name: string
  hint: string
  essential: boolean
}

export interface DecisionCase {
  id: string
  name: string
  place: string
  placeLonLat: [number, number]
  question: string
  context: string
  factors: DecisionFactor[]
}

export const decisionSandboxIntro = '选择一个决策情境，勾选你认为应当优先考虑的区位因素，再请 EOQ 按高考综合题答题结构点评你的取舍；星级为该情境通常不可忽略的关键因素。'

export const decisionCases: DecisionCase[] = [
  {
    id: 'electronics',
    name: '电子装配厂 · 郑州',
    place: '郑州航空港经济综合实验区',
    placeLonLat: [113.84, 34.52],
    question: '一家电子信息企业要新建整机装配厂，我准备选址郑州航空港区，这个取舍合理吗？',
    context: '郑州地处中原，劳动力资源丰富；新郑国际机场是航空港经济综合实验区核心；地方政府提供厂房与税收优惠；富士康已带动庞大的电子产业集群。',
    factors: [
      { id: 'labor', name: '劳动力成本与供给', hint: '装配环节用工量极大，河南劳动力充裕且成本低于沿海城市', essential: true },
      { id: 'transport', name: '航空与陆路交通', hint: '高价值电子产品宜空运，新郑机场货运航线与高速公路网是关键支撑', essential: false },
      { id: 'policy', name: '政策支持', hint: '国家级实验区在土地、税收、通关上的优惠显著降低建厂与运营成本', essential: false },
      { id: 'cluster', name: '产业集聚', hint: '富士康带动配套厂商集聚，共享供应链与工人市场，降低协作成本', essential: false },
      { id: 'land', name: '土地价格', hint: '中原地区土地成本明显低于深圳等沿海发达城市', essential: false },
      { id: 'environment', name: '环境容量', hint: '电子装配污染较小，环境约束相对宽松，但污水处理仍需达标', essential: false }
    ]
  },
  {
    id: 'sugar',
    name: '制糖厂 · 广西崇左',
    place: '崇左',
    placeLonLat: [107.36, 22.38],
    question: '新建一座机制糖厂，我选择广西崇左，主要看中什么、容易忽略什么？',
    context: '崇左甘蔗种植面积与产糖量居全国地级市首位，号称「中国糖都」；左江流经市区；糖料蔗收购有政府指导价。',
    factors: [
      { id: 'raw', name: '原料（甘蔗）', hint: '甘蔗失重大、不耐久运，糖厂必须布局在原料产地中心；原料指向型工业的典型', essential: true },
      { id: 'water', name: '水源', hint: '制糖耗水量大，左江提供充足而稳定的水源', essential: false },
      { id: 'transport', name: '交通运输', hint: '食糖外运依赖公路与铁路网络，距北部湾港口的远近影响出口成本', essential: false },
      { id: 'policy', name: '政策支持', hint: '糖料蔗基地建设与糖业扶持政策稳定了原料供给与收购秩序', essential: false },
      { id: 'market', name: '市场', hint: '食糖是全国性配置的大宗商品，市场因素相对次要——不要把它误当主导因素', essential: false }
    ]
  },
  {
    id: 'port',
    name: '沿海港口 · 宁波舟山',
    place: '宁波舟山港',
    placeLonLat: [122.05, 29.95],
    question: '为超大型散货与集装箱枢纽港选址，我推荐宁波舟山，这个依据站得住脚吗？',
    context: '宁波舟山港货物吞吐量多年居全球第一；舟山群岛拥有深水岸线与天然锚地；跨海大桥与铁路网连通长三角腹地。',
    factors: [
      { id: 'waterDepth', name: '港阔水深与避风', hint: '舟山群岛深水岸线可停靠 40 万吨级巨轮，群岛地形天然避风', essential: true },
      { id: 'hinterland', name: '经济腹地', hint: '背靠长三角制造业集群，进出口货源充足且稳定', essential: true },
      { id: 'transport', name: '集疏运体系', hint: '跨海大桥、铁路与高速公路把港口与腹地连成一体，决定集散效率', essential: false },
      { id: 'city', name: '城市依托', hint: '宁波提供金融、保险、物流等现代服务与船员生活配套', essential: false },
      { id: 'policy', name: '政策与自贸区', hint: '舟山江海联运服务中心与自贸区政策提升中转与保税能力', essential: false }
    ]
  },
  {
    id: 'winery',
    name: '葡萄酒庄 · 贺兰山东麓',
    place: '贺兰山东麓葡萄酒产区',
    placeLonLat: [106.1, 38.45],
    question: '我想在贺兰山东麓建设精品酒庄，这个选址的自然与社会经济条件如何？',
    context: '贺兰山东麓位于北纬 38 度左右的酿酒葡萄黄金带；西有贺兰山屏障风沙与寒流，黄河灌区提供水源；产区已获国家地理标志。',
    factors: [
      { id: 'climate', name: '光照与昼夜温差', hint: '年日照约 3000 小时、温差 12-15℃，葡萄糖分与风味物质积累充分', essential: true },
      { id: 'water', name: '灌溉水源', hint: '干旱区酿酒葡萄需精准控水，黄河灌区提供可靠水源', essential: false },
      { id: 'soil', name: '土壤（砂砾）', hint: '砂砾土透气排水良好、矿物质丰富，赋予葡萄酒独特风味', essential: false },
      { id: 'market', name: '市场与品牌', hint: '国内中高端葡萄酒市场正在成长，产区声誉决定品牌溢价', essential: false },
      { id: 'tourism', name: '旅游与交通', hint: '酒庄旅游融合银川客源与航空交通，是精品酒庄的重要收入来源', essential: false }
    ]
  }
]

export function buildDecisionPrompt(item: DecisionCase, selectedFactorIds: string[]): string {
  const selected = item.factors.filter((factor) => selectedFactorIds.includes(factor.id))
  const omitted = item.factors.filter((factor) => !selectedFactorIds.includes(factor.id))
  const missed = omitted.filter((factor) => factor.essential).map((factor) => factor.name)
  return [
    `我在「区位决策沙盘」练习：${item.question}`,
    `候选地点：${item.place}。背景：${item.context}`,
    `我认为应当优先考虑的因素：${selected.length ? selected.map((factor) => factor.name).join('、') : '（暂无）'}；我暂时搁置的因素：${omitted.length ? omitted.map((factor) => factor.name).join('、') : '（无）'}。`,
    ...(missed.length ? [`请特别检查我是否遗漏了关键因素（我可能低估了：${missed.join('、')}）。`] : []),
    '请按高考综合题的答题结构点评我的取舍：先指出我遗漏或误判的关键因素，再分「有利条件」「限制性条件」「综合评价」三段给出你的选址建议；必要时请调用 analyze_location 查询该地数据、set_layer 打开相关图层佐证。'
  ].join('\n')
}
