export interface PoiCategoryCount {
  code: string
  label: string
  count: number
}

export interface PoiStatisticsResult {
  center: { name: string; longitude: number; latitude: number }
  radiusMeters?: number
  city?: string
  types: string
  sampled: number
  total: number
  truncated: boolean
  categories: PoiCategoryCount[]
  note?: string
  error?: string
}

export interface PoiStatisticsRequest {
  centerName?: string
  longitude?: number
  latitude?: number
  city?: string
  radiusMeters?: number
  types?: string
  keywords?: string
  maxSamples?: number
}
