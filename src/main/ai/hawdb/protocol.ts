import type {
  AgentMemory,
  StoredAiConversation,
  StoredAiConversationSummary
} from '../../../preload'
import type { KnowledgeEntry, KnowledgeMatch } from '../knowledge'

export type HawdbStorageMode = 'disk' | 'memory-snapshot'

export interface HawdbStatusInfo {
  ready: boolean
  storageMode: HawdbStorageMode
  hawdbVersion: string
  formatVersion: number
  knowledgeCount: number
  memoryCount: number
  conversationCount: number
}

export interface MemoryRecallMatch extends AgentMemory {
  score: number
}

export interface ConversationSearchHit {
  id: string
  title: string
  updatedAt: number
  score: number
  snippet: string
  compressionSummary?: string
}

export interface KnowledgeRelatedConcept {
  id: string
  name: string
  module: string
  relation: 'contrasts_with' | 'related_to'
  reason: string
}

export interface KnowledgeSearchMatch extends KnowledgeMatch {
  relatedConcepts?: KnowledgeRelatedConcept[]
}

export interface KnowledgeSearchResult {
  query: string
  matches: KnowledgeSearchMatch[]
  total: number
}

export interface HawdbOpenPayload {
  libraryPath: string
  dbRoot: string
  legacyMemoriesPath?: string
  legacyHistoryPath?: string
  knowledgeEntries: KnowledgeEntry[]
  knowledgeHash: string
}

export type HawdbWorkerRequest =
  | { id: number; op: 'open'; payload: HawdbOpenPayload }
  | { id: number; op: 'close' }
  | { id: number; op: 'status' }
  | { id: number; op: 'memory:list' }
  | { id: number; op: 'memory:add'; payload: { content: string; source: AgentMemory['source'] } }
  | { id: number; op: 'memory:delete'; payload: { id: string } }
  | { id: number; op: 'memory:recall'; payload: { query: string; limit?: number } }
  | { id: number; op: 'history:list' }
  | { id: number; op: 'history:get'; payload: { id: string } }
  | { id: number; op: 'history:save'; payload: { conversation: unknown } }
  | { id: number; op: 'history:delete'; payload: { id: string } }
  | {
      id: number
      op: 'history:search'
      payload: { query: string; limit?: number; excludeId?: string }
    }
  | {
      id: number
      op: 'knowledge:retrieve'
      payload: { query: string; module?: string; topK?: number }
    }

export type HawdbWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; kind?: string }

export interface HawdbOpenResult {
  status: HawdbStatusInfo
  memories: AgentMemory[]
  conversations: StoredAiConversationSummary[]
}
