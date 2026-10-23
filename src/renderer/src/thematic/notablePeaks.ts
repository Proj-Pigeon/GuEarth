const EARTH_RADIUS_KM = 6371

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function greatCircleKm(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const dLat = lat2 - lat1
  const dLon = toRadians(toLon - fromLon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const dLon = toRadians(toLon - fromLon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export interface NotablePeak {
  id: string
  name: string
  longitude: number
  latitude: number
  elevationM: number
  region: string
  note: string
}

export interface PeakNearMatch extends NotablePeak {
  distanceKm: number
  bearingDeg: number
}

export const notablePeaks: NotablePeak[] = [
  { id: 'everest', name: '珠穆朗玛峰', longitude: 86.925, latitude: 27.988, elevationM: 8849, region: '中国/尼泊尔 · 喜马拉雅山脉', note: '地球海拔最高点' },
  { id: 'k2', name: '乔戈里峰', longitude: 76.513, latitude: 35.881, elevationM: 8611, region: '中国/巴基斯坦 · 喀喇昆仑山脉', note: '世界第二高峰，攀登难度最高' },
  { id: 'lhotse', name: '洛子峰', longitude: 86.933, latitude: 27.962, elevationM: 8516, region: '中国/尼泊尔 · 喜马拉雅山脉', note: '世界第四高峰，珠峰南邻' },
  { id: 'makalu', name: '马卡鲁峰', longitude: 87.089, latitude: 27.889, elevationM: 8485, region: '中国/尼泊尔 · 喜马拉雅山脉', note: '世界第五高峰' },
  { id: 'chooyu', name: '卓奥友峰', longitude: 86.661, latitude: 28.094, elevationM: 8201, region: '中国 · 喜马拉雅山脉', note: '世界第六高峰' },
  { id: 'shishapangma', name: '希夏邦马峰', longitude: 85.712, latitude: 28.352, elevationM: 8027, region: '中国 · 喜马拉雅山脉', note: '唯一完全在中国境内的八千米级高峰' },
  { id: 'gongga', name: '贡嘎山', longitude: 101.883, latitude: 29.594, elevationM: 7556, region: '四川 · 大雪山', note: '横断山脉最高峰，“蜀山之王”' },
  { id: 'kongur', name: '公格尔峰', longitude: 75.197, latitude: 38.599, elevationM: 7649, region: '新疆 · 昆仑山西段', note: '昆仑山脉最高峰' },
  { id: 'muztagata', name: '慕士塔格峰', longitude: 75.07, latitude: 38.283, elevationM: 7546, region: '新疆 · 昆仑山西段', note: '冰川发育的“冰山之父”' },
  { id: 'tomur', name: '托木尔峰', longitude: 80.125, latitude: 42.043, elevationM: 7443, region: '新疆 · 天山西段', note: '天山山脉最高峰' },
  { id: 'nyainqentanglha', name: '念青唐古拉峰', longitude: 90.605, latitude: 30.499, elevationM: 7162, region: '西藏 · 念青唐古拉山脉', note: '藏北与藏南的分界山地' },
  { id: 'kailash', name: '冈仁波齐峰', longitude: 81.312, latitude: 31.07, elevationM: 6656, region: '西藏 · 冈底斯山脉', note: '宗教文化名山，金字塔形雪峰' },
  { id: 'geladandong', name: '各拉丹冬峰', longitude: 91.05, latitude: 33.45, elevationM: 6621, region: '青海 · 唐古拉山脉', note: '长江源头沱沱河的发源地' },
  { id: 'kawagarbo', name: '卡瓦格博峰（梅里雪山）', longitude: 98.73, latitude: 28.42, elevationM: 6740, region: '云南 · 横断山脉', note: '低纬度海洋性冰川发育的著名雪峰' },
  { id: 'yaomei', name: '幺妹峰（四姑娘山）', longitude: 102.9, latitude: 31.1, elevationM: 6250, region: '四川 · 邛崃山脉', note: '四川第二高峰，“蜀山皇后”' },
  { id: 'yulong', name: '玉龙雪山', longitude: 100.183, latitude: 27.116, elevationM: 5596, region: '云南 · 横断山脉', note: '北半球纬度最低的雪山之一' },
  { id: 'bogda', name: '博格达峰', longitude: 88.35, latitude: 43.82, elevationM: 5445, region: '新疆 · 天山东段', note: '天山东段最高峰，垂直带谱典型' },
  { id: 'tuanjie', name: '团结峰', longitude: 97.65, latitude: 38.53, elevationM: 5808, region: '青海 · 祁连山脉', note: '祁连山脉最高峰' },
  { id: 'youyi', name: '友谊峰', longitude: 87.833, latitude: 49.167, elevationM: 4374, region: '新疆 · 阿尔泰山脉', note: '阿尔泰山脉最高峰' },
  { id: 'yushan', name: '玉山', longitude: 120.958, latitude: 23.47, elevationM: 3952, region: '台湾 · 中央山脉', note: '中国东部最高峰' },
  { id: 'emei', name: '峨眉山万佛顶', longitude: 103.34, latitude: 29.52, elevationM: 3099, region: '四川', note: '垂直带谱与佛教名山' },
  { id: 'changbai', name: '长白山白云峰', longitude: 128.057, latitude: 41.98, elevationM: 2749, region: '吉林 · 长白山脉', note: '休眠火山，天池所在地' },
  { id: 'huashan', name: '华山', longitude: 110.09, latitude: 34.475, elevationM: 2155, region: '陕西 · 秦岭', note: '花岗岩断块山，地质教学名山' },
  { id: 'huangshan', name: '黄山莲花峰', longitude: 118.165, latitude: 30.125, elevationM: 1864, region: '安徽', note: '花岗岩峰林地貌' },
  { id: 'taishan', name: '泰山玉皇顶', longitude: 117.1, latitude: 36.256, elevationM: 1545, region: '山东', note: '古老变质岩断块山，五岳之首' },
  { id: 'montblanc', name: '勃朗峰', longitude: 6.865, latitude: 45.833, elevationM: 4808, region: '法国/意大利 · 阿尔卑斯山脉', note: '阿尔卑斯山脉与西欧最高峰' },
  { id: 'matterhorn', name: '马特洪峰', longitude: 7.659, latitude: 45.976, elevationM: 4478, region: '瑞士/意大利 · 阿尔卑斯山脉', note: '金字塔形角峰的教科书案例' },
  { id: 'elbrus', name: '厄尔布鲁士山', longitude: 42.439, latitude: 43.349, elevationM: 5642, region: '俄罗斯 · 高加索山脉', note: '欧洲最高峰，休眠火山' },
  { id: 'kilimanjaro', name: '乞力马扎罗山', longitude: 37.356, latitude: -3.067, elevationM: 5895, region: '坦桑尼亚', note: '非洲最高峰，“赤道雪峰”' },
  { id: 'aconcagua', name: '阿空加瓜山', longitude: -70.011, latitude: -32.653, elevationM: 6961, region: '阿根廷 · 安第斯山脉', note: '南美洲与南半球（亚洲外）最高峰' },
  { id: 'denali', name: '德纳里峰', longitude: -151.007, latitude: 63.069, elevationM: 6190, region: '美国 · 阿拉斯加', note: '北美洲最高峰，相对高度极大' },
  { id: 'fujisan', name: '富士山', longitude: 138.727, latitude: 35.361, elevationM: 3776, region: '日本', note: '层状火山锥的典型形态' },
  { id: 'puncakjaya', name: '查亚峰', longitude: 137.158, latitude: -4.088, elevationM: 4884, region: '印度尼西亚', note: '大洋洲最高峰，热带冰川残存' },
  { id: 'vinson', name: '文森峰', longitude: -85.617, latitude: -78.525, elevationM: 4892, region: '南极洲', note: '南极洲最高峰' }
]

export function findPeaksNear(longitude: number, latitude: number, radiusKm: number): PeakNearMatch[] {
  const matches: PeakNearMatch[] = []
  for (const peak of notablePeaks) {
    const distanceKm = greatCircleKm(longitude, latitude, peak.longitude, peak.latitude)
    if (distanceKm > radiusKm) continue
    matches.push({ ...peak, distanceKm: Math.round(distanceKm * 10) / 10, bearingDeg: Math.round(bearingDeg(longitude, latitude, peak.longitude, peak.latitude) * 10) / 10 })
  }
  return matches.sort((a, b) => b.elevationM - a.elevationM)
}

export function nearestPeaks(longitude: number, latitude: number, limit: number): PeakNearMatch[] {
  const all = notablePeaks.map((peak) => ({
    ...peak,
    distanceKm: Math.round(greatCircleKm(longitude, latitude, peak.longitude, peak.latitude) * 10) / 10,
    bearingDeg: Math.round(bearingDeg(longitude, latitude, peak.longitude, peak.latitude) * 10) / 10
  }))
  return all.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, Math.max(1, limit))
}
