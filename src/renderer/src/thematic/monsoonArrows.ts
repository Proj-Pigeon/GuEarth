export interface MonsoonArrow {
  path: Array<[number, number]>
  label: string
}

export const summerMonsoonArrows: MonsoonArrow[] = [
  { path: [[44, -12], [50, -4], [56, 4], [61, 10]], label: '越赤道气流' },
  { path: [[50, 6], [60, 10], [70, 15], [80, 20], [88, 24]], label: '西南季风' },
  { path: [[86, 4], [92, 10], [98, 16], [104, 21]], label: '西南季风' },
  { path: [[106, -4], [109, 3], [113, 10], [118, 16]], label: '西南季风' },
  { path: [[134, 12], [129, 18], [124, 24], [120, 29]], label: '东南季风' },
  { path: [[130, 22], [126, 28], [122, 34]], label: '东南季风' }
]

export const winterMonsoonArrows: MonsoonArrow[] = [
  { path: [[90, 58], [97, 51], [104, 45], [110, 40]], label: '西北季风' },
  { path: [[103, 54], [110, 47], [117, 40], [122, 33]], label: '西北季风' },
  { path: [[108, 44], [114, 38], [120, 31], [124, 24]], label: '西北季风' },
  { path: [[120, 22], [115, 16], [110, 11], [106, 7]], label: '东北季风' },
  { path: [[97, 26], [91, 20], [85, 15], [80, 11]], label: '东北季风' }
]
