export type NetworkProxyMode = 'system' | 'direct' | 'custom'

const PROXY_URL_PATTERN = /^(https?|socks[45]):\/\/[^\s]+$/
const HOST_PORT_PATTERN = /^[a-zA-Z0-9.-]+:\d{1,5}$/

export function normalizeNetworkProxy(value: unknown): string {
  if (typeof value !== 'string') {return ''}
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'direct') {return trimmed}
  if (trimmed.length > 200) {return ''}
  if (PROXY_URL_PATTERN.test(trimmed)) {return trimmed}
  if (HOST_PORT_PATTERN.test(trimmed)) {return `http://${trimmed}`}
  return ''
}

export function networkProxyMode(value: string): NetworkProxyMode {
  if (value === '') {return 'system'}
  if (value === 'direct') {return 'direct'}
  return 'custom'
}
