export const TILE_FAILURE_STATUS = 502

export const TILE_FETCH_TIMEOUT_MS = 8000

export const TILE_FETCH_ATTEMPTS = 3

export const TILE_RETRY_BASE_DELAY_MS = 250

export interface FetchedTilePayload {
  ok: boolean
  status: number
  headers: Headers
  data?: ArrayBuffer
}

export interface TileRetryOptions {
  attempts?: number
  timeoutMs?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function isRetryableTileStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export function tileRetryDelayMs(attempt: number, baseDelayMs = TILE_RETRY_BASE_DELAY_MS): number {
  return baseDelayMs * 2 ** attempt
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function normalizeRetryAttempts(attempts: number | undefined): number {
  if (attempts === undefined || !Number.isFinite(attempts)) {
    return TILE_FETCH_ATTEMPTS
  }
  return Math.max(1, Math.trunc(attempts))
}

export async function fetchTilePayloadWithRetry(
  fetcher: (signal: AbortSignal) => Promise<Response>,
  options: TileRetryOptions = {}
): Promise<FetchedTilePayload> {
  const attempts = normalizeRetryAttempts(options.attempts)
  const timeoutMs = options.timeoutMs ?? TILE_FETCH_TIMEOUT_MS
  const baseDelayMs = options.baseDelayMs ?? TILE_RETRY_BASE_DELAY_MS
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(AbortSignal.timeout(timeoutMs))
      if (response.ok) {
        const data = await response.arrayBuffer()
        return { ok: true, status: response.status, headers: response.headers, data }
      }
      void response.body?.cancel().catch(() => {})
      if (!isRetryableTileStatus(response.status) || attempt === attempts - 1) {
        return { ok: false, status: response.status, headers: response.headers }
      }
      await sleep(tileRetryDelayMs(attempt, baseDelayMs))
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await sleep(tileRetryDelayMs(attempt, baseDelayMs))
      }
    }
  }
  throw lastError
}

export function sanitizeTileUrlForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl
  }
}

export function describeTileFetchError(error: unknown): string {
  if (error instanceof Error) {
    const base = error.message ? `${error.name}: ${error.message}` : error.name
    const cause = (error as Error & { cause?: unknown }).cause
    if (cause instanceof Error && cause.message) {
      return `${base} (${cause.name}: ${cause.message})`
    }
    if (typeof cause === 'string' && cause.trim()) {
      return `${base} (${cause.trim()})`
    }
    return base
  }
  return String(error)
}

export function tileFailureResponse(): Response {
  return new Response('Tile unavailable', { status: TILE_FAILURE_STATUS })
}

export async function serveTileResponse(
  load: () => Promise<Response> | Response,
  onFailure?: (error: unknown) => void
): Promise<Response> {
  try {
    return await load()
  } catch (error) {
    try {
      onFailure?.(error)
    } catch {
      void 0
    }
    return tileFailureResponse()
  }
}
