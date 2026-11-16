export class ResponseTooLargeError extends Error {
  constructor(message = '响应内容过大') {
    super(message)
    this.name = 'ResponseTooLargeError'
  }
}

export async function readResponseText(
  response: Response,
  options: { maxBytes: number; controller: AbortController; tooLargeMessage: string }
): Promise<string> {
  const { maxBytes, controller, tooLargeMessage } = options
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        const error = new ResponseTooLargeError(tooLargeMessage)
        await reader.cancel(error).catch(() => {})
        controller.abort(error)
        throw error
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // reader may already be released or canceled
    }
  }
}
