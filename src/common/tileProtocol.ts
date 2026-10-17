export const TILE_FAILURE_STATUS = 502

export function tileFailureResponse(): Response {
  return new Response('Tile unavailable', { status: TILE_FAILURE_STATUS })
}

export async function serveTileResponse(load: () => Promise<Response> | Response, onFailure?: (error: unknown) => void): Promise<Response> {
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
