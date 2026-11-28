import { net } from 'electron'

import type { AiSearchProviderConfig } from '../../../preload'
import { readProviderKey } from '../../keyVault'
import { searchBaiduWeb } from './baidu'
import type { SearchFetch, WebSearchResult } from './baidu'

type SearchAdapter = (
  query: string,
  apiKey: string,
  signal: AbortSignal,
  fetch: SearchFetch
) => Promise<WebSearchResult>

const searchAdapters: Record<AiSearchProviderConfig['kind'], SearchAdapter> = {
  baidu: searchBaiduWeb
}

export async function searchWeb(
  provider: AiSearchProviderConfig | undefined,
  input: unknown,
  signal: AbortSignal
): Promise<WebSearchResult> {
  const query = typeof input === 'string' ? input.trim().slice(0, 500) : ''
  if (signal.aborted) {
    return { query, error: '搜索已取消' }
  }
  if (!query) {
    return { query, error: '缺少搜索关键词' }
  }
  if (!provider) {
    return { query, error: '请在「AI 设置 → 搜索供应商」中选择搜索供应商' }
  }
  const adapter = searchAdapters[provider.kind]
  if (!adapter) {
    return { query, error: '不支持的搜索供应商' }
  }
  const apiKey = readProviderKey(`ai-search-${provider.id}`)
  if (!apiKey) {
    return {
      query,
      error: `未配置「${provider.name}」的 AppBuilder API Key，请在「AI 设置 → 搜索供应商」中保存`
    }
  }
  return adapter(query, apiKey, signal, (url, init) => net.fetch(url, init))
}
