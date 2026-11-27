import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentMemory, StoredAiConversation, StoredAiConversationSummary } from '../../../preload'
import { writeAtomic } from '../../jsonStore'
import { storageChildPath } from '../../storagePath'
import { conversationSummary, MAX_CONVERSATIONS, normalizeConversation } from '../chatHistoryStore'
import type { KnowledgeEntry, KnowledgeMatch } from '../knowledge'
import { MAX_MEMORIES, MAX_MEMORY_CONTENT_LENGTH, normalizeMemory } from '../memoryStore'
import type { HawdbDatabase} from './ffi';
import { HawdbError, HawdbLibrary } from './ffi'
import {
  buildConversationSearchText,
  buildConversationSnippet,
  buildKnowledgeSearchText,
  extractKnowledgeGraphEdges,
  extractQueryTerms,
  normalizeLookupText
} from './graphBuilder'
import type {
  ConversationSearchHit,
  HawdbOpenPayload,
  HawdbOpenResult,
  HawdbStatusInfo,
  HawdbStorageMode,
  KnowledgeRelatedConcept,
  KnowledgeSearchMatch,
  KnowledgeSearchResult,
  MemoryRecallMatch
} from './protocol'
import { ensureEoqSchema, EOQ_SCHEMA_VERSION } from './schema'

const MAX_QUERY_LENGTH = 200
const DEFAULT_TOP_K = 3
const MAX_TOP_K = 5
const MAX_RELATED_CONCEPTS = 4
const SNAPSHOT_FILE_NAME = 'snapshot.json'

interface SnapshotDocument {
  version: number
  memories: AgentMemory[]
  conversations: StoredAiConversation[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJsonSafe(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function loadLegacyMemories(path?: string): Promise<AgentMemory[]> {
  if (!path || !existsSync(path)) {return []}
  const parsed = await readJsonSafe(path)
  if (!Array.isArray(parsed)) {return []}
  const seen = new Set<string>()
  const memories: AgentMemory[] = []
  for (const item of parsed) {
    const normalized = normalizeMemory(item)
    if (!normalized || seen.has(normalized.id)) {continue}
    seen.add(normalized.id)
    memories.push(normalized)
  }
  return memories.slice(0, MAX_MEMORIES)
}

async function loadLegacyConversations(path?: string): Promise<StoredAiConversation[]> {
  if (!path) {return []}
  const directory = `${path}.d`
  const byId = new Map<string, StoredAiConversation>()
  let indexValid = false
  const indexPath = join(directory, 'index.json')
  if (existsSync(indexPath)) {
    const indexDoc = await readJsonSafe(indexPath)
    if (isRecord(indexDoc) && Array.isArray(indexDoc.conversations)) {
      indexValid = true
      for (const entry of indexDoc.conversations) {
        if (!isRecord(entry) || typeof entry.file !== 'string' || !entry.file) {continue}
        try {
          const filePath = storageChildPath(directory, entry.file)
          const parsed = await readJsonSafe(filePath)
          const normalized = normalizeConversation(parsed)
          if (normalized) {byId.set(normalized.id, normalized)}
        } catch {
          continue
        }
      }
    }
  }
  if (!indexValid && byId.size === 0 && existsSync(path)) {
    const parsed = await readJsonSafe(path)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const normalized = normalizeConversation(item)
        if (normalized) {byId.set(normalized.id, normalized)}
      }
    }
  }
  return [...byId.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .slice(0, MAX_CONVERSATIONS)
}

async function loadSnapshot(path: string): Promise<SnapshotDocument | null> {
  if (!existsSync(path)) {return null}
  const parsed = await readJsonSafe(path)
  if (!isRecord(parsed)) {return null}
  const memories: AgentMemory[] = []
  const seenMemories = new Set<string>()
  if (Array.isArray(parsed.memories)) {
    for (const item of parsed.memories) {
      const normalized = normalizeMemory(item)
      if (!normalized || seenMemories.has(normalized.id)) {continue}
      seenMemories.add(normalized.id)
      memories.push(normalized)
    }
  }
  const conversations: StoredAiConversation[] = []
  const seenConversations = new Set<string>()
  if (Array.isArray(parsed.conversations)) {
    for (const item of parsed.conversations) {
      const normalized = normalizeConversation(item)
      if (!normalized || seenConversations.has(normalized.id)) {continue}
      seenConversations.add(normalized.id)
      conversations.push(normalized)
    }
  }
  return {
    version: 1,
    memories: memories.slice(0, MAX_MEMORIES),
    conversations: conversations
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
      .slice(0, MAX_CONVERSATIONS)
  }
}

function fieldMatchCount(value: string, terms: string[]): number {
  const normalized = normalizeLookupText(value)
  if (!normalized) {return 0}
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0)
}

function scoreEntryFields(entry: KnowledgeEntry, terms: string[], module?: string): { boost: number; matchedFields: string[] } {
  const matchedFields: string[] = []
  const nameScore = fieldMatchCount(entry.name, terms)
  const aliasScore = entry.aliases.reduce((score, alias) => score + fieldMatchCount(alias, terms), 0)
  const keywordScore = entry.keywords.reduce((score, keyword) => score + fieldMatchCount(keyword, terms), 0)
  const placeContent = (entry.typicalPlaces ?? []).map((place) => `${place.name} ${place.note}`).join(' ')
  const content = [entry.definition, ...(entry.features ?? []), ...(entry.formation ?? []), ...(entry.commonConfusions ?? []), placeContent].join(' ')
  const contentScore = fieldMatchCount(content, terms)
  let boost = nameScore * 100 + aliasScore * 80 + keywordScore * 45 + contentScore * 12
  if (module && normalizeLookupText(entry.module).includes(normalizeLookupText(module))) {
    boost += 25
    matchedFields.push('module')
  }
  if (nameScore) {matchedFields.push('name')}
  if (aliasScore) {matchedFields.push('aliases')}
  if (keywordScore) {matchedFields.push('keywords')}
  if (contentScore) {matchedFields.push('content')}
  return { boost, matchedFields }
}

function toKnowledgeMatch(entry: KnowledgeEntry, score: number, matchedFields: string[]): KnowledgeMatch {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    module: entry.module,
    grade: entry.grade,
    definition: entry.definition,
    features: entry.features ?? [],
    formation: entry.formation ?? [],
    typicalPlaces: entry.typicalPlaces ?? [],
    commonConfusions: entry.commonConfusions ?? [],
    sources: entry.sources,
    status: entry.status,
    updatedAt: entry.updatedAt,
    score,
    matchedFields
  }
}

export class EoqHawdbEngine {
  private lib: HawdbLibrary | null = null
  private db: HawdbDatabase | null = null
  private storageMode: HawdbStorageMode = 'disk'
  private dbRoot = ''
  private hawdbVersion = ''
  private formatVersion = 0
  private readonly knowledgeById = new Map<string, KnowledgeEntry>()

  private requireDb(): HawdbDatabase {
    if (!this.db) {throw new HawdbError('not_open', 'HawDB 引擎尚未初始化')}
    return this.db
  }

  private snapshotPath(): string {
    return join(this.dbRoot, SNAPSHOT_FILE_NAME)
  }

  private readMeta(key: string): string | null {
    const rows = this.requireDb().querySQL('SELECT value FROM eoq_meta WHERE key = $1', [key]).dicts()
    return rows.length > 0 && typeof rows[0].value === 'string' ? rows[0].value : null
  }

  private writeMeta(key: string, value: string): void {
    this.requireDb().transaction((tx) => {
      tx.querySQL('DELETE FROM eoq_meta WHERE key = $1', [key])
      tx.querySQL('INSERT INTO eoq_meta (key, value) VALUES ($1, $2)', [key, value])
    })
  }

  private insertMemories(memories: AgentMemory[]): void {
    if (memories.length === 0) {return}
    const existingIds = new Set(this.listMemories().map((item) => item.id))
    const toInsert = memories.filter((item) => !existingIds.has(item.id)).slice(0, Math.max(0, MAX_MEMORIES - existingIds.size))
    if (toInsert.length === 0) {return}
    this.requireDb().transaction((tx) => {
      for (const memory of toInsert) {
        tx.querySQL(
          'INSERT INTO eoq_memories (id, content, source, created_at) VALUES ($1, $2, $3, $4)',
          [memory.id, memory.content, memory.source, memory.createdAt]
        )
      }
    })
  }

  private insertConversations(conversations: StoredAiConversation[]): void {
    if (conversations.length === 0) {return}
    const existingIds = new Set(this.listConversations().map((item) => item.id))
    const toInsert = conversations.filter((item) => !existingIds.has(item.id))
    if (toInsert.length === 0) {return}
    this.requireDb().transaction((tx) => {
      for (const conversation of toInsert) {
        tx.querySQL(
          'INSERT INTO eoq_conversations (id, title, created_at, updated_at, payload_json, search_text) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            conversation.id,
            conversation.title,
            conversation.createdAt,
            conversation.updatedAt,
            JSON.stringify(conversation),
            buildConversationSearchText(conversation)
          ]
        )
      }
    })
    this.trimConversations()
  }

  private trimConversations(): void {
    const db = this.requireDb()
    const rows = db.querySQL('SELECT id FROM eoq_conversations ORDER BY updated_at DESC, id ASC').dicts()
    if (rows.length <= MAX_CONVERSATIONS) {return}
    const staleIds = rows.slice(MAX_CONVERSATIONS).map((row) => String(row.id))
    db.transaction((tx) => {
      for (const id of staleIds) {
        tx.querySQL('DELETE FROM eoq_conversations WHERE id = $1', [id])
      }
    })
  }

  private readAllConversationsFull(): StoredAiConversation[] {
    const rows = this.requireDb()
      .querySQL('SELECT payload_json FROM eoq_conversations ORDER BY updated_at DESC, id ASC LIMIT $1', [MAX_CONVERSATIONS])
      .dicts()
    const list: StoredAiConversation[] = []
    for (const row of rows) {
      if (typeof row.payload_json !== 'string') {continue}
      try {
        const normalized = normalizeConversation(JSON.parse(row.payload_json))
        if (normalized) {list.push(normalized)}
      } catch {
        continue
      }
    }
    return list
  }

  private async persistSnapshotIfNeeded(): Promise<void> {
    if (this.storageMode !== 'memory-snapshot') {return}
    const doc: SnapshotDocument = {
      version: 1,
      memories: this.listMemories(),
      conversations: this.readAllConversationsFull()
    }
    await writeAtomic(this.snapshotPath(), JSON.stringify(doc))
  }

  private syncKnowledgeBase(entries: KnowledgeEntry[], hash: string): void {
    this.knowledgeById.clear()
    for (const entry of entries) {
      this.knowledgeById.set(entry.id, entry)
    }
    const storedHash = this.readMeta('knowledge_hash')
    const countRows = this.requireDb().querySQL('SELECT COUNT(*) AS cnt FROM eoq_knowledge').dicts()
    const currentCount = Number(countRows[0]?.cnt ?? 0)
    if (this.storageMode === 'disk' && storedHash === hash && currentCount === entries.length) {
      return
    }
    const db = this.requireDb()
    this.writeMeta('knowledge_hash', '')
    const existingIds = db.querySQL('SELECT id FROM eoq_knowledge').dicts().map((row) => String(row.id))
    db.transaction((tx) => {
      for (const id of existingIds) {
        tx.querySQL('DELETE FROM eoq_knowledge WHERE id = $1', [id])
      }
      for (const entry of entries) {
        tx.querySQL(
          'INSERT INTO eoq_knowledge (id, type, name, module, grade, status, updated_at, search_text, payload_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [
            entry.id,
            entry.type,
            entry.name,
            entry.module,
            entry.grade,
            entry.status,
            entry.updatedAt,
            buildKnowledgeSearchText(entry),
            JSON.stringify(entry)
          ]
        )
      }
    })
    const activeEntries = entries.filter((entry) => entry.status !== 'deprecated')
    const edges = extractKnowledgeGraphEdges(activeEntries)
    db.exec('MATCH (n:KnowledgeConcept) DETACH DELETE n')
    db.transaction((tx) => {
      for (const entry of activeEntries) {
        tx.exec('CREATE (n:KnowledgeConcept {id: $id, name: $name, module: $module})', {
          id: entry.id,
          name: entry.name,
          module: entry.module
        })
      }
      for (const edge of edges) {
        const relationType = edge.relation === 'CONTRASTS_WITH' ? 'CONTRASTS_WITH' : 'RELATED_TO'
        tx.exec(
          `MATCH (a:KnowledgeConcept {id: $fromId}), (b:KnowledgeConcept {id: $toId}) CREATE (a)-[r:${relationType} {reason: $reason}]->(b)`,
          { fromId: edge.fromId, toId: edge.toId, reason: edge.reason }
        )
      }
    })
    this.writeMeta('knowledge_hash', hash)
  }

  async open(payload: HawdbOpenPayload): Promise<HawdbOpenResult> {
    this.close()
    this.dbRoot = payload.dbRoot
    await mkdir(this.dbRoot, { recursive: true })
    const lib = new HawdbLibrary(payload.libraryPath)
    let db: HawdbDatabase
    let dbOwned: boolean
    if (process.platform === 'win32') {
      db = lib.openInMemory()
      dbOwned = true
      try {
        ensureEoqSchema(db)
      } catch (error) {
        db.close()
        lib.close()
        throw error
      }
      this.storageMode = 'memory-snapshot'
    } else {
      let diskDb: HawdbDatabase | null = null
      let schemaReady: boolean
      try {
        diskDb = lib.open(join(this.dbRoot, 'db'), { durability: 'sync_on_every_write' })
        ensureEoqSchema(diskDb)
        schemaReady = true
      } catch (error) {
        diskDb?.close()
        lib.close()
        throw error
      }
      db = diskDb
      dbOwned = schemaReady
      this.storageMode = 'disk'
    }
    if (!dbOwned) {
      lib.close()
      throw new HawdbError('open_failed', 'HawDB 数据库初始化失败')
    }
    this.lib = lib
    this.db = db
    this.hawdbVersion = lib.version()
    this.formatVersion = lib.formatVersion()

    const snapshot = await loadSnapshot(this.snapshotPath())
    if (this.storageMode === 'memory-snapshot') {
      if (snapshot) {
        this.insertMemories(snapshot.memories)
        this.insertConversations(snapshot.conversations)
      } else {
        const [legacyMemories, legacyConversations] = await Promise.all([
          loadLegacyMemories(payload.legacyMemoriesPath),
          loadLegacyConversations(payload.legacyHistoryPath)
        ])
        this.insertMemories(legacyMemories)
        this.insertConversations(legacyConversations)
        if (legacyMemories.length > 0 || legacyConversations.length > 0) {
          await this.persistSnapshotIfNeeded()
        }
      }
      this.writeMeta('schema_version', EOQ_SCHEMA_VERSION)
    } else if (this.readMeta('migrated_v1') !== '1') {
      if (snapshot) {
        this.insertMemories(snapshot.memories)
        this.insertConversations(snapshot.conversations)
      } else {
        const [legacyMemories, legacyConversations] = await Promise.all([
          loadLegacyMemories(payload.legacyMemoriesPath),
          loadLegacyConversations(payload.legacyHistoryPath)
        ])
        this.insertMemories(legacyMemories)
        this.insertConversations(legacyConversations)
      }
      this.writeMeta('schema_version', EOQ_SCHEMA_VERSION)
      this.writeMeta('migrated_v1', '1')
    }

    this.syncKnowledgeBase(payload.knowledgeEntries, payload.knowledgeHash)

    return {
      status: this.status(),
      memories: this.listMemories(),
      conversations: this.listConversations()
    }
  }

  close(): void {
    const db = this.db
    const lib = this.lib
    this.db = null
    this.lib = null
    this.knowledgeById.clear()
    try {
      db?.close()
    } finally {
      lib?.close()
    }
  }

  status(): HawdbStatusInfo {
    const db = this.requireDb()
    const memoryCount = Number(db.querySQL('SELECT COUNT(*) AS cnt FROM eoq_memories').dicts()[0]?.cnt ?? 0)
    const conversationCount = Number(db.querySQL('SELECT COUNT(*) AS cnt FROM eoq_conversations').dicts()[0]?.cnt ?? 0)
    const knowledgeCount = Number(db.querySQL('SELECT COUNT(*) AS cnt FROM eoq_knowledge').dicts()[0]?.cnt ?? 0)
    return {
      ready: true,
      storageMode: this.storageMode,
      hawdbVersion: this.hawdbVersion,
      formatVersion: this.formatVersion,
      knowledgeCount,
      memoryCount,
      conversationCount
    }
  }

  listMemories(): AgentMemory[] {
    const rows = this.requireDb()
      .querySQL('SELECT id, content, source, created_at FROM eoq_memories ORDER BY created_at ASC, id ASC')
      .dicts()
    return rows.map((row) => ({
      id: String(row.id),
      content: String(row.content),
      source: row.source === 'agent' ? 'agent' : 'user',
      createdAt: Number(row.created_at)
    }))
  }

  async addMemory(content: string, source: AgentMemory['source']): Promise<AgentMemory> {
    const trimmed = typeof content === 'string' ? content.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH) : ''
    if (!trimmed) {throw new Error('记忆内容不能为空')}
    const db = this.requireDb()
    const count = Number(db.querySQL('SELECT COUNT(*) AS cnt FROM eoq_memories').dicts()[0]?.cnt ?? 0)
    if (count >= MAX_MEMORIES) {throw new Error(`记忆已达上限（${MAX_MEMORIES} 条），请先删除部分记忆`)}
    const memory: AgentMemory = {
      id: `m${randomUUID()}`,
      content: trimmed,
      source: source === 'agent' ? 'agent' : 'user',
      createdAt: Date.now()
    }
    db.querySQL(
      'INSERT INTO eoq_memories (id, content, source, created_at) VALUES ($1, $2, $3, $4)',
      [memory.id, memory.content, memory.source, memory.createdAt]
    )
    try {
      await this.persistSnapshotIfNeeded()
    } catch (error) {
      if (this.storageMode === 'memory-snapshot') {
        try {
          db.querySQL('DELETE FROM eoq_memories WHERE id = $1', [memory.id])
        } catch {
          void 0
        }
      }
      throw error
    }
    return memory
  }

  async deleteMemory(id: string): Promise<boolean> {
    const db = this.requireDb()
    const existing = db.querySQL('SELECT id, content, source, created_at FROM eoq_memories WHERE id = $1', [id]).dicts()
    if (existing.length === 0) {return false}
    db.querySQL('DELETE FROM eoq_memories WHERE id = $1', [id])
    try {
      await this.persistSnapshotIfNeeded()
      return true
    } catch (error) {
      if (this.storageMode === 'memory-snapshot') {
        try {
          const row = existing[0]
          if (db.querySQL('SELECT id FROM eoq_memories WHERE id = $1', [id]).dicts().length === 0) {
            db.querySQL(
              'INSERT INTO eoq_memories (id, content, source, created_at) VALUES ($1, $2, $3, $4)',
              [id, String(row.content), row.source === 'agent' ? 'agent' : 'user', Number(row.created_at)]
            )
          }
        } catch {
          void 0
        }
      }
      throw error
    }
  }

  recallMemories(query: string, limit = 8): MemoryRecallMatch[] {
    const cleanQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
    if (!cleanQuery) {return []}
    const topK = Math.min(20, Math.max(1, Math.round(limit)))
    try {
      const rows = this.requireDb()
        .querySQL(
          "SELECT r.id, r.content, r.source, r.created_at, score FROM text_search('idx_eoq_memories', $1, top_k => $2) AS r ORDER BY score DESC",
          [cleanQuery, topK]
        )
        .dicts()
      if (rows.length > 0) {
        return rows.map((row) => ({
          id: String(row.id),
          content: String(row.content),
          source: row.source === 'agent' ? 'agent' : 'user',
          createdAt: Number(row.created_at),
          score: Number(row.score)
        }))
      }
    } catch {
      void 0
    }
    const terms = extractQueryTerms(cleanQuery)
    return this.listMemories()
      .map((memory) => ({ ...memory, score: fieldMatchCount(memory.content, terms) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.createdAt - left.createdAt)
      .slice(0, topK)
  }

  listConversations(): StoredAiConversationSummary[] {
    const rows = this.requireDb()
      .querySQL('SELECT id, title, created_at, updated_at FROM eoq_conversations ORDER BY updated_at DESC, id ASC LIMIT $1', [MAX_CONVERSATIONS])
      .dicts()
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }))
  }

  getConversation(id: string): StoredAiConversation | null {
    const rows = this.requireDb()
      .querySQL('SELECT payload_json FROM eoq_conversations WHERE id = $1', [id])
      .dicts()
    if (rows.length === 0 || typeof rows[0].payload_json !== 'string') {return null}
    return normalizeConversation(JSON.parse(rows[0].payload_json))
  }

  async saveConversation(value: unknown): Promise<StoredAiConversationSummary[]> {
    const conversation = normalizeConversation(value)
    if (!conversation) {throw new Error('无效的会话数据')}
    const db = this.requireDb()
    const searchText = buildConversationSearchText(conversation)
    const payloadJson = JSON.stringify(conversation)
    db.transaction((tx) => {
      tx.querySQL('DELETE FROM eoq_conversations WHERE id = $1', [conversation.id])
      tx.querySQL(
        'INSERT INTO eoq_conversations (id, title, created_at, updated_at, payload_json, search_text) VALUES ($1, $2, $3, $4, $5, $6)',
        [conversation.id, conversation.title, conversation.createdAt, conversation.updatedAt, payloadJson, searchText]
      )
    })
    this.trimConversations()
    await this.persistSnapshotIfNeeded()
    return this.listConversations()
  }

  async deleteConversation(id: string): Promise<StoredAiConversationSummary[]> {
    this.requireDb().querySQL('DELETE FROM eoq_conversations WHERE id = $1', [id])
    await this.persistSnapshotIfNeeded()
    return this.listConversations()
  }

  searchConversations(query: string, limit = 5, excludeId?: string): ConversationSearchHit[] {
    const cleanQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
    if (!cleanQuery) {return []}
    const cappedLimit = Math.min(10, Math.max(1, Math.round(limit)))
    const fetchLimit = cappedLimit + (excludeId ? 2 : 0)
    const hits: ConversationSearchHit[] = []
    try {
      const rows = this.requireDb()
        .querySQL(
          "SELECT r.id, r.title, r.updated_at, r.payload_json, score FROM text_search('idx_eoq_conversations', $1, top_k => $2) AS r ORDER BY score DESC",
          [cleanQuery, fetchLimit]
        )
        .dicts()
      for (const row of rows) {
        const id = String(row.id)
        if (excludeId && id === excludeId) {continue}
        if (typeof row.payload_json !== 'string') {continue}
        try {
          const conversation = normalizeConversation(JSON.parse(row.payload_json))
          if (!conversation) {continue}
          hits.push({
            id: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            score: Number(row.score),
            snippet: buildConversationSnippet(conversation, cleanQuery),
            ...(conversation.compression?.summary ? { compressionSummary: conversation.compression.summary } : {})
          })
        } catch {
          continue
        }
        if (hits.length >= cappedLimit) {break}
      }
      if (hits.length > 0) {return hits}
    } catch {
      void 0
    }
    const terms = extractQueryTerms(cleanQuery)
    return this.readAllConversationsFull()
      .filter((conversation) => !excludeId || conversation.id !== excludeId)
      .map((conversation) => ({
        conversation,
        score: fieldMatchCount(buildConversationSearchText(conversation), terms)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.conversation.updatedAt - left.conversation.updatedAt)
      .slice(0, cappedLimit)
      .map(({ conversation, score }) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        score,
        snippet: buildConversationSnippet(conversation, cleanQuery),
        ...(conversation.compression?.summary ? { compressionSummary: conversation.compression.summary } : {})
      }))
  }

  private queryRelatedConcepts(conceptId: string): KnowledgeRelatedConcept[] {
    try {
      const rows = this.requireDb()
        .query(
          'MATCH (a:KnowledgeConcept {id: $id})-[r]-(b:KnowledgeConcept) RETURN b.id AS id, b.name AS name, b.module AS module, type(r) AS rel, r.reason AS reason LIMIT 8',
          { id: conceptId }
        )
        .dicts()
      const seen = new Set<string>()
      const related: KnowledgeRelatedConcept[] = []
      for (const row of rows) {
        const id = String(row.id ?? '')
        if (!id || id === conceptId || seen.has(id)) {continue}
        seen.add(id)
        related.push({
          id,
          name: String(row.name ?? ''),
          module: String(row.module ?? ''),
          relation: row.rel === 'CONTRASTS_WITH' ? 'contrasts_with' : 'related_to',
          reason: String(row.reason ?? '')
        })
      }
      return related
        .sort((left, right) => {
          if (left.relation !== right.relation) {return left.relation === 'contrasts_with' ? -1 : 1}
          return left.name.localeCompare(right.name, 'zh-CN')
        })
        .slice(0, MAX_RELATED_CONCEPTS)
    } catch {
      return []
    }
  }

  retrieveKnowledge(query: string, module?: string, topK = DEFAULT_TOP_K): KnowledgeSearchResult {
    const cleanQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
    if (!cleanQuery) {return { query: '', matches: [], total: 0 }}
    const limit = Math.min(MAX_TOP_K, Math.max(1, Math.round(topK)))
    const terms = extractQueryTerms(cleanQuery)
    const bm25Scores = new Map<string, number>()
    try {
      const rows = this.requireDb()
        .querySQL(
          "SELECT r.id, score FROM text_search('idx_eoq_knowledge', $1, top_k => 25) AS r ORDER BY score DESC",
          [cleanQuery]
        )
        .dicts()
      for (const row of rows) {
        bm25Scores.set(String(row.id), Number(row.score))
      }
    } catch {
      void 0
    }
    const ranked: { entry: KnowledgeEntry; score: number; matchedFields: string[] }[] = []
    for (const entry of this.knowledgeById.values()) {
      if (entry.status === 'deprecated') {continue}
      const bm25 = bm25Scores.get(entry.id) ?? 0
      const { boost, matchedFields } = scoreEntryFields(entry, terms, module)
      const combinedScore = Math.round((bm25 * 15 + boost) * 100) / 100
      if (combinedScore <= 0) {continue}
      const fields = [...matchedFields]
      if (bm25 > 0 && !fields.includes('bm25')) {fields.push('bm25')}
      ranked.push({ entry, score: combinedScore, matchedFields: fields })
    }
    ranked.sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name, 'zh-CN'))
    const topMatches: KnowledgeSearchMatch[] = ranked.slice(0, limit).map((item) => {
      const base = toKnowledgeMatch(item.entry, item.score, item.matchedFields)
      const relatedConcepts = this.queryRelatedConcepts(item.entry.id)
      return relatedConcepts.length > 0 ? { ...base, relatedConcepts } : base
    })
    return {
      query: cleanQuery,
      matches: topMatches,
      total: ranked.length
    }
  }
}

export function summaryOfConversation(conversation: StoredAiConversation): StoredAiConversationSummary {
  return conversationSummary(conversation)
}
