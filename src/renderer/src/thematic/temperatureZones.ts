export interface TemperatureZoneBand {
  id: string
  name: string
  south: number
  north: number
  color: string
  labelAt: [number, number]
  summary: string
}

export interface TemperatureZoneLine {
  id: string
  name: string
  latitude: number
  labelLon: number
  summary: string
}

export const TROPIC_LATITUDE = 23.5
export const POLAR_CIRCLE_LATITUDE = 66.5

export const temperatureZoneBands: TemperatureZoneBand[] = [
  {
    id: 'north-frigid',
    name: '北寒带',
    south: POLAR_CIRCLE_LATITUDE,
    north: 90,
    color: '#1677ff',
    labelAt: [40, 78],
    summary:
      '北极圈以北地区。有极昼极夜现象，全年获得的太阳辐射最少，气温很低，是地球上年平均气温最低的地区。'
  },
  {
    id: 'north-temperate',
    name: '北温带',
    south: TROPIC_LATITUDE,
    north: POLAR_CIRCLE_LATITUDE,
    color: '#52c41a',
    labelAt: [40, 45],
    summary: '北回归线与北极圈之间。既无太阳直射，也无极昼极夜，四季变化明显。'
  },
  {
    id: 'tropical',
    name: '热带',
    south: -TROPIC_LATITUDE,
    north: TROPIC_LATITUDE,
    color: '#fa8c16',
    labelAt: [0, 0],
    summary: '南北回归线之间。一年内有太阳直射现象，获得太阳辐射最多，终年炎热，昼夜长短变化不大。'
  },
  {
    id: 'south-temperate',
    name: '南温带',
    south: -POLAR_CIRCLE_LATITUDE,
    north: -TROPIC_LATITUDE,
    color: '#52c41a',
    labelAt: [40, -45],
    summary: '南回归线与南极圈之间。既无太阳直射，也无极昼极夜，四季变化明显（与北半球季节相反）。'
  },
  {
    id: 'south-frigid',
    name: '南寒带',
    south: -90,
    north: -POLAR_CIRCLE_LATITUDE,
    color: '#1677ff',
    labelAt: [40, -78],
    summary: '南极圈以南地区。有极昼极夜现象，全年获得的太阳辐射最少，气温很低。'
  }
]

export const temperatureZoneLines: TemperatureZoneLine[] = [
  {
    id: 'arctic-circle',
    name: '北极圈',
    latitude: POLAR_CIRCLE_LATITUDE,
    labelLon: -168,
    summary: '北纬 66.5°，北寒带与北温带的分界线，也是极昼极夜现象出现的最低纬度。'
  },
  {
    id: 'tropic-of-cancer',
    name: '北回归线',
    latitude: TROPIC_LATITUDE,
    labelLon: -168,
    summary: '北纬 23.5°，太阳直射点能够到达的最北位置，热带与北温带的分界线。'
  },
  {
    id: 'tropic-of-capricorn',
    name: '南回归线',
    latitude: -TROPIC_LATITUDE,
    labelLon: -168,
    summary: '南纬 23.5°，太阳直射点能够到达的最南位置，热带与南温带的分界线。'
  },
  {
    id: 'antarctic-circle',
    name: '南极圈',
    latitude: -POLAR_CIRCLE_LATITUDE,
    labelLon: -168,
    summary: '南纬 66.5°，南寒带与南温带的分界线，也是极昼极夜现象出现的最低纬度。'
  }
]
