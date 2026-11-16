export function ipcErrorMessage(value: unknown, fallback = '未知错误'): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  const message = raw.replace(/^Error invoking remote method '[^']+':?\s*(Error:\s*)?/i, '').trim()
  return message || fallback
}
