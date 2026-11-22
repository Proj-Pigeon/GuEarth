const DEG = Math.PI / 180
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export type DayState = 'normal' | 'polar-day' | 'polar-night'

export function dayOfYear(month: number, day: number): number {
  let total = 0
  for (let index = 0; index < Math.min(12, Math.max(0, month - 1)); index += 1)
    total += MONTH_DAYS[index]
  return total + day
}

export function monthStartDayOfYear(): number[] {
  const starts: number[] = [1]
  for (let index = 0; index < 11; index += 1) starts.push(starts[index] + MONTH_DAYS[index])
  return starts
}

export function solarDeclinationDeg(dayOfYearValue: number): number {
  return 23.45 * Math.sin(((360 * (284 + dayOfYearValue)) / 365) * DEG)
}

export function declinationForDate(month: number, day: number): number {
  return solarDeclinationDeg(dayOfYear(month, day))
}

export interface DayLengthResult {
  hours: number
  state: DayState
}

export function dayLength(latitudeDeg: number, declinationDeg: number): DayLengthResult {
  const cosHourAngle = -Math.tan(latitudeDeg * DEG) * Math.tan(declinationDeg * DEG)
  if (cosHourAngle < -1) return { hours: 24, state: 'polar-day' }
  if (cosHourAngle > 1) return { hours: 0, state: 'polar-night' }
  return { hours: (2 * Math.acos(cosHourAngle)) / DEG / 15, state: 'normal' }
}

export function noonAltitudeDeg(latitudeDeg: number, declinationDeg: number): number {
  return 90 - Math.abs(latitudeDeg - declinationDeg)
}

export interface SunTimesResult {
  state: DayState
  sunrise?: number
  sunset?: number
}

export function sunTimes(latitudeDeg: number, declinationDeg: number): SunTimesResult {
  const result = dayLength(latitudeDeg, declinationDeg)
  if (result.state !== 'normal') return { state: result.state }
  const halfDay = result.hours / 2
  return { state: 'normal', sunrise: 12 - halfDay, sunset: 12 + halfDay }
}

export function localSolarTime(utcHours: number, longitudeDeg: number): number {
  return (((utcHours + longitudeDeg / 15) % 24) + 24) % 24
}

export interface SubsolarPoint {
  longitude: number
  latitude: number
}

export function subsolarPointDeg(utcMs: number): SubsolarPoint {
  const date = new Date(utcMs)
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const longitude = (((12 - utcHours) * 15 + 540) % 360) - 180
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  return { longitude, latitude: declinationForDate(month, day) }
}

export interface HorizontalPosition {
  altitudeDeg: number
  azimuthDeg: number
}

export function solarHorizontalPositionDeg(
  latitudeDeg: number,
  declinationDeg: number,
  localSolarHour: number
): HorizontalPosition {
  const phi = latitudeDeg * DEG
  const delta = declinationDeg * DEG
  const hourAngle = (localSolarHour - 12) * 15 * DEG
  const sinAltitude =
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle)
  const altitudeDeg = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / DEG
  const east = -Math.cos(delta) * Math.sin(hourAngle)
  const north =
    Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(hourAngle)
  const azimuthDeg = (((Math.atan2(east, north) / DEG) % 360) + 360) % 360
  return { altitudeDeg, azimuthDeg }
}

export interface HorizonCrossings {
  state: DayState
  sunriseAzimuthDeg?: number
  sunsetAzimuthDeg?: number
}

export function horizonCrossingsDeg(latitudeDeg: number, declinationDeg: number): HorizonCrossings {
  const result = dayLength(latitudeDeg, declinationDeg)
  if (result.state !== 'normal') return { state: result.state }
  const cosAzimuth = Math.sin(declinationDeg * DEG) / Math.cos(latitudeDeg * DEG)
  const clamped = Math.max(-1, Math.min(1, cosAzimuth))
  const sunrise = Math.acos(clamped) / DEG
  return { state: 'normal', sunriseAzimuthDeg: sunrise, sunsetAzimuthDeg: 360 - sunrise }
}

export function formatClock(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24
  const hours = Math.floor(normalized)
  const minutes = Math.floor((normalized - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export interface DateParts {
  month: number
  day: number
}

export function datePartsOf(dateStr: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return { month: 1, day: 1 }
  return { month: Number(match[2]), day: Number(match[3]) }
}

export function isValidDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const ms = Date.parse(`${dateStr}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === dateStr
}

export function shiftDate(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`)
  if (!Number.isFinite(ms)) return dateStr
  return new Date(ms + days * 86400000).toISOString().slice(0, 10)
}

export type SolarPreset =
  | 'spring-equinox'
  | 'summer-solstice'
  | 'autumn-equinox'
  | 'winter-solstice'

const PRESET_DATE_SUFFIX: Record<SolarPreset, string> = {
  'spring-equinox': '03-21',
  'summer-solstice': '06-22',
  'autumn-equinox': '09-23',
  'winter-solstice': '12-22'
}

export function presetDate(preset: SolarPreset, year: number): string {
  return `${year}-${PRESET_DATE_SUFFIX[preset]}`
}
