import { UrlTemplateImageryProvider } from 'cesium'

const basemapOptions: Record<string, { maximumLevel: number; credit: string }> = {
  osm: { maximumLevel: 19, credit: '© OpenStreetMap contributors' },
  'esri-imagery': { maximumLevel: 23, credit: '© Esri' },
  opentopomap: { maximumLevel: 17, credit: '© OpenTopoMap contributors' },
  baidu: { maximumLevel: 19, credit: '© 百度地图' },
  'viirs-night': { maximumLevel: 8, credit: 'NASA GIBS / Black Marble (VIIRS)' }
}

export function createBasemapImageryProvider(id: string, styleId: string): UrlTemplateImageryProvider {
  const options = basemapOptions[id]
  if (!options) throw new Error(`Unknown basemap provider: ${id}`)
  return new UrlTemplateImageryProvider({
    url: `guearth-tile://${id}/${styleId}/{z}/{x}/{y}`,
    ...options
  })
}
