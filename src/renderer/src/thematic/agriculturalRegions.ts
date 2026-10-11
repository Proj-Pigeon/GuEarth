export type AgriculturalCategory = 'grain' | 'cotton' | 'sugarcane' | 'beet'

export interface AgriculturalRegion {
  name: string
  category: AgriculturalCategory
  crop: string
  rings: Array<Array<[number, number]>>
  labelAt: [number, number]
  summary: string
}

export interface AgriCategoryMeta {
  id: AgriculturalCategory
  name: string
  color: string
}

export const AGRI_CATEGORY_META: AgriCategoryMeta[] = [
  { id: 'grain', name: '商品粮基地', color: '#389e0d' },
  { id: 'cotton', name: '商品棉基地', color: '#08979c' },
  { id: 'sugarcane', name: '甘蔗产区', color: '#7cb305' },
  { id: 'beet', name: '甜菜产区', color: '#d46b08' }
]

export const agriCategoryOf = (category: AgriculturalCategory): AgriCategoryMeta =>
  AGRI_CATEGORY_META.find((meta) => meta.id === category) ?? AGRI_CATEGORY_META[0]

const sanjiangRing: Array<[number, number]> = [
  [129.5, 46.1], [129.8, 46.8], [130.5, 47.4], [131.3, 47.6], [132.2, 47.8], [133.0, 48.0],
  [133.9, 48.4], [134.6, 48.1], [134.4, 47.3], [133.6, 46.2], [132.9, 45.6], [131.9, 45.5],
  [130.9, 45.4], [130.2, 45.6]
]

const songnenRing: Array<[number, number]> = [
  [122.8, 44.5], [123.4, 43.6], [124.4, 43.3], [125.4, 43.7], [126.1, 44.3], [126.5, 45.0],
  [127.0, 45.7], [127.4, 46.5], [127.1, 47.3], [126.3, 47.7], [125.1, 47.5], [124.2, 47.0],
  [123.4, 46.3], [122.6, 45.4]
]

const chengduRing: Array<[number, number]> = [
  [103.2, 30.7], [103.4, 31.2], [104.0, 31.5], [104.7, 31.4], [105.0, 30.9], [104.8, 30.3],
  [104.3, 29.8], [103.7, 29.6], [103.1, 30.0]
]

const jianghanRing: Array<[number, number]> = [
  [111.8, 30.1], [112.3, 29.7], [113.1, 29.7], [113.9, 30.0], [114.5, 30.4], [114.2, 30.8],
  [113.4, 30.9], [112.6, 30.9], [111.9, 30.5]
]

const dongtingRing: Array<[number, number]> = [
  [111.2, 29.3], [111.3, 28.9], [111.9, 28.5], [112.7, 28.5], [113.3, 28.9], [113.5, 29.4],
  [112.9, 29.6], [112.2, 29.7], [111.4, 29.5]
]

const poyangRing: Array<[number, number]> = [
  [115.3, 29.2], [115.2, 28.8], [115.6, 28.1], [116.3, 28.0], [117.0, 28.4], [117.4, 29.2],
  [116.9, 29.7], [116.0, 29.8], [115.5, 29.4]
]

const jianghuaiRing: Array<[number, number]> = [
  [115.9, 32.3], [116.4, 31.9], [117.2, 31.6], [118.3, 31.7], [119.2, 31.9], [120.0, 32.2],
  [120.2, 33.0], [119.2, 33.7], [118.0, 33.6], [117.0, 33.2], [116.1, 32.6]
]

const taihuRing: Array<[number, number]> = [
  [118.8, 31.3], [119.2, 30.7], [119.9, 30.2], [120.7, 30.4], [121.4, 30.8], [121.9, 31.4],
  [121.6, 32.0], [120.8, 32.2], [119.9, 32.2], [119.0, 31.9]
]

const prdGrainRing: Array<[number, number]> = [
  [112.1, 23.0], [112.3, 22.4], [112.9, 22.1], [113.5, 22.1], [114.1, 22.4], [114.6, 22.6],
  [114.6, 23.2], [113.9, 23.4], [113.1, 23.5], [112.3, 23.4]
]

const southXinjiangCottonRing: Array<[number, number]> = [
  [75.2, 39.0], [76.2, 38.7], [78.0, 38.8], [80.0, 38.9], [82.0, 38.6], [84.0, 38.7],
  [86.0, 39.4], [87.6, 40.4], [88.0, 41.5], [86.4, 41.9], [84.5, 41.9], [82.5, 41.4],
  [80.5, 40.8], [78.8, 40.3], [77.0, 39.9], [75.3, 39.3]
]

const huanghuaiCottonRing: Array<[number, number]> = [
  [114.2, 34.1], [114.8, 33.5], [116.0, 33.2], [117.2, 33.3], [117.9, 34.0], [117.4, 34.7],
  [116.4, 35.2], [115.3, 35.3], [114.3, 34.6]
]

const jijiyuCottonRing: Array<[number, number]> = [
  [113.7, 37.7], [113.8, 36.8], [114.6, 36.0], [115.8, 36.2], [116.8, 36.7], [117.1, 37.6],
  [116.2, 38.3], [115.0, 38.5], [113.9, 38.3]
]

const lowerYangtzeCottonRing: Array<[number, number]> = [
  [118.6, 31.2], [119.5, 31.2], [120.3, 31.5], [121.2, 31.4], [121.8, 31.9], [121.6, 32.9],
  [120.9, 33.4], [120.2, 32.6], [119.4, 31.9]
]

const guangxiSugarcaneRing: Array<[number, number]> = [
  [105.1, 23.6], [106.2, 22.8], [107.6, 22.1], [109.2, 22.2], [110.6, 22.9], [111.5, 23.7],
  [110.9, 24.5], [109.4, 24.9], [108.0, 25.0], [106.6, 24.9], [105.2, 24.4]
]

const leizhouSugarcaneRing: Array<[number, number]> = [
  [108.9, 21.3], [108.8, 21.8], [109.8, 22.1], [110.8, 22.0], [111.8, 21.8], [111.4, 21.2],
  [110.5, 20.9], [109.6, 20.8]
]

const northeastBeetRing: Array<[number, number]> = [
  [122.4, 45.2], [123.6, 45.2], [125.2, 45.9], [126.6, 46.6], [126.9, 47.5], [125.8, 47.9],
  [124.2, 47.4], [122.9, 46.6], [121.8, 45.8]
]

export const agriculturalRegions: AgriculturalRegion[] = [
  {
    name: '三江平原',
    category: 'grain',
    crop: '春小麦、大豆、玉米',
    rings: [sanjiangRing],
    labelAt: [131.9, 46.9],
    summary: '夏季高温多雨、雨热同期，黑土肥沃，地势平坦开阔；地广人稀，国营农场集中，机械化水平全国领先；一年一熟，是中国规模最大的商品粮基地。'
  },
  {
    name: '松嫩平原',
    category: 'grain',
    crop: '玉米、春小麦、大豆',
    rings: [songnenRing],
    labelAt: [124.9, 45.7],
    summary: '黑土与黑钙土肥沃，平原广阔，松花江、嫩江提供灌溉水源；铁路网密集，机械化程度高；玉米带与大豆主产区，一年一熟。'
  },
  {
    name: '成都平原',
    category: 'grain',
    crop: '水稻、油菜',
    rings: [chengduRing],
    labelAt: [104.1, 30.7],
    summary: '亚热带季风气候，水热充足；都江堰自流灌溉网完善，紫色土肥沃，无霜期长；开发历史悠久、精耕细作，素有「天府之国」之称。'
  },
  {
    name: '江汉平原',
    category: 'grain',
    crop: '水稻、棉花',
    rings: [jianghanRing],
    labelAt: [112.9, 30.3],
    summary: '长江与汉江冲积而成的湖积冲积平原，土层深厚，河湖密布，灌溉便利；亚热带季风气候水热充沛；水陆交通发达，稻棉轮作。'
  },
  {
    name: '洞庭湖平原',
    category: 'grain',
    crop: '水稻',
    rings: [dongtingRing],
    labelAt: [112.3, 29.1],
    summary: '洞庭湖水系冲积平原，土壤肥沃、水源充足；亚热带季风气候雨热同期；「湖广熟、天下足」的鱼米之乡，水稻一年两熟。'
  },
  {
    name: '鄱阳湖平原',
    category: 'grain',
    crop: '水稻',
    rings: [poyangRing],
    labelAt: [116.3, 28.9],
    summary: '鄱阳湖水系冲积平原，河网密布、灌溉便利，红壤经改良后适宜水稻；水热丰富，水稻一年两熟，兼产棉花、油菜。'
  },
  {
    name: '江淮地区',
    category: 'grain',
    crop: '水稻、小麦',
    rings: [jianghuaiRing],
    labelAt: [118.0, 32.7],
    summary: '地处亚热带与暖温带过渡带，水热条件较好；江淮冲积平原地势平坦，淮河与京杭运河提供灌溉与航运；水稻、小麦水旱轮作。'
  },
  {
    name: '太湖平原',
    category: 'grain',
    crop: '水稻、油菜',
    rings: [taihuRing],
    labelAt: [120.4, 31.2],
    summary: '亚热带季风气候水热充沛，河网稠密、灌溉便利，精耕细作水平高；城镇化水平高、市场广阔，商品粮与城郊农业并重。'
  },
  {
    name: '珠江三角洲',
    category: 'grain',
    crop: '水稻、甘蔗',
    rings: [prdGrainRing],
    labelAt: [113.3, 22.9],
    summary: '纬度低，水热资源全国最丰富，水稻可一年三熟；河网密布，基塘农业（桑基鱼塘）特色鲜明；毗邻港澳，城郊农业与商品粮并存。'
  },
  {
    name: '南疆商品棉基地',
    category: 'cotton',
    crop: '长绒棉',
    rings: [southXinjiangCottonRing],
    labelAt: [81.6, 40.3],
    summary: '温带大陆性气候，光照强、昼夜温差大，夏季热量充足；绿洲灌溉水源来自高山冰雪融水；沙质土壤透气性好，长绒棉品质全国最优。'
  },
  {
    name: '黄淮平原棉区',
    category: 'cotton',
    crop: '陆地棉',
    rings: [huanghuaiCottonRing],
    labelAt: [116.1, 34.3],
    summary: '暖温带气候，夏雨集中、秋季晴朗少雨，利于棉花收摘；黄淮冲积平原土层深厚；靠近华北棉纺工业带，市场需求大。'
  },
  {
    name: '冀中南鲁西北豫北棉区',
    category: 'cotton',
    crop: '陆地棉',
    rings: [jijiyuCottonRing],
    labelAt: [115.4, 37.3],
    summary: '暖温带半湿润区，春季气温回升快、秋高气爽利于吐絮；华北平原土层深厚；毗邻京津唐棉纺基地，铁路交通便利。'
  },
  {
    name: '长江下游滨海沿江棉区',
    category: 'cotton',
    crop: '陆地棉',
    rings: [lowerYangtzeCottonRing],
    labelAt: [120.4, 32.2],
    summary: '亚热带季风气候，水热充足；滨江滨海平原土壤偏沙性适宜棉花生长；长三角棉纺工业发达，市场、技术条件优越。'
  },
  {
    name: '华南甘蔗产区',
    category: 'sugarcane',
    crop: '甘蔗',
    rings: [guangxiSugarcaneRing, leizhouSugarcaneRing],
    labelAt: [108.2, 23.6],
    summary: '纬度低，热量全国最丰富，甘蔗生长期长、含糖量高；丘陵台地排水良好；糖厂就近布局原料产地，广西产糖量居全国首位。'
  },
  {
    name: '东北甜菜产区',
    category: 'beet',
    crop: '甜菜',
    rings: [northeastBeetRing],
    labelAt: [124.4, 46.7],
    summary: '温带半湿润气候，夏季日照长、昼夜温差大，利于糖分积累；松嫩平原黑土肥沃；甜菜耐温凉、耐盐碱，靠近东北制糖工业。'
  }
]

export const agriFacts = [
  '商品粮基地的共同区位：自然条件好（地形平坦、土壤肥沃、水热配合佳）、增产潜力大、交通便利、商品率高',
  '九大商品粮基地：三江平原、松嫩平原、成都平原、江汉平原、洞庭湖平原、鄱阳湖平原、江淮地区、太湖平原、珠江三角洲',
  '南疆商品棉基地依托绿洲农业，光照强、水源稳定，长绒棉品质全国最优',
  '甘蔗喜高温需水多，集中在华南；甜菜喜温凉、耐盐碱干旱，集中在东北、内蒙古与新疆'
]

export function agriRegionSummary(region: AgriculturalRegion): string {
  const meta = agriCategoryOf(region.category)
  return `${region.name}（${meta.name}·${region.crop}）：${region.summary}`
}
