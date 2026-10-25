export type CityTier = 'national-center' | 'regional-center' | 'provincial-center' | 'prefecture' | 'county'

export interface UrbanCity {
  name: string
  longitude: number
  latitude: number
  tier: CityTier
  populationWan: number
  urbanizationPct: number | null
  role: string
}

export interface CityTierMeta {
  id: CityTier
  name: string
  color: string
  serviceRadiusKm: number
  description: string
}

export const CITY_TIER_META: CityTierMeta[] = [
  { id: 'national-center', name: '全国中心城市', color: '#d4380d', serviceRadiusKm: 1000, description: '国家中心城市：全国性综合服务职能（金融、高端商务、科教文化、国际交往），服务范围覆盖全国' },
  { id: 'regional-center', name: '区域中心城市', color: '#fa541c', serviceRadiusKm: 500, description: '大区级中心城市：服务数省区域（大型商贸、区域交通枢纽、高等科教），服务范围覆盖周边多省' },
  { id: 'provincial-center', name: '省会与省级中心', color: '#fa8c16', serviceRadiusKm: 250, description: '省会及计划单列市：省级政治经济文化中心，服务本省及周边邻省边缘' },
  { id: 'prefecture', name: '地级市中心', color: '#1677ff', serviceRadiusKm: 80, description: '地级市：服务周边县域（高中教育、二甲医院、大型商超），服务范围覆盖全市域' },
  { id: 'county', name: '县级市中心', color: '#52c41a', serviceRadiusKm: 30, description: '县级市/县城：基本生活服务（初中小学、县医院、农贸市场），服务范围限于县域' }
]

export const cityTierOf = (tier: CityTier): CityTierMeta => CITY_TIER_META.find((meta) => meta.id === tier) ?? CITY_TIER_META[CITY_TIER_META.length - 1]

export const urbanCities: UrbanCity[] = [
  { name: '北京', longitude: 116.407, latitude: 39.904, tier: 'national-center', populationWan: 2189.3, urbanizationPct: 87.6, role: '首都，全国政治文化中心与国际交往中心' },
  { name: '上海', longitude: 121.473, latitude: 31.23, tier: 'national-center', populationWan: 2487.1, urbanizationPct: 89.3, role: '全国经济中心、金融中心与航运中心' },
  { name: '广州', longitude: 113.264, latitude: 23.129, tier: 'national-center', populationWan: 1867.7, urbanizationPct: 86.2, role: '华南门户与全国性商贸中心' },
  { name: '重庆', longitude: 106.551, latitude: 29.563, tier: 'national-center', populationWan: 3205.4, urbanizationPct: 69.5, role: '长江上游经济中心' },
  { name: '成都', longitude: 104.066, latitude: 30.572, tier: 'regional-center', populationWan: 2093.8, urbanizationPct: 78.8, role: '西南地区科技、商贸、金融中心' },
  { name: '武汉', longitude: 114.306, latitude: 30.593, tier: 'regional-center', populationWan: 1232.7, urbanizationPct: 84.3, role: '华中地区中心城市，九省通衢' },
  { name: '西安', longitude: 108.94, latitude: 34.341, tier: 'regional-center', populationWan: 1295.3, urbanizationPct: 77.7, role: '西北地区中心城市' },
  { name: '沈阳', longitude: 123.429, latitude: 41.796, tier: 'regional-center', populationWan: 902.6, urbanizationPct: 84.5, role: '东北地区中心城市之一' },
  { name: '郑州', longitude: 113.625, latitude: 34.746, tier: 'regional-center', populationWan: 1259.9, urbanizationPct: 78.4, role: '中原城市群核心，全国铁路枢纽' },
  { name: '哈尔滨', longitude: 126.534, latitude: 45.803, tier: 'provincial-center', populationWan: 1000.9, urbanizationPct: 73.7, role: '黑龙江省会，东北亚商贸中心' },
  { name: '长春', longitude: 125.324, latitude: 43.886, tier: 'provincial-center', populationWan: 906.5, urbanizationPct: 74.5, role: '吉林省会，汽车工业基地' },
  { name: '石家庄', longitude: 114.502, latitude: 38.045, tier: 'provincial-center', populationWan: 1123.5, urbanizationPct: 70.6, role: '河北省会，华北交通枢纽' },
  { name: '太原', longitude: 112.549, latitude: 37.857, tier: 'provincial-center', populationWan: 530.4, urbanizationPct: 81.4, role: '山西省会，能源重化工基地' },
  { name: '呼和浩特', longitude: 111.751, latitude: 40.841, tier: 'provincial-center', populationWan: 344.6, urbanizationPct: 76.6, role: '内蒙古自治区首府，草原乳都' },
  { name: '济南', longitude: 117.12, latitude: 36.651, tier: 'provincial-center', populationWan: 920.2, urbanizationPct: 75.4, role: '山东省会，黄河流域中心城市' },
  { name: '青岛', longitude: 120.382, latitude: 36.067, tier: 'provincial-center', populationWan: 1007.2, urbanizationPct: 76.3, role: '计划单列市，沿海港口与海洋科创新城' },
  { name: '南京', longitude: 118.796, latitude: 32.06, tier: 'provincial-center', populationWan: 931.5, urbanizationPct: 86.9, role: '江苏省会，长三角特大城市' },
  { name: '杭州', longitude: 120.155, latitude: 30.274, tier: 'provincial-center', populationWan: 1193.6, urbanizationPct: 83.3, role: '浙江省会，数字经济之城' },
  { name: '宁波', longitude: 121.55, latitude: 29.868, tier: 'provincial-center', populationWan: 940.4, urbanizationPct: 79.3, role: '计划单列市，深水良港' },
  { name: '合肥', longitude: 117.283, latitude: 31.861, tier: 'provincial-center', populationWan: 936.6, urbanizationPct: 82.3, role: '安徽省会，综合性国家科学中心' },
  { name: '福州', longitude: 119.296, latitude: 26.074, tier: 'provincial-center', populationWan: 829.1, urbanizationPct: 72.5, role: '福建省会，海峡西岸中心城市' },
  { name: '厦门', longitude: 118.089, latitude: 24.479, tier: 'provincial-center', populationWan: 516.4, urbanizationPct: 89.4, role: '计划单列市，港口风景旅游城市' },
  { name: '南昌', longitude: 115.858, latitude: 28.683, tier: 'provincial-center', populationWan: 625.5, urbanizationPct: 71.9, role: '江西省会，鄱阳湖生态经济核心' },
  { name: '长沙', longitude: 112.938, latitude: 28.228, tier: 'provincial-center', populationWan: 1004.8, urbanizationPct: 82.6, role: '湖南省会，工程机械与文化传媒之都' },
  { name: '南宁', longitude: 108.366, latitude: 22.817, tier: 'provincial-center', populationWan: 874.2, urbanizationPct: 69.1, role: '广西首府，面向东盟门户枢纽城市' },
  { name: '海口', longitude: 110.198, latitude: 20.044, tier: 'provincial-center', populationWan: 287.3, urbanizationPct: 82.5, role: '海南省会，自贸港中心城市' },
  { name: '贵阳', longitude: 106.626, latitude: 26.653, tier: 'provincial-center', populationWan: 598.7, urbanizationPct: 80.1, role: '贵州省会，大数据产业基地' },
  { name: '昆明', longitude: 102.832, latitude: 24.88, tier: 'provincial-center', populationWan: 846, urbanizationPct: 72.6, role: '云南省会，面向南亚东南亚辐射中心' },
  { name: '拉萨', longitude: 91.111, latitude: 29.66, tier: 'provincial-center', populationWan: 86.8, urbanizationPct: 60.4, role: '西藏首府，高原历史文化名城' },
  { name: '兰州', longitude: 103.823, latitude: 36.061, tier: 'provincial-center', populationWan: 435.9, urbanizationPct: 82.2, role: '甘肃省会，西北交通枢纽' },
  { name: '西宁', longitude: 101.778, latitude: 36.617, tier: 'provincial-center', populationWan: 246.8, urbanizationPct: 76.4, role: '青海省会，河湟谷地中心城市' },
  { name: '银川', longitude: 106.23, latitude: 38.487, tier: 'provincial-center', populationWan: 285.9, urbanizationPct: 78.6, role: '宁夏首府，塞上湖城' },
  { name: '乌鲁木齐', longitude: 87.616, latitude: 43.825, tier: 'provincial-center', populationWan: 405.4, urbanizationPct: 89.4, role: '新疆首府，亚欧大陆桥枢纽' },
  { name: '东莞', longitude: 113.752, latitude: 23.021, tier: 'prefecture', populationWan: 1046.7, urbanizationPct: 92.2, role: '世界工厂，与广州深圳同城化' },
  { name: '佛山', longitude: 113.121, latitude: 23.02, tier: 'prefecture', populationWan: 949.9, urbanizationPct: 91.2, role: '珠三角制造业重镇' },
  { name: '温州', longitude: 120.699, latitude: 27.993, tier: 'prefecture', populationWan: 957.3, urbanizationPct: 72.8, role: '民营经济发祥地' },
  { name: '泉州', longitude: 118.589, latitude: 24.914, tier: 'prefecture', populationWan: 878.2, urbanizationPct: 69.3, role: '侨乡工贸城市' },
  { name: '洛阳', longitude: 112.438, latitude: 34.619, tier: 'prefecture', populationWan: 705.7, urbanizationPct: 65.1, role: '十三朝古都，装备制造基地' },
  { name: '包头', longitude: 109.84, latitude: 40.657, tier: 'prefecture', populationWan: 271.6, urbanizationPct: 87.4, role: '草原钢城，稀土之都' },
  { name: '遵义', longitude: 106.927, latitude: 27.725, tier: 'prefecture', populationWan: 660.7, urbanizationPct: 55.1, role: '黔北名城，白酒产业重镇' },
  { name: '曲靖', longitude: 103.796, latitude: 25.502, tier: 'prefecture', populationWan: 576.2, urbanizationPct: 50.7, role: '滇东门户，能源与烟草基地' },
  { name: '延安市', longitude: 109.49, latitude: 36.596, tier: 'prefecture', populationWan: 228.2, urbanizationPct: 63.1, role: '革命圣地，黄土高原中心城市' },
  { name: '酒泉', longitude: 98.508, latitude: 39.744, tier: 'county', populationWan: 105.3, urbanizationPct: 63.2, role: '河西走廊重镇，卫星发射基地' },
  { name: '敦煌', longitude: 94.662, latitude: 40.142, tier: 'county', populationWan: 17.8, urbanizationPct: 63.9, role: '丝路历史文化旅游名城（县级市）' },
  { name: '腾冲', longitude: 98.495, latitude: 25.016, tier: 'county', populationWan: 60.6, urbanizationPct: 45.2, role: '滇西边境县级市，地热火山旅游地' },
  { name: '格尔木', longitude: 94.9, latitude: 36.392, tier: 'county', populationWan: 22.1, urbanizationPct: 84.9, role: '青藏高原交通枢纽（县级市）' },
  { name: '霍尔果斯', longitude: 80.402, latitude: 44.201, tier: 'county', populationWan: 8.4, urbanizationPct: 58.3, role: '中哈边境口岸城市（县级市）' }
]

export interface FunctionalZoneSpec {
  name: string
  kind: 'commercial' | 'residential' | 'industrial'
  color: string
  summary: string
}

export const FUNCTIONAL_ZONES: FunctionalZoneSpec[] = [
  { name: '商业区', kind: 'commercial', color: '#d4380d', summary: '多位于市中心、交通干线两侧或街角路口，呈点状或条带状分布；地租最高，建筑物以高楼大厦为主，人口昼夜差别大。中心商务区（CBD）是商业区的核心，经济活动最繁忙。' },
  { name: '住宅区', kind: 'residential', color: '#1677ff', summary: '城市中最为广泛的土地利用方式，占地约40%-60%；因收入差异出现高级住宅区与低级住宅区的分化，二者常背向发展（高级住宅区位于城市外缘、环境优美，低级住宅区贴近工业区）。' },
  { name: '工业区', kind: 'industrial', color: '#531dab', summary: '多分布于城市外缘、沿主要交通干线（铁路、公路、河流）布局，以降低地租与运输成本、保护城市环境；应布局于盛行风的下风向、与季风区垂直的郊外或最小风频的上风向，并在与居住区之间设置卫生防护带。' }
]

export interface FunctionalDistrict {
  name: string
  kind: FunctionalZoneSpec['kind']
  longitude: number
  latitude: number
  radiusKm: number
  note: string
}

export const wuhanFunctionalDistricts: FunctionalDistrict[] = [
  { name: '江汉路·中山大道商圈', kind: 'commercial', longitude: 114.289, latitude: 30.581, radiusKm: 1.5, note: '汉口传统商业核心（步行街），位于城市中心、交通最便捷处' },
  { name: '武汉中央商务区（王家墩）', kind: 'commercial', longitude: 114.263, latitude: 30.603, radiusKm: 1.8, note: '武汉CBD：金融与总部办公集聚的现代中心商务区' },
  { name: '中南路·楚河汉街商圈', kind: 'commercial', longitude: 114.345, latitude: 30.549, radiusKm: 1.8, note: '武昌商业核心：中南路—中北路商务带与楚河汉街' },
  { name: '常青花园片区', kind: 'residential', longitude: 114.247, latitude: 30.628, radiusKm: 2.2, note: '汉口西北大型居住区，依托轨道交通与主干道扩展' },
  { name: '后湖片区', kind: 'residential', longitude: 114.287, latitude: 30.648, radiusKm: 2.5, note: '汉口北部大型居住新区' },
  { name: '南湖片区', kind: 'residential', longitude: 114.322, latitude: 30.48, radiusKm: 2.5, note: '武昌南部大型居住区，毗邻南湖' },
  { name: '青山区（武钢）', kind: 'industrial', longitude: 114.392, latitude: 30.637, radiusKm: 3, note: '武钢主厂区：钢铁工业沿长江布局，位于主城区东北外缘' },
  { name: '武汉经开区（沌口）', kind: 'industrial', longitude: 114.19, latitude: 30.489, radiusKm: 3, note: '汽车城：整车与零部件产业，位于主城区西南郊' },
  { name: '东湖高新区（光谷）', kind: 'industrial', longitude: 114.43, latitude: 30.482, radiusKm: 3.5, note: '光电子等高新技术产业，位于主城区东南郊' },
  { name: '阳逻开发区', kind: 'industrial', longitude: 114.558, latitude: 30.662, radiusKm: 2.5, note: '港口重工配套：依托长江深水港，位于主城区东北沿江' }
]

export interface FunctionalZoneCity {
  id: string
  name: string
  longitude: number
  latitude: number
  viewHeight: number
  overview: string
  districts: FunctionalDistrict[]
}

export const DEFAULT_FUNCTIONAL_ZONE_CITY_ID = 'wuhan'

export const functionalZoneCities: FunctionalZoneCity[] = [
  {
    id: 'wuhan',
    name: '武汉',
    longitude: 114.34,
    latitude: 30.56,
    viewHeight: 130000,
    overview: '武汉：长江与汉江交汇的三镇格局——商业区集中于汉口、武昌中心，大型住宅区向外拓展，工业区沿长江与城市外缘布局，光谷代表高新技术产业新形态。',
    districts: wuhanFunctionalDistricts
  },
  {
    id: 'shanghai',
    name: '上海',
    longitude: 121.47,
    latitude: 31.23,
    viewHeight: 150000,
    overview: '上海：浦西中心商业区与浦东陆家嘴CBD隔江相望，工业区沿黄浦江下游与宝山一线布局，居住区随轨道交通向外环外扩展。',
    districts: [
      { name: '陆家嘴金融贸易区', kind: 'commercial', longitude: 121.502, latitude: 31.24, radiusKm: 2, note: '浦东CBD：中国金融要素最集聚的中心商务区，与外滩隔江相望' },
      { name: '人民广场·南京东路商圈', kind: 'commercial', longitude: 121.474, latitude: 31.233, radiusKm: 1.6, note: '浦西传统商业核心，市级商业中心' },
      { name: '徐家汇商圈', kind: 'commercial', longitude: 121.437, latitude: 31.196, radiusKm: 1.4, note: '轨交枢纽带动的西南商业中心' },
      { name: '联洋·花木高级住宅区', kind: 'residential', longitude: 121.55, latitude: 31.22, radiusKm: 2, note: '浦东环境优美的高级住宅区，毗邻世纪公园' },
      { name: '莘庄大型居住区', kind: 'residential', longitude: 121.385, latitude: 31.113, radiusKm: 2.5, note: '轨道1号线终端带动的外环居住新区——交通与住宅扩展案例' },
      { name: '张江高科技园区', kind: 'industrial', longitude: 121.587, latitude: 31.204, radiusKm: 3, note: '集成电路、生物医药与软件：高新技术工业地域' },
      { name: '金桥出口加工区', kind: 'industrial', longitude: 121.559, latitude: 31.254, radiusKm: 2.5, note: '先进制造与出口加工，位于浦东城市外缘' },
      { name: '宝钢·宝山工业区', kind: 'industrial', longitude: 121.481, latitude: 31.402, radiusKm: 3.5, note: '沿长江布局的钢铁基地：兼顾水运与城市环境' }
    ]
  },
  {
    id: 'beijing',
    name: '北京',
    longitude: 116.4,
    latitude: 39.9,
    viewHeight: 150000,
    overview: '北京：CBD（国贸）与金融街东西呼应，中关村依托科教资源发展高新技术产业，回龙观天通苑体现职住分离，首钢搬迁是工业区区位调整的经典案例。',
    districts: [
      { name: '国贸CBD', kind: 'commercial', longitude: 116.459, latitude: 39.909, radiusKm: 1.8, note: '北京商务中心区：跨国公司总部与金融保险集聚' },
      { name: '金融街', kind: 'commercial', longitude: 116.357, latitude: 39.914, radiusKm: 1.3, note: '国家级金融管理功能区，专业性商业区' },
      { name: '王府井商圈', kind: 'commercial', longitude: 116.411, latitude: 39.909, radiusKm: 1.2, note: '传统市级商业中心，邻近旧城' },
      { name: '望京居住区', kind: 'residential', longitude: 116.474, latitude: 39.996, radiusKm: 2.2, note: '东北部大型居住区兼商务副中心' },
      { name: '回龙观·天通苑居住区', kind: 'residential', longitude: 116.33, latitude: 40.07, radiusKm: 3, note: '北部超大型居住区：职住分离的"睡城"讨论案例' },
      { name: '中关村科技园区', kind: 'industrial', longitude: 116.317, latitude: 39.982, radiusKm: 3, note: '中国第一个国家级高新区：科教资源依托型高新技术产业' },
      { name: '亦庄经济技术开发区', kind: 'industrial', longitude: 116.502, latitude: 39.795, radiusKm: 4, note: '东南郊先进制造与生物医药基地' },
      { name: '首钢老工业区（石景山）', kind: 'industrial', longitude: 116.178, latitude: 39.921, radiusKm: 2.5, note: '因环境与奥运整体搬迁的老钢铁工业区——工业区区位变化案例' }
    ]
  },
  {
    id: 'guangzhou',
    name: '广州',
    longitude: 113.29,
    latitude: 23.13,
    viewHeight: 140000,
    overview: '广州：传统中轴（北京路）与新中轴（珠江新城）并行，工业"东进"黄埔开发区，居住"南拓"番禺华南板块。',
    districts: [
      { name: '珠江新城CBD', kind: 'commercial', longitude: 113.322, latitude: 23.119, radiusKm: 1.8, note: '广州CBD：金融总部集聚，与广州塔构成城市新中轴' },
      { name: '北京路·上下九商圈', kind: 'commercial', longitude: 113.257, latitude: 23.122, radiusKm: 1.5, note: '岭南传统商业核心，老城中轴' },
      { name: '天河路商圈', kind: 'commercial', longitude: 113.362, latitude: 23.137, radiusKm: 1.4, note: '华南客流第一商圈（天河城、正佳广场）' },
      { name: '番禺华南板块居住区', kind: 'residential', longitude: 113.32, latitude: 23.0, radiusKm: 4, note: '大型楼盘集聚的近郊居住板块——郊区化居住扩展案例' },
      { name: '广州科学城', kind: 'industrial', longitude: 113.453, latitude: 23.166, radiusKm: 3, note: '高新技术产业与科研机构集聚' },
      { name: '黄埔·广州开发区', kind: 'industrial', longitude: 113.462, latitude: 23.109, radiusKm: 4, note: '东部工业走廊：外向型先进制造基地' }
    ]
  },
  {
    id: 'shenzhen',
    name: '深圳',
    longitude: 114.06,
    latitude: 22.55,
    viewHeight: 110000,
    overview: '深圳：多中心带状城市——福田CBD、罗湖传统商业、南山科技园高新产业、蛇口前海自贸片区，居住组团沿轨道交通向外扩展。',
    districts: [
      { name: '福田CBD', kind: 'commercial', longitude: 114.057, latitude: 22.543, radiusKm: 1.8, note: '深圳CBD：金融与总部经济（平安金融中心）' },
      { name: '东门商圈', kind: 'commercial', longitude: 114.117, latitude: 22.547, radiusKm: 1.2, note: '罗湖传统商业核心，特区最早的商圈' },
      { name: '华强北商圈', kind: 'commercial', longitude: 114.088, latitude: 22.547, radiusKm: 1, note: '"中国电子第一街"：专业市场型商业区' },
      { name: '龙华居住区', kind: 'residential', longitude: 114.02, latitude: 22.65, radiusKm: 3, note: '大型通勤居住组团：产业人口沿轨交外溢' },
      { name: '南山科技园', kind: 'industrial', longitude: 113.945, latitude: 22.537, radiusKm: 3, note: '高新技术产业园区：电子信息龙头企业集聚' },
      { name: '蛇口·前海片区', kind: 'industrial', longitude: 113.917, latitude: 22.489, radiusKm: 2.5, note: '改革开放最早的出口加工工业区，现转型为自贸片区' }
    ]
  },
  {
    id: 'chengdu',
    name: '成都',
    longitude: 104.07,
    latitude: 30.66,
    viewHeight: 130000,
    overview: '成都：单中心圈层结构向"双城"演进——春熙路老商圈与金融城新城CBD并存，高新技术产业南拓天府软件园，居住区向南、向外环扩展。',
    districts: [
      { name: '春熙路·太古里商圈', kind: 'commercial', longitude: 104.081, latitude: 30.657, radiusKm: 1.3, note: '百年市级商业中心，文旅消费地标' },
      { name: '金融城', kind: 'commercial', longitude: 104.063, latitude: 30.576, radiusKm: 1.6, note: '城南新城CBD：金融与总部办公' },
      { name: '天府软件园', kind: 'industrial', longitude: 104.068, latitude: 30.545, radiusKm: 3, note: '西部软件与数字经济核心区——高新技术工业地域' },
      { name: '华阳·天府新区居住区', kind: 'residential', longitude: 104.072, latitude: 30.505, radiusKm: 3.5, note: '向南发展的大型居住新城' },
      { name: '青白江国际铁路港区', kind: 'industrial', longitude: 104.25, latitude: 30.878, radiusKm: 4, note: '中欧班列始发地：临港工业与物流仓储' }
    ]
  },
  {
    id: 'shenyang',
    name: '沈阳',
    longitude: 123.43,
    latitude: 41.8,
    viewHeight: 120000,
    overview: '沈阳：铁西区是新中国工业摇篮，"东搬西建"后老厂区更新为住宅与商业，装备制造西迁经济技术开发区——老工业区改造的教科书案例。',
    districts: [
      { name: '中街商圈', kind: 'commercial', longitude: 123.455, latitude: 41.803, radiusKm: 1.2, note: '东北历史最久的商业街之一' },
      { name: '太原街商圈', kind: 'commercial', longitude: 123.406, latitude: 41.795, radiusKm: 1.2, note: '铁路车站带动的传统商业中心' },
      { name: '浑南居住区', kind: 'residential', longitude: 123.464, latitude: 41.705, radiusKm: 3.5, note: '浑河南岸新居住板块与奥体中心' },
      { name: '铁西老工业区', kind: 'industrial', longitude: 123.376, latitude: 41.787, radiusKm: 4, note: '机床与重型装备基地：搬迁改造后原址更新为住宅商业' },
      { name: '沈阳经开区·中德园', kind: 'industrial', longitude: 123.29, latitude: 41.745, radiusKm: 4.5, note: '装备制造新片区，承接铁西产业转移' }
    ]
  }
]

export function functionalZoneCityById(id: string): FunctionalZoneCity | undefined {
  return functionalZoneCities.find((city) => city.id === id)
}

export interface CentralPlaceCase {
  name: string
  city: string
  longitude: number
  latitude: number
  level: 'high' | 'middle' | 'low'
  circleKm: number
  note: string
}

export const CENTRAL_PLACE_CASES: CentralPlaceCase[] = [
  { name: '北京·王府井', city: '北京', longitude: 116.411, latitude: 39.909, level: 'high', circleKm: 12, note: '国家级商业中心：服务范围覆盖全国游客，职能齐全（高级百货、旗舰店、文商旅融合）' },
  { name: '上海·人民广场', city: '上海', longitude: 121.47, latitude: 31.231, level: 'high', circleKm: 12, note: '长三角顶级中心地：金融商务与高端商业集聚，辐射长江流域' },
  { name: '成都·春熙路', city: '成都', longitude: 104.081, latitude: 30.657, level: 'high', circleKm: 10, note: '西南区域中心地：服务全川乃至川渝地区，高级职能齐全' },
  { name: '武汉·江汉路', city: '武汉', longitude: 114.289, latitude: 30.58, level: 'high', circleKm: 10, note: '华中区域中心地：服务范围跨越数省' },
  { name: '洛阳·老城十字街', city: '洛阳', longitude: 112.473, latitude: 34.682, level: 'middle', circleKm: 5, note: '地级市中心地：服务洛阳市域及邻县，以中档商业与餐饮为主' },
  { name: '遵义·老城会址商圈', city: '遵义', longitude: 106.918, latitude: 27.688, level: 'middle', circleKm: 5, note: '地级市中心地：服务黔北县域，高级职能较省会有所减少' },
  { name: '敦煌·沙州市场', city: '敦煌', longitude: 94.662, latitude: 40.142, level: 'low', circleKm: 2.5, note: '县级中心地：服务本市域为主，职能以日常生活服务与旅游纪念品为主' },
  { name: '腾冲·翡翠路商圈', city: '腾冲', longitude: 98.498, latitude: 25.015, level: 'low', circleKm: 2.5, note: '县级中心地：服务县域，少见高级职能门店' }
]

export const centralPlaceFacts = [
  '中心地理论（克里斯塔勒，1933）：城镇是周围乡村的中心地，向周围提供商品与服务；中心地等级越高，数量越少、服务范围越大、职能种类越齐全。',
  '高级中心地既有高级职能也有低级职能；低级中心地只有低级职能。高级职能（大型百货、专科医院、高校、金融机构）需要较大的门槛人口与服务范围。',
  '同级别中心地的服务范围在理想平原上呈正六边形嵌套；不同级别中心地的服务范围层层嵌套，构成等级体系。',
  '验证方法：对比不同等级城市中心同半径内的 POI 数量与类别——等级越高，POI 总量越大、类别越全、越可能出现金融保险、科教文化等高级职能。'
]
