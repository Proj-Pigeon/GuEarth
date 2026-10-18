import { isAbsolute, relative, resolve, sep } from 'node:path'

export function resolveOffscreenEntry(directory: string, name: string): string | null {
  if (!name || name.includes('/') || name.includes('\\')) return null
  if (isAbsolute(name)) return null
  const base = resolve(directory)
  const candidate = resolve(base, name)
  const within = relative(base, candidate)
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return null
  return candidate
}
