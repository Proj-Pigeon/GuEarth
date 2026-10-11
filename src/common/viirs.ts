const VIIRS_GRANULE_LAG_MS = 2 * 24 * 60 * 60 * 1000

export function viirsGranuleDate(now = Date.now()): string {
  return new Date(now - VIIRS_GRANULE_LAG_MS).toISOString().slice(0, 10)
}

export function viirsCacheStyleId(styleId: string, now = Date.now()): string {
  return `${styleId}-${viirsGranuleDate(now).replaceAll('-', '')}`
}
