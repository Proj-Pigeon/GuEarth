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
  { id: 'gasherbrum1', name: '加舒尔布鲁木I峰', longitude: 76.697, latitude: 35.724, elevationM: 8068, region: '中国/巴基斯坦 · 喀喇昆仑山脉', note: '世界第十一高峰' },
  { id: 'broadpeak', name: '布洛阿特峰', longitude: 76.568, latitude: 35.81, elevationM: 8051, region: '中国/巴基斯坦 · 喀喇昆仑山脉', note: '世界第十二高峰' },
  { id: 'namchabarwa', name: '南迦巴瓦峰', longitude: 95.056, latitude: 29.631, elevationM: 7782, region: '西藏 · 喜马拉雅山脉东端', note: '雅鲁藏布大拐弯环绕的高差极大雪峰' },
  { id: 'khan-tengri', name: '汗腾格里峰', longitude: 80.122, latitude: 42.211, elevationM: 6995, region: '中国/吉尔吉斯 · 天山西段', note: '天山第二高峰，冰川发育' },
  { id: 'muztag-kungtag', name: '木孜塔格峰', longitude: 87.25, latitude: 36.4, elevationM: 6973, region: '新疆/青海 · 昆仑山中段', note: '昆仑山中段最高峰，无人区冰川' },
  { id: 'anyemaqen', name: '阿尼玛卿主峰玛卿岗日', longitude: 99.45, latitude: 34.795, elevationM: 6282, region: '青海 · 阿尼玛卿山', note: '黄河源头区的著名雪山' },
  { id: 'xuebaoding', name: '雪宝顶', longitude: 103.673, latitude: 32.687, elevationM: 5588, region: '四川 · 岷山', note: '岷山最高峰，黄龙钙华景观所在山系' },
  { id: 'taibai', name: '太白山拔仙台', longitude: 107.767, latitude: 33.95, elevationM: 3771, region: '陕西 · 秦岭', note: '秦岭最高峰，中国南北方分界山地' },
  { id: 'wutaishan', name: '五台山北台叶斗峰', longitude: 113.55, latitude: 39.08, elevationM: 3061, region: '山西', note: '华北最高峰，佛教名山' },
  { id: 'helanshan', name: '贺兰山主峰', longitude: 105.917, latitude: 38.733, elevationM: 3556, region: '宁夏/内蒙古', note: '季风区与西北干旱区的界山' },
  { id: 'shennongding', name: '神农顶', longitude: 110.283, latitude: 31.45, elevationM: 3106, region: '湖北 · 神农架', note: '“华中屋脊”，北亚热带原始森林' },
  { id: 'huanggangshan', name: '黄岗山（武夷山）', longitude: 117.783, latitude: 27.85, elevationM: 2161, region: '江西/福建 · 武夷山脉', note: '武夷山脉最高峰，世界双遗产地' },
  { id: 'fanjingshan', name: '梵净山', longitude: 108.783, latitude: 27.917, elevationM: 2572, region: '贵州', note: '武陵山脉主峰，黔金丝猴栖息地' },
  { id: 'wuzhishan', name: '五指山', longitude: 109.667, latitude: 18.867, elevationM: 1867, region: '海南', note: '海南岛最高峰，热带山地景观' },
  { id: 'huanggangliang', name: '黄岗梁', longitude: 117.5, latitude: 43.317, elevationM: 2029, region: '内蒙古 · 大兴安岭', note: '大兴安岭最高峰' },
  { id: 'nanyue-hengshan', name: '衡山祝融峰', longitude: 112.7, latitude: 27.25, elevationM: 1301, region: '湖南', note: '南岳，五岳之一' },
  { id: 'beiyue-hengshan', name: '恒山天峰岭', longitude: 113.733, latitude: 39.667, elevationM: 2016, region: '山西', note: '北岳，五岳之一' },
  { id: 'songshan', name: '嵩山峻极峰', longitude: 113.083, latitude: 34.5, elevationM: 1492, region: '河南', note: '中岳，五岳之一' },
  { id: 'montblanc', name: '勃朗峰', longitude: 6.865, latitude: 45.833, elevationM: 4808, region: '法国/意大利 · 阿尔卑斯山脉', note: '阿尔卑斯山脉与西欧最高峰' },
  { id: 'matterhorn', name: '马特洪峰', longitude: 7.659, latitude: 45.976, elevationM: 4478, region: '瑞士/意大利 · 阿尔卑斯山脉', note: '金字塔形角峰的教科书案例' },
  { id: 'elbrus', name: '厄尔布鲁士山', longitude: 42.439, latitude: 43.349, elevationM: 5642, region: '俄罗斯 · 高加索山脉', note: '欧洲最高峰，休眠火山' },
  { id: 'kilimanjaro', name: '乞力马扎罗山', longitude: 37.356, latitude: -3.067, elevationM: 5895, region: '坦桑尼亚', note: '非洲最高峰，“赤道雪峰”' },
  { id: 'aconcagua', name: '阿空加瓜山', longitude: -70.011, latitude: -32.653, elevationM: 6961, region: '阿根廷 · 安第斯山脉', note: '南美洲与南半球（亚洲外）最高峰' },
  { id: 'denali', name: '德纳里峰', longitude: -151.007, latitude: 63.069, elevationM: 6190, region: '美国 · 阿拉斯加', note: '北美洲最高峰，相对高度极大' },
  { id: 'fujisan', name: '富士山', longitude: 138.727, latitude: 35.361, elevationM: 3776, region: '日本', note: '层状火山锥的典型形态' },
  { id: 'puncakjaya', name: '查亚峰', longitude: 137.158, latitude: -4.088, elevationM: 4884, region: '印度尼西亚', note: '大洋洲最高峰，热带冰川残存' },
  { id: 'vinson', name: '文森峰', longitude: -85.617, latitude: -78.525, elevationM: 4892, region: '南极洲', note: '南极洲最高峰' },
  { id: 'kangchenjunga', name: '干城章嘉峰', longitude: 88.147, latitude: 27.702, elevationM: 8586, region: '尼泊尔/印度 · 喜马拉雅山脉', note: '世界第三高峰' },
  { id: 'dhaulagiri', name: '道拉吉里峰', longitude: 83.493, latitude: 28.742, elevationM: 8167, region: '尼泊尔 · 喜马拉雅山脉', note: '世界第七高峰' },
  { id: 'manaslu', name: '马纳斯鲁峰', longitude: 84.559, latitude: 28.55, elevationM: 8163, region: '尼泊尔 · 喜马拉雅山脉', note: '世界第八高峰' },
  { id: 'annapurna', name: '安纳普尔纳峰', longitude: 83.82, latitude: 28.596, elevationM: 8091, region: '尼泊尔 · 喜马拉雅山脉', note: '世界第十高峰，攀登死亡率著名' },
  { id: 'nangaparbat', name: '南迦帕尔巴特峰', longitude: 74.589, latitude: 35.237, elevationM: 8126, region: '巴基斯坦 · 喜马拉雅山脉西端', note: '世界第九高峰，印度河大拐弯旁' },
  { id: 'lenin-peak', name: '列宁峰', longitude: 72.883, latitude: 39.342, elevationM: 7134, region: '吉尔吉斯/塔吉克 · 帕米尔', note: '帕米尔高原代表高峰' },
  { id: 'hallasan', name: '汉拿山', longitude: 126.529, latitude: 33.362, elevationM: 1947, region: '韩国济州岛', note: '韩国最高峰，休眠火山与火山湖' },
  { id: 'kinabalu', name: '京那巴鲁山', longitude: 116.558, latitude: 6.075, elevationM: 4095, region: '马来西亚 · 婆罗洲', note: '东南亚最高峰之一，热带高山特有物种' },
  { id: 'fansipan', name: '番西邦峰', longitude: 103.845, latitude: 22.309, elevationM: 3143, region: '越南 · 黄连山脉', note: '中南半岛最高峰' },
  { id: 'mauna-kea', name: '冒纳凯阿火山', longitude: -155.468, latitude: 19.821, elevationM: 4207, region: '美国夏威夷', note: '从海底算起高逾万米，天文学观测胜地' },
  { id: 'kilauea', name: '基拉韦厄火山', longitude: -155.287, latitude: 19.421, elevationM: 1247, region: '美国夏威夷', note: '世界最活跃的盾状火山之一' },
  { id: 'mount-st-helens', name: '圣海伦斯火山', longitude: -122.195, latitude: 46.855, elevationM: 2549, region: '美国喀斯喀特山脉', note: '1980 年大爆发的活火山案例' },
  { id: 'vesuvius', name: '维苏威火山', longitude: 14.426, latitude: 40.821, elevationM: 1281, region: '意大利', note: '庞贝古城掩埋者，活火山' },
  { id: 'etna', name: '埃特纳火山', longitude: 14.996, latitude: 37.751, elevationM: 3357, region: '意大利西西里岛', note: '欧洲最活跃的火山' },
  { id: 'jungfrau', name: '少女峰', longitude: 7.985, latitude: 46.538, elevationM: 4158, region: '瑞士 · 阿尔卑斯山脉', note: '阿莱奇冰川源头，冰川教学名山' },
  { id: 'toubkal', name: '图卜卡尔山', longitude: -7.915, latitude: 31.061, elevationM: 4167, region: '摩洛哥 · 阿特拉斯山脉', note: '北非最高峰' },
  { id: 'mount-kenya', name: '肯尼亚山', longitude: 37.307, latitude: -0.152, elevationM: 5199, region: '肯尼亚', note: '赤道上的古冰川角峰，非洲第二高峰' },
  { id: 'mount-stanley', name: '斯坦利山（鲁文佐里）', longitude: 29.583, latitude: 0.38, elevationM: 5109, region: '乌干达/刚果（金）', note: '赤道多雨区的冰川山地，“月亮山”' },
  { id: 'mount-logan', name: '洛根山', longitude: -140.405, latitude: 60.72, elevationM: 5959, region: '加拿大', note: '加拿大最高峰，冰盖覆盖' },
  { id: 'mount-whitney', name: '惠特尼峰', longitude: -118.292, latitude: 36.579, elevationM: 4421, region: '美国 · 内华达山脉', note: '美国本土48州最高峰' },
  { id: 'mount-rainier', name: '雷尼尔山', longitude: -121.76, latitude: 46.852, elevationM: 4392, region: '美国喀斯喀特山脉', note: '巨型层状活火山，冰川数量众多' },
  { id: 'pico-de-orizaba', name: '奥里萨巴火山', longitude: -97.027, latitude: 19.031, elevationM: 5636, region: '墨西哥', note: '墨西哥最高峰，北美第三高峰' },
  { id: 'ojos-del-salado', name: '奥霍斯-德尔萨拉多山', longitude: -68.553, latitude: -27.114, elevationM: 6893, region: '智利/阿根廷 · 安第斯山脉', note: '世界最高火山' },
  { id: 'huascaran', name: '瓦斯卡兰峰', longitude: -77.609, latitude: -9.122, elevationM: 6768, region: '秘鲁 · 安第斯山脉', note: '热带纬度的著名冰川山，山洪灾害案例' },
  { id: 'mount-kosciuszko', name: '科修斯科山', longitude: 148.263, latitude: -36.456, elevationM: 2228, region: '澳大利亚', note: '澳大利亚大陆最高峰' }
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
