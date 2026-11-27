export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

export interface SearchThrottle {
  run: <T>(task: () => Promise<T>, isSuperseded?: () => boolean) => Promise<T | null>
}

export function createSearchThrottle(minIntervalMs: number): SearchThrottle {
  let tail: Promise<unknown> = Promise.resolve()
  let lastStartedAt = 0
  return {
    run: <T>(task: () => Promise<T>, isSuperseded?: () => boolean): Promise<T | null> => {
      const scheduled: Promise<T | null> = tail.then(async (): Promise<T | null> => {
        const wait = lastStartedAt + minIntervalMs - Date.now()
        if (wait > 0) {await delay(wait)}
        if (isSuperseded?.()) {return null}
        lastStartedAt = Date.now()
        return task()
      })
      tail = scheduled.catch(() => {})
      return scheduled
    }
  }
}

let latestPlacesRequestId = 0

export function beginPlacesRequest(): number {
  latestPlacesRequestId += 1
  return latestPlacesRequestId
}

export function isPlacesRequestSuperseded(requestId?: number): boolean {
  return requestId !== undefined && latestPlacesRequestId !== requestId
}
