export interface FlightStop {
  id: string
  name: string
  longitude: number
  latitude: number
  height: number
  note?: string
}

export interface FlightStopInput {
  name?: unknown
  longitude?: unknown
  latitude?: unknown
  height?: unknown
  note?: unknown
}

export type StopSwitchAction = 'next' | 'prev' | 'goto'

export interface StopSwitchRequest {
  action?: unknown
  index?: unknown
  name?: unknown
}

export const DEFAULT_FLIGHT_HEIGHT = 60_000
export const MAX_FLIGHT_HEIGHT = 20_000_000
export const MAX_FLIGHT_STOPS = 12

const SWITCH_INTENT_PATTERN =
  /切换|切到|切回|换到|换个地点|下一|上一|下个|上个|下[一]?站|上[一]?站|跳到|跳转|飞到|飞往|飞去|移到|定位到|带我看|带我去|(?:看看|看|查看|去|回|回到)\s*第\s*[一二三四五六七八九十百\d]+|^\s*第\s*[一二三四五六七八九十百\d]+\s*[个站处地点]*\s*$|回到|去看看|过去看|switch|next|prev|previous|fly\s*to|go\s*to/i

const NEGATED_SWITCH_PATTERN =
  /(?:不要|别|不用|不需要|不必|无需|勿|先不|暂不|不想|禁止|不)\s*(?:再|继续|主动|自动|随意|随便|急着|马上|立刻|总是|一直|只|光)?\s*(?:切换|切到|切回|换到|换个地点|跳到|跳转|飞到|飞往|飞去|移到|定位到|带我看|带我去|去看看|过去看|看看|查看|回到|看|去|回|下一[个站]?|上一[个站]?|switch|next|prev(?:ious)?|fly\s*to|go\s*to)|(?:don['’]?t|do\s+not|never|no\s+need\s+to)\s+(?:switch|fly\s*to|go\s*to|next|prev(?:ious)?)/i

const NON_FLIGHT_SWITCH_PATTERN =
  /(?:切换|切到|切回|换到|跳到|跳转|移到|定位到)(?:到|成|为)?\s*[^，。；！？：,;.!?:\n]{0,6}?(?:图层|底图|地图|话题|模式|面板|主题|语言|章节|第\s*[一二三四五六七八九十百\d]+\s*章|季节|日期|时间|账号)/gi

const SWITCH_CLAUSE_SEPARATOR = /[，。；！？：,;.!?:\n]+/

export function hasExplicitStopSwitchIntent(userText: string): boolean {
  const normalized = userText.trim()
  if (!normalized) {
    return false
  }
  return normalized
    .split(SWITCH_CLAUSE_SEPARATOR)
    .some(
      clause =>
        !NEGATED_SWITCH_PATTERN.test(clause) &&
        SWITCH_INTENT_PATTERN.test(clause.replaceAll(NON_FLIGHT_SWITCH_PATTERN, ' '))
    )
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}

function isNearCoordinate(a: FlightStop, b: FlightStop): boolean {
  return Math.abs(a.longitude - b.longitude) < 1e-4 && Math.abs(a.latitude - b.latitude) < 1e-4
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value.trim())
  }
  return Number.NaN
}

export function normalizeFlightStop(
  raw: FlightStopInput,
  index = 0
): { stop?: FlightStop; error?: string } {
  const longitude = toNumber(raw.longitude)
  const latitude = toNumber(raw.latitude)
  const rawHeight = raw.height
  const height =
    rawHeight === undefined || rawHeight === null || rawHeight === ''
      ? DEFAULT_FLIGHT_HEIGHT
      : toNumber(rawHeight)
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return { error: '坐标无效，需要 WGS-84 经纬度' }
  }
  if (!Number.isFinite(height) || height <= 0 || height > MAX_FLIGHT_HEIGHT) {
    return { error: '视点高度无效' }
  }
  const name = cleanText(raw.name, 80) || `地点 ${index + 1}`
  const note = cleanText(raw.note, 160)
  return {
    stop: {
      id: `${index}:${longitude.toFixed(5)},${latitude.toFixed(5)}`,
      name,
      longitude,
      latitude,
      height,
      ...(note ? { note } : {})
    }
  }
}

export function normalizeFlightStopList(
  rawItems: unknown,
  startIndex = 0
): { stops: FlightStop[]; errors: string[] } {
  if (!Array.isArray(rawItems)) {
    return { stops: [], errors: ['locations 需要是地点数组'] }
  }
  const stops: FlightStop[] = []
  const errors: string[] = []
  for (const item of rawItems) {
    if (stops.length >= MAX_FLIGHT_STOPS) {
      break
    }
    if (typeof item !== 'object' || item === null) {
      errors.push('地点项格式无效')
      continue
    }
    const normalized = normalizeFlightStop(item as FlightStopInput, startIndex + stops.length)
    if (normalized.error || !normalized.stop) {
      if (normalized.error) {
        errors.push(normalized.error)
      }
      continue
    }
    if (!stops.some(existing => isNearCoordinate(existing, normalized.stop!))) {
      stops.push(normalized.stop)
    }
  }
  return { stops, errors }
}

export function mergeFlightStops(
  existing: readonly FlightStop[],
  incoming: readonly FlightStop[]
): FlightStop[] {
  const result = [...existing]
  for (const candidate of incoming) {
    if (result.length >= MAX_FLIGHT_STOPS) {
      break
    }
    if (result.some(item => isNearCoordinate(item, candidate))) {
      continue
    }
    result.push({
      ...candidate,
      id: `${result.length}:${candidate.longitude.toFixed(5)},${candidate.latitude.toFixed(5)}`,
      name: candidate.name || `地点 ${result.length + 1}`
    })
  }
  return result
}

export function parseFlyToArgs(
  args: Record<string, unknown>,
  existingCount = 0
): { stops: FlightStop[]; isBatch: boolean; error?: string } {
  if (args.locations !== undefined) {
    const { stops, errors } = normalizeFlightStopList(args.locations, existingCount)
    if (stops.length === 0) {
      return {
        stops: [],
        isBatch: true,
        error: errors[0] ?? 'locations 至少需要包含一个有效坐标地点'
      }
    }
    return { stops, isBatch: true }
  }
  const normalized = normalizeFlightStop(
    {
      name: args.name,
      longitude: args.longitude,
      latitude: args.latitude,
      height: args.height,
      note: args.note
    },
    existingCount
  )
  if (normalized.error || !normalized.stop) {
    return { stops: [], isBatch: false, error: normalized.error ?? '坐标无效' }
  }
  return { stops: [normalized.stop], isBatch: false }
}

export function clampStopIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.max(0, Math.min(total - 1, Math.trunc(index)))
}

export function resolveStopTarget(
  stops: readonly FlightStop[],
  currentIndex: number,
  request: StopSwitchRequest
): { index?: number; error?: string } {
  if (stops.length === 0) {
    return { error: '当前没有可切换的飞行地点列表' }
  }
  const rawAction = typeof request.action === 'string' ? request.action.trim().toLowerCase() : ''
  const action: StopSwitchAction =
    rawAction === 'prev' || rawAction === 'previous'
      ? 'prev'
      : rawAction === 'next'
        ? 'next'
        : rawAction === 'goto' ||
            request.index !== undefined ||
            (typeof request.name === 'string' && request.name.trim() !== '')
          ? 'goto'
          : 'next'
  if (action === 'next') {
    if (currentIndex >= stops.length - 1) {
      return { error: '已经是最后一个地点' }
    }
    return { index: currentIndex + 1 }
  }
  if (action === 'prev') {
    if (currentIndex <= 0) {
      return { error: '已经是第一个地点' }
    }
    return { index: currentIndex - 1 }
  }
  if (request.index !== undefined && request.index !== null && request.index !== '') {
    const oneBased = Number(request.index)
    if (!Number.isInteger(oneBased) || oneBased < 1 || oneBased > stops.length) {
      return { error: `目标地点序号无效，可选范围为 1-${stops.length}` }
    }
    return { index: oneBased - 1 }
  }
  const query = typeof request.name === 'string' ? request.name.trim().toLowerCase() : ''
  if (query) {
    const exact = stops.findIndex(stop => stop.name.trim().toLowerCase() === query)
    if (exact !== -1) {
      return { index: exact }
    }
    const partial = stops.findIndex(
      stop =>
        stop.name.trim().toLowerCase().includes(query) ||
        query.includes(stop.name.trim().toLowerCase())
    )
    if (partial !== -1) {
      return { index: partial }
    }
    return {
      error: `未在当前飞行地点列表中找到「${typeof request.name === 'string' ? request.name.trim() : ''}」`
    }
  }
  return { error: '请指定切换方向（next/prev）、地点序号或地点名称' }
}

export interface TurnFlightGuard {
  turnToken: string
  flewInTurn: boolean
  userRequestedSwitch: boolean
}

export interface FlightGuardDecision {
  allow: boolean
  error?: string
  flightMode?: 'initial' | 'queue'
  markFlewOnSuccess?: boolean
  dispatchArgs: Record<string, unknown>
}

export function createTurnFlightGuard(turnToken: string, lastUserText: string): TurnFlightGuard {
  return {
    turnToken,
    flewInTurn: false,
    userRequestedSwitch: hasExplicitStopSwitchIntent(lastUserText)
  }
}

export function evaluateFlightToolGuard(
  guard: TurnFlightGuard,
  name: string,
  args: Record<string, unknown>
): FlightGuardDecision {
  if (name === 'switch_flight_stop') {
    if (guard.flewInTurn) {
      return {
        allow: false,
        error:
          '本轮已创建或定位飞行地点，默认停留在第 1 个地点；除非用户在后续聊天中明确要求，否则禁止切换地点',
        dispatchArgs: args
      }
    }
    if (!guard.userRequestedSwitch) {
      return {
        allow: false,
        error: '用户未在当前消息中明确要求切换飞行地点，请围绕当前地点解答，不要主动切换视角',
        dispatchArgs: args
      }
    }
    return { allow: true, dispatchArgs: args }
  }
  if (name === 'fly_to') {
    const parsed = parseFlyToArgs(args)
    if (parsed.error) {
      return { allow: true, dispatchArgs: args }
    }
    const flightMode = guard.flewInTurn ? 'queue' : 'initial'
    return {
      allow: true,
      flightMode,
      markFlewOnSuccess: true,
      dispatchArgs: {
        ...args,
        __turnToken: guard.turnToken,
        __flightMode: flightMode
      }
    }
  }
  return { allow: true, dispatchArgs: args }
}
