import { readdir, stat, unlink } from 'fs/promises'
import { sep } from 'path'

interface TileFile {
  path: string
  size: number
  mtimeMs: number
}

export async function listTileFiles(directory: string): Promise<TileFile[]> {
  const files: TileFile[] = []
  const pending = [directory]
  while (pending.length) {
    const current = pending.pop()!
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..' || entry.name.includes('/') || entry.name.includes('\\')) continue
      const path = `${current}${sep}${entry.name}`
      if (entry.isDirectory()) {
        pending.push(path)
      } else if (entry.isFile() && /\.(bin|json)$/.test(entry.name)) {
        try {
          const info = await stat(path)
          files.push({ path, size: info.size, mtimeMs: info.mtimeMs })
        } catch {
          continue
        }
      }
    }
  }
  return files
}

export async function pruneTileFiles(directory: string, maxBytes: number): Promise<number> {
  const files = await listTileFiles(directory)
  let total = files.reduce((sum, file) => sum + file.size, 0)
  const tiles = new Map<string, TileFile[]>()
  for (const file of files) {
    const base = file.path.replace(/\.(bin|json)$/, '')
    const pair = tiles.get(base) ?? []
    pair.push(file)
    tiles.set(base, pair)
  }
  const oldestFirst = [...tiles.values()].sort((a, b) => Math.max(...a.map((file) => file.mtimeMs)) - Math.max(...b.map((file) => file.mtimeMs)))
  for (const pair of oldestFirst) {
    if (total <= maxBytes) break
    for (const file of pair) {
      try {
        await unlink(file.path)
        total -= file.size
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') total -= file.size
      }
    }
  }
  return total
}
