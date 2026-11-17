export interface TileAvailabilitySource {
  getTileDataAvailable: (x: number, y: number, level: number) => boolean | undefined
}

interface AvailabilityFlagged {
  _hasAvailability?: boolean
}

const availabilityStripped = new WeakSet<object>()

export function withoutTileAvailability<Terrain extends TileAvailabilitySource>(terrain: Terrain): Terrain {
  availabilityStripped.add(terrain)
  const flagged = terrain as Terrain & AvailabilityFlagged
  flagged._hasAvailability = false
  flagged.getTileDataAvailable = () => undefined
  return terrain
}

export function isAvailabilityStripped(terrain: object): boolean {
  return availabilityStripped.has(terrain)
}

export interface FallbackTerrainProvider<TileData = unknown, Request = unknown> {
  requestTileGeometry: (
    x: number,
    y: number,
    level: number,
    request?: Request
  ) => Promise<TileData> | undefined
  getTileDataAvailable: (x: number, y: number, level: number) => boolean | undefined
}

export function attachOriginTerrainFallback<
  TileData,
  Request,
  Terrain extends FallbackTerrainProvider<TileData, Request>
>(
  mirrorProvider: Terrain,
  createOrigin: () => Promise<Terrain>,
  failureThreshold = 2
): Terrain {
  const mirrorRequestTileGeometry = mirrorProvider.requestTileGeometry.bind(mirrorProvider)
  const mirrorGetTileDataAvailable = mirrorProvider.getTileDataAvailable.bind(mirrorProvider)
  let consecutiveFailures = 0
  let fallenBackToOrigin = false
  let originPromise: Promise<Terrain> | undefined
  let resolvedOrigin: Terrain | undefined

  const getOriginProvider = (): Promise<Terrain> => {
    if (resolvedOrigin) return Promise.resolve(resolvedOrigin)
    if (!originPromise) {
      originPromise = createOrigin().then(
        (origin) => {
          resolvedOrigin = origin
          return origin
        },
        (error) => {
          originPromise = undefined
          throw error
        }
      )
    }
    return originPromise
  }

  mirrorProvider.requestTileGeometry = (x: number, y: number, level: number, request?: Request) => {
    if (fallenBackToOrigin) {
      if (resolvedOrigin) return resolvedOrigin.requestTileGeometry(x, y, level, request)
      return getOriginProvider().then((origin) => {
        const fallbackAttempt = origin.requestTileGeometry(x, y, level, request)
        if (!fallbackAttempt) return Promise.reject(new Error('Origin terrain tile request deferred'))
        return fallbackAttempt
      })
    }
    const attempt = mirrorRequestTileGeometry(x, y, level, request)
    if (!attempt) return attempt
    return attempt.then(
      (tile) => {
        consecutiveFailures = 0
        return tile
      },
      async (error) => {
        consecutiveFailures += 1
        if (consecutiveFailures >= failureThreshold) fallenBackToOrigin = true
        const origin = await getOriginProvider()
        const fallbackAttempt = origin.requestTileGeometry(x, y, level, request)
        if (!fallbackAttempt) throw error
        return fallbackAttempt
      }
    )
  }

  mirrorProvider.getTileDataAvailable = (x: number, y: number, level: number) => {
    if (fallenBackToOrigin && resolvedOrigin) {
      return resolvedOrigin.getTileDataAvailable(x, y, level)
    }
    return mirrorGetTileDataAvailable(x, y, level)
  }

  return mirrorProvider
}
