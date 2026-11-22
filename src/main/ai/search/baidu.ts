import type { AiSearchReference } from '../../../preload'

export type WebSearchResult =
  | { query: string; references: AiSearchReference[]; error?: never }
  | { query: string; error: string; references?: never }
export type SearchFetch = (url: string, init: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function referenceFrom(value: unknown): AiSearchReference | null {
  if (!isRecord(value) || (value.type !== undefined && value.type !== 'web')) return null
  if (typeof value.url !== 'string' || value.url.length > 2048) return null
  try {
    const url = new URL(value.url)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    const title = text(value.title, 300)
    if (!title) return null
    return {
      title,
      url: url.href,
      content: text(value.content, 1600),
      website: text(value.website, 160) || url.hostname,
      date: text(value.date, 40)
    }
  } catch {
    return null
  }
}

function providerError(body: unknown, apiKey: string): string {
  if (
    !isRecord(body) ||
    body.code === undefined ||
    body.code === null ||
    body.code === 0 ||
    body.code === '0'
  )
    return ''
  const code =
    typeof body.code === 'number' || typeof body.code === 'string' ? String(body.code) : ''
  const message = typeof body.message === 'string' ? body.message : '未知错误'
  return `百度千帆搜索失败：${message}${code ? ` (${code})` : ''}`
    .replaceAll(apiKey, '[已隐藏]')
    .slice(0, 400)
}

export async function searchBaiduWeb(
  query: string,
  apiKey: string,
  signal: AbortSignal,
  fetch: SearchFetch
): Promise<WebSearchResult> {
  const timeout = AbortSignal.timeout(15_000)
  const requestSignal = AbortSignal.any([signal, timeout])
  try {
    requestSignal.throwIfAborted()
    const response = await fetch('https://qianfan.baidubce.com/v2/ai_search/web_search', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        edition: 'standard',
        search_source: 'baidu_search_v2',
        resource_type_filter: [{ type: 'web', top_k: 10 }]
      }),
      signal: requestSignal
    })
    const body: unknown = await response.json().catch(() => null)
    requestSignal.throwIfAborted()
    const error = providerError(body, apiKey)
    if (error) return { query, error }
    if (!response.ok) return { query, error: `百度千帆搜索请求失败 (HTTP ${response.status})` }
    if (!isRecord(body) || !Array.isArray(body.references))
      return { query, error: '百度千帆返回了无效搜索数据' }
    const references: AiSearchReference[] = []
    const urls = new Set<string>()
    for (const value of body.references) {
      const reference = referenceFrom(value)
      if (!reference || urls.has(reference.url)) continue
      if (JSON.stringify({ query, references: [...references, reference] }).length > 24_000) break
      references.push(reference)
      urls.add(reference.url)
      if (references.length === 10) break
    }
    return { query, references }
  } catch {
    if (signal.aborted) return { query, error: '搜索已取消' }
    if (timeout.aborted) return { query, error: '百度千帆搜索超时，请稍后重试' }
    return { query, error: '百度千帆搜索网络请求失败，请稍后重试' }
  }
}
