import { isAbsolute, join, normalize, relative } from 'path'

function sanitizeStorageRoot(value: string): string {
  if (!isAbsolute(value) || value.includes('\0')) throw new Error('Invalid storage directory')
  return normalize(value)
}

function sanitizeStorageSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(value) || value.length > 255) {
    throw new Error('Invalid storage path segment')
  }
  return value
}

export function storageChildPath(directory: string, ...segments: string[]): string {
  if (!segments.length) throw new Error('Missing storage path segment')
  const root = sanitizeStorageRoot(directory)
  let result = root
  for (const segment of segments) result = join(result, sanitizeStorageSegment(segment))
  const child = relative(root, result)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Storage path escapes its directory')
  return result
}
