import type { HawdbDatabase } from './ffi'

export const EOQ_SCHEMA_VERSION = '1'

function tableExists(db: HawdbDatabase, tableName: string): boolean {
  try {
    db.querySQL(`SELECT 1 FROM ${tableName} LIMIT 0`)
    return true
  } catch {
    return false
  }
}

function ensureTable(db: HawdbDatabase, tableName: string, ddl: string): void {
  if (tableExists(db, tableName)) {
    return
  }
  db.querySQL(ddl)
}

export function ensureEoqSchema(db: HawdbDatabase): void {
  ensureTable(db, 'eoq_meta', 'CREATE TABLE eoq_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  ensureTable(
    db,
    'eoq_memories',
    'CREATE TABLE eoq_memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, source TEXT NOT NULL, created_at BIGINT NOT NULL)'
  )
  db.querySQL(
    "CREATE SEARCH INDEX IF NOT EXISTS idx_eoq_memories ON eoq_memories (content) WITH (analyzer = 'cjk_ngram')"
  )
  ensureTable(
    db,
    'eoq_conversations',
    'CREATE TABLE eoq_conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, payload_json TEXT NOT NULL, search_text TEXT NOT NULL)'
  )
  db.querySQL(
    "CREATE SEARCH INDEX IF NOT EXISTS idx_eoq_conversations ON eoq_conversations (search_text) WITH (analyzer = 'cjk_ngram')"
  )
  ensureTable(
    db,
    'eoq_knowledge',
    'CREATE TABLE eoq_knowledge (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, module TEXT NOT NULL, grade TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, search_text TEXT NOT NULL, payload_json TEXT NOT NULL)'
  )
  db.querySQL(
    "CREATE SEARCH INDEX IF NOT EXISTS idx_eoq_knowledge ON eoq_knowledge (search_text) WITH (analyzer = 'cjk_ngram')"
  )
}
