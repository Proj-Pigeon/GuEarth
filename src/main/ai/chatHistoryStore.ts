import { copyFile, mkdir, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { storageChildPath } from '../storagePath'
import { readJson, serialQueue, writeJson } from '../jsonStore'
import type { AiSearchReference, StoredAiCompression, StoredAiConversation, StoredAiConversationSummary, StoredAiMessage, StoredAiPart, StoredAiToolStep } from '../../preload'

const MAX_CONVERSATIONS = 50
const MAX_MESSAGES = 400
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function clampTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function normalizeReferences(value: unknown): AiSearchReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): AiSearchReference[] => {
    if (!isRecord(item)) return []
    const title = clampString(item.title, 300)
    const url = clampString(item.url, 2000)
    if (!title && !url) return []
    return [{
      title,
      url,
      content: clampString(item.content, 1000),
      website: clampString(item.website, 200),
      date: clampString(item.date, 40)
    }]
  }).slice(0, 16)
}

function normalizeToolStep(value: unknown): StoredAiToolStep | null {
  if (!isRecord(value)) return null
  const callId = clampString(value.callId, 128)
  const name = clampString(value.name, 64)
  if (!callId || !name) return null
  const status: StoredAiToolStep['status'] = value.status === 'error' ? 'error' : 'ok'
  return {
    callId,
    name,
    args: isRecord(value.args) ? value.args : {},
    status,
    summary: clampString(value.summary, 400),
    result: clampString(value.result, 10_000),
    references: normalizeReferences(value.references)
  }
}

function normalizePart(value: unknown): StoredAiPart | null {
  if (!isRecord(value)) return null
  if (value.kind === 'reasoning') {
    const id = clampString(value.id, 128)
    if (!id) return null
    return { kind: 'reasoning', id, text: clampString(value.text, 100_000), ms: clampTimestamp(value.ms, 0), startedAt: clampTimestamp(value.startedAt, 0) }
  }
  if (value.kind === 'text') return { kind: 'text', text: clampString(value.text, 100_000) }
  if (value.kind === 'tool') {
    const step = normalizeToolStep(value.step)
    return step ? { kind: 'tool', step } : null
  }
  return null
}

function normalizeMessage(value: unknown): StoredAiMessage | null {
  if (!isRecord(value)) return null
  const id = clampString(value.id, 128)
  if (!id) return null
  const role = value.role === 'user' ? 'user' : value.role === 'assistant' ? 'assistant' : null
  if (!role) return null
  const parts = Array.isArray(value.parts)
    ? value.parts.map(normalizePart).filter((part): part is StoredAiPart => part !== null).slice(0, 200)
    : []
  return {
    id,
    role,
    content: clampString(value.content, 50_000),
    parts,
    status: value.status === 'error' ? 'error' : 'done',
    error: clampString(value.error, 1000)
  }
}

function normalizeCompression(value: unknown): StoredAiCompression | undefined {
  if (!isRecord(value)) return undefined
  const summary = clampString(value.summary, 100_000)
  const coveredMessageIds = Array.isArray(value.coveredMessageIds)
    ? value.coveredMessageIds.filter((id): id is string => typeof id === 'string' && id.length > 0).map((id) => id.slice(0, 128)).slice(0, MAX_MESSAGES)
    : []
  if (!summary || !coveredMessageIds.length) return undefined
  return { summary, coveredMessageIds }
}

export function normalizeConversation(value: unknown): StoredAiConversation | null {
  if (!isRecord(value)) return null
  const id = clampString(value.id, 64)
  if (!ID_PATTERN.test(id)) return null
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((message): message is StoredAiMessage => message !== null).slice(-MAX_MESSAGES)
    : []
  if (!messages.some((message) => message.role === 'user')) return null
  const updatedAt = clampTimestamp(value.updatedAt, Date.now())
  const compression = normalizeCompression(value.compression)
  return {
    id,
    title: clampString(value.title, 80) || '未命名会话',
    createdAt: clampTimestamp(value.createdAt, updatedAt),
    updatedAt,
    messages,
    ...(compression ? { compression } : {})
  }
}

function summary(conversation: StoredAiConversationSummary): StoredAiConversationSummary {
  const { id, title, createdAt, updatedAt } = conversation
  return { id, title, createdAt, updatedAt }
}

interface HistoryEntry extends StoredAiConversationSummary {
  file: string
}

type MigrationState = 'pending' | 'complete'

interface RecoveryManifest {
  entries: HistoryEntry[]
  migration: MigrationState | null
}

function sortedEntries(list: HistoryEntry[]): HistoryEntry[] {
  const unique = new Map<string, HistoryEntry>()
  for (const item of list) if (!unique.has(item.id)) unique.set(item.id, item)
  return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS)
}

function normalizeEntries(value: unknown): HistoryEntry[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.conversations)) throw new Error('无效的会话索引')
  return sortedEntries(value.conversations.flatMap((item): HistoryEntry[] => {
    if (!isRecord(item) || typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) return []
    const updatedAt = clampTimestamp(item.updatedAt, Date.now())
    const file = typeof item.file === 'string' ? item.file : `${item.id}.json`
    if (file === 'index.json' || file === 'recovery.json' || !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?\.json$/.test(file)) return []
    return [{ id: item.id, title: clampString(item.title, 80), createdAt: clampTimestamp(item.createdAt, updatedAt), updatedAt, file }]
  }))
}

function normalizeRecoveryManifest(value: unknown): RecoveryManifest {
  if (!isRecord(value)) throw new Error('无效的会话恢复名单')
  const migration = value.migration === 'pending' || value.migration === 'complete' ? value.migration : null
  return { entries: normalizeEntries(value), migration }
}

export class AiChatHistoryStore {
  private directory = ''
  private conversations: HistoryEntry[] = []
  private migration: MigrationState = 'complete'
  private enqueue = serialQueue()

  async init(path: string): Promise<void> {
    this.directory = `${path}.d`
    this.conversations = []
    this.migration = 'complete'
    const created = await mkdir(this.directory, { recursive: true })
    let indexed: HistoryEntry[] | undefined
    try {
      indexed = normalizeEntries(await readJson(this.indexPath()))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await copyFile(this.indexPath(), `${this.indexPath()}.${randomUUID()}.bak`)
      }
    }
    if (indexed) {
      this.migration = 'complete'
      await this.persistRecovery(indexed, 'complete')
      this.conversations = indexed
      return
    }
    if (created === undefined) {
      let recovery: RecoveryManifest = { entries: [], migration: null }
      try {
        recovery = normalizeRecoveryManifest(await readJson(this.recoveryPath()))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          await copyFile(this.recoveryPath(), `${this.recoveryPath()}.${randomUUID()}.bak`)
          console.warn('[ai] 会话恢复名单读取失败', error)
        }
      }
      if (recovery.migration === 'pending') {
        await this.migrateLegacy(path)
        return
      }
      this.migration = 'complete'
      const recoverable = recovery.entries
      this.conversations = await this.recoverEntries(recoverable)
      await this.persistIndex(this.conversations)
      return
    }
    await this.migrateLegacy(path)
  }

  private async migrateLegacy(path: string): Promise<void> {
    this.migration = 'pending'
    await this.persistRecovery([], 'pending')
    let legacy: unknown
    try {
      legacy = await readJson(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[ai] 会话历史读取失败', error)
    }
    const normalized = Array.isArray(legacy) ? legacy.map(normalizeConversation).filter((item): item is StoredAiConversation => item !== null) : []
    const migrated = sortedEntries(normalized.map((item) => ({ ...summary(item), file: `${item.id}.${randomUUID()}.json` })))
    for (const item of migrated) {
      const conversation = normalized.find((entry) => entry.id === item.id)
      if (conversation) await writeJson(this.conversationPath(item.file), conversation)
    }
    await this.persistIndex(migrated)
    this.migration = 'complete'
    await this.persistRecovery(migrated, 'complete')
  }

  private indexPath(): string {
    return storageChildPath(this.directory, 'index.json')
  }

  private conversationPath(file: string): string {
    return storageChildPath(this.directory, file)
  }

  private recoveryPath(): string {
    return storageChildPath(this.directory, 'recovery.json')
  }

  private async recoverEntries(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    const recovered: HistoryEntry[] = []
    for (const entry of entries) {
      try {
        const item = normalizeConversation(await readJson(this.conversationPath(entry.file)))
        if (item?.id === entry.id) recovered.push({ ...summary(item), file: entry.file })
      } catch {
        continue
      }
    }
    return sortedEntries(recovered.sort((a, b) => b.updatedAt - a.updatedAt))
  }

  private persistRecovery(list: HistoryEntry[], migration = this.migration): Promise<void> {
    return writeJson(this.recoveryPath(), { version: 1, migration, conversations: list })
  }

  private async persistIndex(list: HistoryEntry[]): Promise<void> {
    const previous = this.conversations
    await this.persistRecovery(previous.filter((item) => list.some((retained) => retained.file === item.file)))
    try {
      await writeJson(this.indexPath(), { version: 1, conversations: list })
    } catch (error) {
      await this.persistRecovery(previous).catch((recoveryError) => console.warn('[ai] 会话恢复名单回滚失败', recoveryError))
      throw error
    }
    try {
      await this.persistRecovery(list)
    } catch (error) {
      try {
        await writeJson(this.indexPath(), { version: 1, conversations: previous })
        await this.persistRecovery(previous)
        this.conversations = previous
      } catch (rollbackError) {
        console.warn('[ai] 会话索引回滚失败', rollbackError)
      }
      throw error
    }
    this.conversations = list
  }

  list(): StoredAiConversationSummary[] {
    return this.conversations.map(summary)
  }

  get(id: string): Promise<StoredAiConversation | null> {
    return this.enqueue(async () => {
      const entry = this.conversations.find((item) => item.id === id)
      if (!entry) return null
      return normalizeConversation(await readJson(this.conversationPath(entry.file)))
    })
  }

  save(value: unknown): Promise<StoredAiConversationSummary[]> {
    const conversation = normalizeConversation(value)
    if (!conversation) return Promise.reject(new Error('无效的会话数据'))
    return this.enqueue(async () => {
      const entry = { ...summary(conversation), file: `${conversation.id}.${randomUUID()}.json` }
      const next = sortedEntries([entry, ...this.conversations.filter((item) => item.id !== conversation.id)])
      const removed = this.conversations.filter((item) => !next.some((retained) => retained.file === item.file))
      await writeJson(this.conversationPath(entry.file), conversation)
      try {
        await this.persistIndex(next)
      } catch (error) {
        await unlink(this.conversationPath(entry.file)).catch(() => undefined)
        throw error
      }
      await Promise.all(removed.map((item) => unlink(this.conversationPath(item.file)).catch(() => undefined)))
      if (!next.some((item) => item.file === entry.file)) await unlink(this.conversationPath(entry.file)).catch(() => undefined)
      return this.list()
    })
  }

  delete(id: string): Promise<StoredAiConversationSummary[]> {
    return this.enqueue(async () => {
      const removed = this.conversations.find((item) => item.id === id)
      const next = this.conversations.filter((item) => item.id !== id)
      await this.persistIndex(next)
      if (removed) await unlink(this.conversationPath(removed.file)).catch(() => undefined)
      return this.list()
    })
  }
}
