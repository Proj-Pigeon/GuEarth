export const THEMATIC_LAYER_IDS = [
  'wind-particles',
  'pressure-belts',
  'koppen-zones',
  'frontal-cyclone',
  'rain-belt',
  'summer-monsoon',
  'winter-monsoon',
  'ocean-currents',
  'climate-zones',
  'coriolis-demo',
  'plate-tectonics',
  'temperature-zones',
  'typhoon',
  'enso',
  'province-population',
  'hu-line',
  'migration-flows',
  'city-tiers',
  'functional-zones',
  'agri-regions',
  'industrial-bases',
  'industrial-transfers',
  'hsr-network',
  'sea-level-rise'
] as const

export type ThematicLayerId = (typeof THEMATIC_LAYER_IDS)[number]

export const THEMATIC_LAYER_ID_SET: ReadonlySet<string> = new Set(THEMATIC_LAYER_IDS)
