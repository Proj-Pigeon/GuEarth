import { net } from 'electron'
import type {
  AiModelImportRequest,
  AiModelImportResult,
  AiModelImportRow,
  AiProtocol,
  AiProviderConfig
} from '../../preload'
import { DEFAULT_MIRROR_ENDPOINT, mirrorModelsDevUrl } from '../../common/tileMirror';
import type { MirrorEndpointId } from '../../common/tileMirror';
import { readProviderKey } from '../keyVault'
import { readResponseText, ResponseTooLargeError } from './responseReader'

const MODELS_DEV_URL = 'https://models.dev/api.json'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_PROVIDER_MODELS = 2000
const MAX_ANTHROPIC_PAGES = 100
const modelsDevCache: { expiresAt: number; value: Record<string, unknown> | null } = { expiresAt: 0, value: null }
let modelsDevMirrorEndpoint: MirrorEndpointId | null = null

export function setModelsDevMirrorEndpoint(endpoint: MirrorEndpointId | null): void {
  modelsDevMirrorEndpoint = endpoint
}

export function setModelsDevMirrorEnabled(enabled: boolean): void {
  modelsDevMirrorEndpoint = enabled ? DEFAULT_MIRROR_ENDPOINT : null
}

interface ProviderMetadata {
  id: string
  name: string
  api?: string
  models: Record<string, ModelMetadata>
}

interface ModelMetadata {
  id?: unknown
  name?: unknown
  canonical_model_id?: unknown
  reasoning?: unknown
  reasoning_options?: unknown
  limit?: unknown
  modalities?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
}

function safeUrl(value: string): URL {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol)) {throw new Error('接口地址必须使用 HTTP 或 HTTPS')}
  return url
}

function endpoint(baseUrl: string, protocol: AiProtocol): string {
  const base = safeUrl(baseUrl)
  const path = base.pathname.replace(/\/+$/, '')
  if (protocol === 'anthropic') {
    if (!path || path === '/') {base.pathname = '/v1/models'}
    else {base.pathname = `${path}/models`}
  } else {
    if (!path || path === '/') {base.pathname = '/v1/models'}
    else {base.pathname = `${path}/models`}
  }
  base.search = ''
  base.hash = ''
  return base.toString()
}

async function fetchText(url: string, init: RequestInit): Promise<string> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  try {
    const response = await net.fetch(url, { ...init, signal: controller.signal })
    const body = await readResponseText(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      controller,
      tooLargeMessage: '模型列表响应过大'
    })
    if (!response.ok) {throw new Error(`模型列表请求失败（HTTP ${response.status}）`)}
    return body
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw error
    if (timedOut || controller.signal.aborted) throw new Error('模型列表请求超时', { cause: error })
    throw error instanceof Error ? error : new Error('模型列表请求失败')
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(body: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body)
    if (!isRecord(value)) {throw new Error('响应格式错误')}
    return value
  } catch (error) {
    if (error instanceof Error && error.message === '响应格式错误') throw error
    throw new Error('模型列表响应不是有效 JSON', { cause: error })
  }
}

function modelIds(payload: Record<string, unknown>): string[] {
  if (!Array.isArray(payload.data)) {throw new Error('模型列表响应缺少 data 数组')}
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== 'string') {continue}
    const id = item.id.trim().slice(0, 200)
    if (!id || seen.has(id)) {continue}
    seen.add(id)
    ids.push(id)
    if (ids.length >= MAX_PROVIDER_MODELS) {break}
  }
  return ids
}

async function fetchProviderIds(provider: AiProviderConfig, apiKey: string): Promise<string[]> {
  const headers = provider.protocol === 'anthropic'
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${apiKey}` }
  const url = endpoint(provider.baseUrl, provider.protocol)
  if (provider.protocol === 'openai') {return modelIds(parseJson(await fetchText(url, { headers })))}
  const ids: string[] = []
  const seen = new Set<string>()
  const seenCursors = new Set<string>()
  let next = url
  for (let page = 0; page < MAX_ANTHROPIC_PAGES && next; page += 1) {
    const payload = parseJson(await fetchText(next, { headers }))
    for (const id of modelIds(payload)) {
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    if (payload.has_more !== true) {return ids}
    if (typeof payload.last_id !== 'string' || !payload.last_id) {throw new Error('Anthropic 模型列表缺少下一页游标')}
    if (seenCursors.has(payload.last_id)) {throw new Error('Anthropic 模型列表分页游标未推进')}
    seenCursors.add(payload.last_id)
    if (page + 1 >= MAX_ANTHROPIC_PAGES) {throw new Error('Anthropic 模型列表页数超出上限')}
    const pageUrl = new URL(url)
    pageUrl.searchParams.set('limit', '1000')
    pageUrl.searchParams.set('after_id', payload.last_id)
    next = pageUrl.toString()
  }
  return ids
}

async function modelsDev(): Promise<Record<string, unknown>> {
  if (modelsDevCache.value && modelsDevCache.expiresAt > Date.now()) {return modelsDevCache.value}
  let payload: Record<string, unknown>
  if (modelsDevMirrorEndpoint) {
    try {
      payload = parseJson(await fetchText(mirrorModelsDevUrl(modelsDevMirrorEndpoint), {}))
    } catch {
      payload = parseJson(await fetchText(MODELS_DEV_URL, {}))
    }
  } else {
    payload = parseJson(await fetchText(MODELS_DEV_URL, {}))
  }
  modelsDevCache.value = payload
  modelsDevCache.expiresAt = Date.now() + 10 * 60_000
  return payload
}

function providersFromCatalog(payload: Record<string, unknown>): ProviderMetadata[] {
  return Object.entries(payload).flatMap(([id, value]): ProviderMetadata[] => {
    if (!isRecord(value) || !isRecord(value.models)) {return []}
    const models = Object.fromEntries(Object.entries(value.models).flatMap(([modelId, model]) => {
      if (!isRecord(model)) {return []}
      return [[modelId, model]]
    }))
    return [{ id, name: typeof value.name === 'string' ? value.name : id, api: typeof value.api === 'string' ? value.api : undefined, models }]
  })
}

function providerCandidates(provider: AiProviderConfig, catalogs: ProviderMetadata[]): ProviderMetadata[] {
  const providerTokens = new Set([normalized(provider.id), normalized(provider.name)])
  let host = ''
  try { host = safeUrl(provider.baseUrl).hostname.toLowerCase() } catch { return [] }
  const matches = catalogs.filter((catalog) => {
    if (providerTokens.has(normalized(catalog.id)) || providerTokens.has(normalized(catalog.name))) {return true}
    if (!catalog.api) {return false}
    try { return new URL(catalog.api).hostname.toLowerCase() === host } catch { return false }
  })
  return matches
}

function effortLevel(options: unknown): { thinking: boolean; thinkingLevel: 'low' | 'medium' | 'high'; note?: string } {
  if (!Array.isArray(options)) {return { thinking: false, thinkingLevel: 'medium' }}
  const effort = options.find((item): item is { type: string; values?: unknown[] } => isRecord(item) && item.type === 'effort')
  if (!effort || !Array.isArray(effort.values)) {
    return { thinking: false, thinkingLevel: 'medium', note: '元数据仅声明开关或预算控制，当前协议未自动启用思考参数' }
  }
  const values = effort.values.filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase())
  const rank: Record<string, number> = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 }
  const supported = values.filter((value) => value !== 'none' && value !== 'default' && value in rank)
  if (supported.length === 0) {return { thinking: false, thinkingLevel: 'medium', note: '元数据没有可用的思考等级' }}
  const selected = supported.includes('high') ? 'high' : supported.reduce((best, value) => rank[value] > rank[best] ? value : best, supported[0])
  return { thinking: true, thinkingLevel: selected === 'low' || selected === 'minimal' ? 'low' : selected === 'medium' ? 'medium' : 'high' }
}

interface MetadataMatch {
  metadata?: ModelMetadata
  note?: string
  conflict?: boolean
  candidates?: CatalogMatch[]
}

interface CatalogMatch {
  catalog: ProviderMetadata
  metadata: ModelMetadata
}

function metadataSignature(metadata: ModelMetadata): string {
  const limit = isRecord(metadata.limit) && typeof metadata.limit.context === 'number' ? metadata.limit.context : 128_000
  const modalities = isRecord(metadata.modalities) && Array.isArray(metadata.modalities.input) ? metadata.modalities.input : []
  const effort = effortLevel(metadata.reasoning_options)
  return JSON.stringify({
    name: typeof metadata.name === 'string' ? metadata.name.trim() : '',
    context: Math.min(2_000_000, Math.max(4096, Math.round(limit))),
    vision: modalities.includes('image'),
    thinking: metadata.reasoning === true && effort.thinking,
    level: effort.thinkingLevel
  })
}

function resolveAmbiguous(matches: CatalogMatch[]): CatalogMatch | null {
  const labs = new Set(matches.flatMap((match) => typeof match.metadata.canonical_model_id === 'string' && match.metadata.canonical_model_id
    ? [match.metadata.canonical_model_id.split('/')[0].toLowerCase()]
    : []))
  if (labs.size > 1) {return null}
  if (labs.size === 1) {
    const lab = [...labs][0]
    const official = matches.find((match) => normalized(match.catalog.id) === normalized(lab))
    if (official) {return official}
  }
  const signatures = new Set(matches.map((match) => metadataSignature(match.metadata)))
  return signatures.size === 1 ? matches[0] : null
}

function candidateScore(match: CatalogMatch): [number, number, number, number] {
  const metadata = match.metadata
  const context = isRecord(metadata.limit) && typeof metadata.limit.context === 'number' ? metadata.limit.context : 128_000
  const modalities = isRecord(metadata.modalities) && Array.isArray(metadata.modalities.input) ? metadata.modalities.input : []
  const options = Array.isArray(metadata.reasoning_options) ? metadata.reasoning_options : []
  const effort = options.find((item) => isRecord(item) && item.type === 'effort')
  const effortCount = isRecord(effort) && Array.isArray(effort.values) ? effort.values.length : 0
  return [context, modalities.includes('image') ? 1 : 0, metadata.reasoning === true ? 1 : 0, effortCount]
}

function bestEffortMatch(result: MetadataMatch): MetadataMatch {
  if (!result.candidates?.length) {return result}
  const labs = new Set(result.candidates.flatMap((match) => typeof match.metadata.canonical_model_id === 'string' && match.metadata.canonical_model_id
    ? [match.metadata.canonical_model_id.split('/')[0].toLowerCase()]
    : []))
  if (labs.size > 1) {return result}
  const candidate = [...result.candidates].sort((a, b) => {
    const left = candidateScore(a)
    const right = candidateScore(b)
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {return right[index] - left[index]}
    }
    return 0
  })[0]
  return { metadata: candidate.metadata }
}

function matchMetadata(id: string, provider: AiProviderConfig, catalogs: ProviderMetadata[]): MetadataMatch {
  const candidates = providerCandidates(provider, catalogs)
  const direct = candidates.flatMap((catalog) => catalog.models[id] ? [{ catalog, metadata: catalog.models[id] }] : [])
  if (direct.length === 1) {return direct[0]}
  if (direct.length > 1) {
    const resolved = resolveAmbiguous(direct)
    return resolved ?? { note: '多个供应商元数据均匹配，无法安全确定来源', conflict: true, candidates: direct }
  }
  const global = catalogs.flatMap((catalog) => catalog.models[id] ? [{ catalog, metadata: catalog.models[id] }] : [])
  if (global.length === 1) {return global[0]}
  if (global.length > 1) {
    const resolved = resolveAmbiguous(global)
    return resolved ?? { note: '多个供应商元数据均匹配，无法安全确定来源', conflict: true, candidates: global }
  }
  const canonical = catalogs.flatMap((catalog) => Object.values(catalog.models).flatMap((metadata) => {
    if (typeof metadata.canonical_model_id === 'string' && normalized(metadata.canonical_model_id) === normalized(`${catalog.id}/${id}`)) {return [{ catalog, metadata }]}
    return []
  }))
  if (canonical.length === 1) {return canonical[0]}
  if (canonical.length > 1) {
    const resolved = resolveAmbiguous(canonical)
    return resolved ?? { note: '多个供应商元数据均匹配，无法安全确定来源', conflict: true, candidates: canonical }
  }
  return { note: 'models.dev 中没有精确匹配的元数据' }
}

function metadataFor(id: string, provider: AiProviderConfig, catalogs: ProviderMetadata[], modelGroupCompat: boolean): MetadataMatch {
  const direct = matchMetadata(id, provider, catalogs)
  if (direct.metadata) {return direct}
  if (direct.conflict) {return modelGroupCompat ? bestEffortMatch(direct) : direct}
  if (!modelGroupCompat) {return direct}
  const slash = id.indexOf('/')
  if (slash === -1) {return direct}
  const grouped = id.slice(slash + 1).trim()
  if (!grouped) {return direct}
  const result = matchMetadata(grouped, provider, catalogs)
  if (result.metadata) {return result}
  if (result.conflict) {return bestEffortMatch(result)}
  return { note: result.note ? `模型组兼容：${result.note}` : '模型组兼容未找到匹配' }
}

function toRow(id: string, metadata: ModelMetadata | undefined, note: string | undefined, provider: AiProviderConfig): AiModelImportRow {
  const limit = isRecord(metadata?.limit) && typeof metadata.limit.context === 'number' ? metadata.limit.context : 128_000
  const modalities = isRecord(metadata?.modalities) && Array.isArray(metadata.modalities.input) ? metadata.modalities.input : []
  const reasoning = metadata?.reasoning === true
  const effort = effortLevel(metadata?.reasoning_options)
  const warnings = [note, reasoning && effort.note].filter((value): value is string => Boolean(value))
  return {
    id,
    label: typeof metadata?.name === 'string' && metadata.name.trim() ? metadata.name.trim().slice(0, 80) : id,
    contextWindow: Math.min(2_000_000, Math.max(4096, Math.round(limit))),
    streaming: true,
    vision: modalities.includes('image'),
    thinking: reasoning && (provider.protocol === 'anthropic' || !effort.note) ? effort.thinking : false,
    thinkingLevel: effort.thinkingLevel,
    enabled: true,
    matched: Boolean(metadata),
    failureReason: warnings.join('；') || undefined,
    existing: provider.models.some((model) => model.id === id)
  }
}

function validateRequest(value: unknown): AiModelImportRequest {
  if (!isRecord(value)) {throw new Error('无效的模型导入请求')}
  if (!['openai', 'anthropic'].includes(value.protocol as string)) {throw new Error('该协议不支持自动导入模型')}
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : ''
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || !name || !baseUrl) {throw new Error('供应商信息不完整')}
  safeUrl(baseUrl)
  const ids = Array.isArray(value.ids)
    ? [...new Set(value.ids.flatMap((item): string[] => typeof item === 'string' && item.trim() ? [item.trim().slice(0, 200)] : []))].slice(0, MAX_PROVIDER_MODELS)
    : undefined
  return {
    id,
    name: name.slice(0, 80),
    protocol: value.protocol as AiProtocol,
    baseUrl: baseUrl.slice(0, 500),
    models: Array.isArray(value.models) ? value.models : [],
    modelGroupCompat: value.modelGroupCompat === true,
    ...(ids ? { ids } : {})
  }
}

export async function importModels(value: unknown): Promise<AiModelImportResult> {
  const request = validateRequest(value)
  const provider: AiProviderConfig = {
    id: request.id,
    name: request.name,
    protocol: request.protocol,
    baseUrl: request.baseUrl,
    models: request.models
  }
  const idsPromise = request.ids === undefined
    ? (() => {
        const apiKey = readProviderKey(`ai-${provider.id}`)
        if (!apiKey) return Promise.reject(new Error(`未配置「${provider.name}」的 API Key，请先保存 API Key`))
        return fetchProviderIds(provider, apiKey)
      })()
    : Promise.resolve(request.ids)
  const [ids, catalog] = await Promise.all([idsPromise, modelsDev()])
  const catalogs = providersFromCatalog(catalog)
  const rows = ids.map((id) => {
    const result = metadataFor(id, provider, catalogs, request.modelGroupCompat === true)
    return toRow(id, result.metadata, result.note, provider)
  })
  return { models: rows, source: MODELS_DEV_URL }
}

export const modelImporterInternals = { endpoint, effortLevel, providersFromCatalog, matchMetadata, metadataFor, toRow, setModelsDevMirrorEnabled, setModelsDevMirrorEndpoint }
