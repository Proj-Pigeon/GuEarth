export type TyphoonIntensity = 'td' | 'ts' | 'ty' | 'super'

export interface TyphoonIntensityStyle {
  name: string
  color: string
}

export const typhoonIntensityStyles: Record<TyphoonIntensity, TyphoonIntensityStyle> = {
  td: { name: '热带低压', color: '#1677ff' },
  ts: { name: '热带风暴', color: '#faad14' },
  ty: { name: '台风', color: '#fa8c16' },
  super: { name: '超强台风', color: '#f5222d' }
}

export interface TyphoonTrackPoint {
  longitude: number
  latitude: number
  intensity: TyphoonIntensity
  note?: string
}

export interface TyphoonTrack {
  id: string
  name: string
  englishName: string
  year: number
  summary: string
  points: TyphoonTrackPoint[]
}

export const typhoonTracks: TyphoonTrack[] = [
  {
    id: 'mangkhut-2018',
    name: '山竹',
    englishName: 'Mangkhut',
    year: 2018,
    summary:
      '2018年第22号台风，西太平洋生成后一路西行稳定加强为超强台风，穿过吕宋岛北部进入南海，强度有所减弱后于9月16日以强台风级在广东台山沿海登陆，是当年登陆我国的最强台风。路径典型地体现了西北太平洋台风受副热带高压引导自东向西移动、登陆华南的常见路径。',
    points: [
      { longitude: 165, latitude: 8, intensity: 'td' },
      { longitude: 150, latitude: 11, intensity: 'ts' },
      { longitude: 135, latitude: 13, intensity: 'ty' },
      { longitude: 126, latitude: 15, intensity: 'super', note: '巅峰强度超强台风' },
      { longitude: 120, latitude: 17.5, intensity: 'super' },
      { longitude: 116, latitude: 19.5, intensity: 'ty', note: '穿过吕宋岛北部，受地形摩擦减弱' },
      { longitude: 113, latitude: 21.8, intensity: 'ty', note: '在广东台山沿海登陆' },
      { longitude: 110, latitude: 23.5, intensity: 'td', note: '深入内陆减弱消散' }
    ]
  },
  {
    id: 'lekima-2019',
    name: '利奇马',
    englishName: 'Lekima',
    year: 2019,
    summary:
      '2019年第9号台风，在西北太平洋生成后向西北方向移动并加强为超强台风，8月10日在浙江温岭沿海登陆，是1949年以来登陆浙江第三强的台风。登陆后北上深入华东、华北，残余环流在山东、环渤海地区造成大范围暴雨，说明台风登陆后残余水汽仍可导致远离沿海的严重洪涝。',
    points: [
      { longitude: 134, latitude: 14, intensity: 'td' },
      { longitude: 128, latitude: 16.5, intensity: 'ts' },
      { longitude: 124, latitude: 20, intensity: 'ty' },
      { longitude: 123, latitude: 24, intensity: 'super', note: '巅峰强度超强台风' },
      { longitude: 121.9, latitude: 27.5, intensity: 'super' },
      { longitude: 121.4, latitude: 28.4, intensity: 'ty', note: '在浙江温岭沿海登陆' },
      { longitude: 120, latitude: 30.5, intensity: 'ts' },
      { longitude: 118.5, latitude: 33, intensity: 'td', note: '北上残余环流影响华北' }
    ]
  },
  {
    id: 'haiyan-2013',
    name: '海燕',
    englishName: 'Haiyan',
    year: 2013,
    summary:
      '2013年第30号台风，是有记录以来登陆强度最强的热带气旋之一，巅峰中心风力超过17级。11月8日以巅峰强度在菲律宾莱特岛沿海登陆，造成重大人员伤亡，随后进入南海并减弱，最终在越南北部沿海再次登陆。体现台风在温暖洋面上可急剧增强（快速加强）的特点。',
    points: [
      { longitude: 145, latitude: 6, intensity: 'td' },
      { longitude: 136, latitude: 7, intensity: 'ts' },
      { longitude: 129, latitude: 8, intensity: 'ty' },
      { longitude: 125.5, latitude: 10, intensity: 'super', note: '在温暖洋面上快速加强' },
      { longitude: 122, latitude: 11, intensity: 'super', note: '登陆菲律宾莱特岛' },
      { longitude: 118, latitude: 13, intensity: 'ty' },
      { longitude: 113, latitude: 16, intensity: 'ty' },
      { longitude: 108, latitude: 18.5, intensity: 'ts' },
      { longitude: 105, latitude: 20.5, intensity: 'td', note: '在越南北部沿海再次登陆' }
    ]
  },
  {
    id: 'doksuri-2023',
    name: '杜苏芮',
    englishName: 'Doksuri',
    year: 2023,
    summary:
      '2023年第5号台风，西北路径穿过巴士海峡，7月28日以强台风级在福建晋江沿海登陆，是当年登陆我国的最强台风。登陆后残余环流深入内陆北上，与地形和水汽共同作用，在京津冀地区引发极端强降雨，说明台风灾害不限于沿海，残余环流可造成内陆特大暴雨。',
    points: [
      { longitude: 127, latitude: 15, intensity: 'td' },
      { longitude: 124, latitude: 17.5, intensity: 'ts' },
      { longitude: 121, latitude: 20, intensity: 'ty' },
      { longitude: 119.5, latitude: 23, intensity: 'super', note: '巅峰强度超强台风' },
      { longitude: 118.6, latitude: 24.6, intensity: 'ty', note: '在福建晋江沿海登陆' },
      { longitude: 117, latitude: 26.5, intensity: 'ts' },
      { longitude: 115.5, latitude: 29, intensity: 'td' },
      { longitude: 114, latitude: 33, intensity: 'td', note: '残余环流北上影响京津冀' }
    ]
  }
]
