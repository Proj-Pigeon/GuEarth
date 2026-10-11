import type { PoiCategoryCount } from '../../common/poiStatistics'
import { POI_CATEGORY_LABELS, poiBigCategory } from './poiCategories'

export interface PoiSample {
  typecode?: unknown
}

export interface PoiAggregation {
  counts: Map<string, number>
  sampled: number
  fetched: number
}

export const POI_STATS_PAGE_SIZE = 25
export const POI_STATS_MAX_PAGES = 36

export function createPoiAggregation(): PoiAggregation {
  return { counts: new Map(), sampled: 0, fetched: 0 }
}

export function aggregatePois(target: PoiAggregation, pois: readonly PoiSample[]): void {
  for (const poi of pois) {
    target.fetched += 1
    const code = poiBigCategory(poi)
    if (!code) continue
    target.counts.set(code, (target.counts.get(code) ?? 0) + 1)
    target.sampled += 1
  }
}

export function poiPageCount(reportedTotal: number, maxSamples: number): number {
  return Math.min(POI_STATS_MAX_PAGES, Math.ceil(Math.min(reportedTotal, maxSamples) / POI_STATS_PAGE_SIZE))
}

export function poiTruncated(reportedTotal: number, pagesFetched: number): boolean {
  return reportedTotal > pagesFetched * POI_STATS_PAGE_SIZE
}

export function poiCategoryRows(counts: Map<string, number>): PoiCategoryCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: POI_CATEGORY_LABELS[code] ?? code, count }))
}
