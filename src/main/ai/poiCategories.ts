export const POI_CATEGORY_LABELS: Record<string, string> = {
  '01': '汽车服务',
  '02': '汽车销售',
  '03': '汽车维修',
  '04': '机动车公共停车场',
  '05': '餐饮服务',
  '06': '购物服务',
  '07': '生活服务',
  '08': '体育休闲服务',
  '09': '医疗保健服务',
  '10': '住宿服务',
  '11': '风景名胜',
  '12': '商务住宅',
  '13': '政府机构及社会团体',
  '14': '科教文化服务',
  '15': '交通设施服务',
  '16': '金融保险服务',
  '17': '公司企业',
  '18': '道路附属设施',
  '19': '地名地址信息',
  '20': '公共设施'
}

export interface PoiLike {
  type?: unknown
  typecode?: unknown
}

export function poiBigCategory(poi: PoiLike): string | undefined {
  if (typeof poi.typecode !== 'string') return undefined
  const code = poi.typecode.slice(0, 2)
  return POI_CATEGORY_LABELS[code] === undefined ? undefined : code
}
