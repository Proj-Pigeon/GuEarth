const REQUEST_ERROR_KEYS = ['response', 'responseHeaders', 'statusCode']

export interface RequestErrorShape {
  statusCode?: number
}

export function isRequestErrorShape(reason: unknown): reason is RequestErrorShape {
  if (!reason || typeof reason !== 'object' || reason instanceof Error || Array.isArray(reason)) return false
  const keys = Object.keys(reason)
  if (keys.length !== REQUEST_ERROR_KEYS.length) return false
  return REQUEST_ERROR_KEYS.every((key) => keys.includes(key))
}

export function describeRequestError(reason: RequestErrorShape): string {
  const statusCode = reason.statusCode
  return typeof statusCode === 'number' && Number.isFinite(statusCode)
    ? `地图资源请求失败（HTTP ${statusCode}）`
    : '地图资源请求失败（网络中断或请求被拒绝）'
}

export function describeResourceFailure(reason: unknown): string | null {
  return isRequestErrorShape(reason) ? describeRequestError(reason) : null
}

export function requestErrorRejectionLabel(): string {
  return `Object captured as promise rejection with keys: ${[...REQUEST_ERROR_KEYS].sort().join(', ')}`
}
