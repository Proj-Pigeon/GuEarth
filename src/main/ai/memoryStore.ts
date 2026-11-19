import { randomUUID } from 'node:crypto'
import { readJson, serialQueue, writeJson } from '../jsonStore'
import type { AgentMemory } from '../../preload'
import type { EoqHawdbClient } from './hawdb/client'
import type { MemoryRecallMatch } from './hawdb/protocol'
import { extractQueryTerms, normalizeLookupText } from './hawdb/graphBuilder'

export const MAX_MEMORIES = 100
export const MAX_MEMORY_CONTENT_LENGTH = 300
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeMemory(value: unknown): AgentMemory | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const content = typeof value.content === 'string' ? value.content.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH) : ''
  if (!ID_PATTERN.test(id) || !content) return null
  return {
    id,
    content,
    source: value.source === 'agent' ? 'agent' : 'user',
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? Math.round(value.createdAt) : Date.now()
  }
}

export class AiMemoryStore {
  private path = ''
  private memories: AgentMemory[] = []
  private hawdb: EoqHawdbClient | null = null

  private enqueue = serialQueue()

  async init(path: string): Promise<void> {
    this.path = path
    this.hawdb = null
    this.memories = await this.read()
  }

  attachHawdb(client: EoqHawdbClient, initialMemories: AgentMemory[]): void {
    this.hawdb = client
    this.memories = [...initialMemories]
  }

  private async read(): Promise<AgentMemory[]> {
    try {
      const parsed: unknown = await readJson(this.path)
      const list = Array.isArray(parsed) ? parsed.map(normalizeMemory) : []
      const seen = new Set<string>()
      const memories: AgentMemory[] = []
      for (const memory of list) {
        if (!memory || seen.has(memory.id)) continue
        seen.add(memory.id)
        memories.push(memory)
      }
      return memories.slice(0, MAX_MEMORIES)
    } catch {
      return []
    }
  }

  list(): AgentMemory[] {
    return this.memories
  }

  add(content: string, source: AgentMemory['source']): Promise<AgentMemory> {
    return this.enqueue(async () => {
      if (this.hawdb?.isReady()) {
        const memory = await this.hawdb.addMemory(content, source)
        this.memories = [...this.memories, memory]
        return memory
      }
      const trimmed = typeof content === 'string' ? content.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH) : ''
      if (!trimmed) throw new Error('记忆内容不能为空')
      if (this.memories.length >= MAX_MEMORIES) throw new Error(`记忆已达上限（${MAX_MEMORIES} 条），请先删除部分记忆`)
      const memory: AgentMemory = {
        id: `m${randomUUID()}`,
        content: trimmed,
        source,
        createdAt: Date.now()
      }
      const next = [...this.memories, memory]
      await writeJson(this.path, next)
      this.memories = next
      return memory
    })
  }

  delete(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.hawdb?.isReady()) {
        const deleted = await this.hawdb.deleteMemory(id)
        if (deleted) this.memories = this.memories.filter((memory) => memory.id !== id)
        return deleted
      }
      const next = this.memories.filter((memory) => memory.id !== id)
      if (next.length === this.memories.length) return false
      await writeJson(this.path, next)
      this.memories = next
      return true
    })
  }

  async recall(query: string, limit = 8): Promise<MemoryRecallMatch[]> {
    const clean = typeof query === 'string' ? query.trim() : ''
    if (!clean) return []
    if (this.hawdb?.isReady()) {
      return this.hawdb.recallMemories(clean, limit)
    }
    const terms = extractQueryTerms(clean)
    return this.memories
      .map((memory) => {
        const normalized = normalizeLookupText(memory.content)
        const score = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0)
        return { ...memory, score }
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.createdAt - left.createdAt)
      .slice(0, Math.min(20, Math.max(1, Math.round(limit))))
  }
}
