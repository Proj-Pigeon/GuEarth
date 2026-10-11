import { readJson, serialQueue, writeJson } from '../jsonStore'
import type { AgentMemory } from '../../preload'

const MAX_MEMORIES = 100
const MAX_CONTENT_LENGTH = 300
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeMemory(value: unknown): AgentMemory | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const content = typeof value.content === 'string' ? value.content.trim().slice(0, MAX_CONTENT_LENGTH) : ''
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

  private enqueue = serialQueue()

  async init(path: string): Promise<void> {
    this.path = path
    this.memories = await this.read()
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
      const trimmed = typeof content === 'string' ? content.trim().slice(0, MAX_CONTENT_LENGTH) : ''
      if (!trimmed) throw new Error('记忆内容不能为空')
      if (this.memories.length >= MAX_MEMORIES) throw new Error(`记忆已达上限（${MAX_MEMORIES} 条），请先删除部分记忆`)
      const memory: AgentMemory = {
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
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
      const next = this.memories.filter((memory) => memory.id !== id)
      if (next.length === this.memories.length) return false
      await writeJson(this.path, next)
      this.memories = next
      return true
    })
  }
}
