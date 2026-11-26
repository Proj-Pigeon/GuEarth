const BELT_LON_START = 104
const BELT_LON_END = 123
const BELT_THICKNESS = 4.4
const BELT_BOW = 1.1

const axisControls: [number, number][] = [
  [3, 21.5],
  [4, 24],
  [5, 26],
  [6, 30],
  [7, 36.5],
  [8, 38.5],
  [9, 31],
  [10, 25.5],
  [11, 23.5]
]

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  return ease((value - edge0) / (edge1 - edge0))
}

export function beltAxisLatitude(month: number): number {
  if (month <= axisControls[0][0]) {return axisControls[0][1]}
  const last = axisControls[axisControls.length - 1]
  if (month >= last[0]) {return last[1]}
  for (let i = 1; i < axisControls.length; i += 1) {
    const [prevMonth, prevLat] = axisControls[i - 1]
    const [nextMonth, nextLat] = axisControls[i]
    if (month <= nextMonth) {return prevLat + (nextLat - prevLat) * ease((month - prevMonth) / (nextMonth - prevMonth))}
  }
  return last[1]
}

export function beltOpacity(month: number): number {
  return 0.5 * smoothstep(3, 4.2, month) * (1 - smoothstep(10, 11, month))
}

export function beltLabel(month: number): string {
  if (month < 3.5 || month >= 11) {return ''}
  if (month < 5.5) {return '华南前汛期'}
  if (month < 6.75) {return '江淮梅雨'}
  if (month < 8.6) {return '华北、东北雨季'}
  if (month < 9.6) {return '雨带南撤'}
  return '雨带退出大陆'
}

export function beltLabelPosition(month: number): [number, number] {
  return [113.5, beltAxisLatitude(month) + 7]
}

export function beltRing(month: number): number[] {
  if (beltOpacity(month) <= 0.02) {return [113, 28, 114, 28, 113, 29]}
  const axis = beltAxisLatitude(month)
  const span = BELT_LON_END - BELT_LON_START
  const steps = 8
  const bottom: number[] = []
  const top: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const lon = BELT_LON_START + (span * i) / steps
    const bow = BELT_BOW * Math.sin((Math.PI * i) / steps)
    bottom.push(lon, axis - BELT_THICKNESS / 2 + bow)
    top.push(lon, axis + BELT_THICKNESS / 2 + bow)
  }
  const ring: number[] = [...bottom]
  for (let i = top.length - 2; i >= 0; i -= 2) {ring.push(top[i], top[i + 1])}
  return ring
}
