const GCJ_ELLIPSE_A = 6_378_245
const GCJ_ELLIPSE_EE = 0.006693421622965943
const GCJ_MAGIC_LAT = 35
const GCJ_MAGIC_LON = 105

function offsetLat(lon: number, lat: number): number {
  let result =
    -100 + 2 * lon + 3 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon))
  result += ((20 * Math.sin(6 * lon * Math.PI) + 20 * Math.sin(2 * lon * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(lat * Math.PI) + 40 * Math.sin((lat / 3) * Math.PI)) * 2) / 3
  result += ((160 * Math.sin((lat / 12) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30)) * 2) / 3
  return result
}

function offsetLon(lon: number, lat: number): number {
  let result =
    300 + lon + 2 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon))
  result += ((20 * Math.sin(6 * lon * Math.PI) + 20 * Math.sin(2 * lon * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(lon * Math.PI) + 40 * Math.sin((lon / 3) * Math.PI)) * 2) / 3
  result += ((150 * Math.sin((lon / 12) * Math.PI) + 300 * Math.sin((lon / 30) * Math.PI)) * 2) / 3
  return result
}

export function outsideChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271
}

export function wgs84ToGcj02(lon: number, lat: number): [number, number] {
  if (outsideChina(lon, lat)) {
    return [lon, lat]
  }
  const dLat = offsetLat(lon - GCJ_MAGIC_LON, lat - GCJ_MAGIC_LAT)
  const dLon = offsetLon(lon - GCJ_MAGIC_LON, lat - GCJ_MAGIC_LAT)
  const radLat = (lat / 180) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - GCJ_ELLIPSE_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const deltaLat =
    (dLat * 180) / (((GCJ_ELLIPSE_A * (1 - GCJ_ELLIPSE_EE)) / (magic * sqrtMagic)) * Math.PI)
  const deltaLon = (dLon * 180) / ((GCJ_ELLIPSE_A / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return [lon + deltaLon, lat + deltaLat]
}

export function gcj02ToWgs84(lon: number, lat: number): [number, number] {
  let wgsLon = lon
  let wgsLat = lat
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const [gcjLon, gcjLat] = wgs84ToGcj02(wgsLon, wgsLat)
    wgsLon -= gcjLon - lon
    wgsLat -= gcjLat - lat
  }
  return [wgsLon, wgsLat]
}
