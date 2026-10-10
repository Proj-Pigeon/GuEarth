import { poiStatistics, type PoiCategoryCount } from './amap'
import { retrieveKnowledge } from './knowledge'

export interface AnalyzeLocationRequest {
  centerName?: string
  longitude?: number
  latitude?: number
  city?: string
  radiusMeters?: number
  focus?: string
}

export interface AnalyzeLocationKnowledgeMatch {
  id: string
  name: string
  definition: string
  features: string[]
}

export interface AnalyzeLocationResult {
  center: { name: string; longitude: number; latitude: number }
  focus: string
  focusName: string
  radiusMeters: number
  sampled: number
  total: number
  categories: PoiCategoryCount[]
  highOrderCategories: string[]
  lowOrderCategories: string[]
  elevationMeters?: number
  knowledgeMatches: AnalyzeLocationKnowledgeMatch[]
  notes: string[]
  error?: string
}

const FOCUS_LABELS: Record<string, string> = {
  agriculture: '农业',
  industry: '工业',
  transport: '交通',
  general: '综合'
}

const HIGH_ORDER_CATEGORY_CODES = new Set(['12', '14', '16', '17'])
const DAILY_LIFE_CATEGORY_CODES = new Set(['05', '06', '07', '08', '09'])

export async function analyzeLocation(request: AnalyzeLocationRequest): Promise<AnalyzeLocationResult> {
  const focus = typeof request.focus === 'string' && FOCUS_LABELS[request.focus] ? request.focus : 'general'
  const radiusMeters = Math.round(Math.min(50_000, Math.max(200, request.radiusMeters ?? 5_000)))
  const base: AnalyzeLocationResult = {
    center: {
      name: typeof request.centerName === 'string' ? request.centerName.trim().slice(0, 40) : '',
      longitude: request.longitude ?? 0,
      latitude: request.latitude ?? 0
    },
    focus,
    focusName: FOCUS_LABELS[focus],
    radiusMeters,
    sampled: 0,
    total: 0,
    categories: [],
    highOrderCategories: [],
    lowOrderCategories: [],
    knowledgeMatches: [],
    notes: []
  }
  const poi = await poiStatistics({
    centerName: request.centerName,
    longitude: request.longitude,
    latitude: request.latitude,
    city: request.city,
    radiusMeters,
    maxSamples: 400
  })
  if (poi.error) return { ...base, center: poi.center, error: poi.error }
  const knowledge = retrieveKnowledge(`${poi.center.name} ${FOCUS_LABELS[focus]}区位因素`, '产业区位', 3)
  const highOrderCategories = poi.categories
    .filter((item) => HIGH_ORDER_CATEGORY_CODES.has(item.code) && item.count > 0)
    .map((item) => `${item.label}（${item.count}）`)
  const lowOrderCategories = poi.categories
    .filter((item) => DAILY_LIFE_CATEGORY_CODES.has(item.code) && item.count > 0)
    .map((item) => `${item.label}（${item.count}）`)
  const notes: string[] = []
  if (poi.sampled < 60) notes.push('该地点周边 POI 样本较少，可能为乡村、低等级中心地或专业化功能区，POI 构成对区位判断的参考有限')
  else if (highOrderCategories.length === 0) notes.push('统计半径内未见金融保险、科教文化、商务住宅、公司企业等高级职能类别，职能层级较低')
  else notes.push(`出现高级职能类别：${highOrderCategories.join('、')}，中心地等级较高`)
  if (focus === 'agriculture') notes.push('农业区位以自然条件（气候、地形、土壤、水源）与社会经济条件（市场、交通、政策）为主，POI 构成仅反映周边聚落与市场概况，请结合海拔与你的地理知识分析')
  if (focus === 'transport') notes.push('交通区位请关注 POI 中的交通设施服务（15 类）与道路附属设施（18 类）数量，并结合海陆位置、地形起伏综合判断')
  return {
    ...base,
    center: poi.center,
    sampled: poi.sampled,
    total: poi.total,
    categories: poi.categories,
    highOrderCategories,
    lowOrderCategories,
    knowledgeMatches: knowledge.matches.map((match) => ({
      id: match.id,
      name: match.name,
      definition: match.definition,
      features: match.features
    }))
  }
}
