import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'

import type {
  AgentMemory,
  StoredAiConversation,
  StoredAiConversationSummary
} from '../../../preload'
import { EoqHawdbEngine } from './engine'
import { HawdbError } from './ffi'
import type {
  ConversationSearchHit,
  HawdbOpenPayload,
  HawdbOpenResult,
  HawdbStatusInfo,
  HawdbWorkerRequest,
  HawdbWorkerResponse,
  KnowledgeSearchResult,
  MemoryRecallMatch
} from './protocol'

const REQUEST_TIMEOUT_MS = 30_000
const CLOSE_TIMEOUT_MS = 3000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export interface EoqHawdbClientOptions {
  workerPath?: string
  inProcess?: boolean
}

type RequestBody =
  | { op: 'open'; payload: HawdbOpenPayload }
  | { op: 'close' }
  | { op: 'status' }
  | { op: 'memory:list' }
  | { op: 'memory:add'; payload: { content: string; source: AgentMemory['source'] } }
  | { op: 'memory:delete'; payload: { id: string } }
  | { op: 'memory:recall'; payload: { query: string; limit?: number } }
  | { op: 'history:list' }
  | { op: 'history:get'; payload: { id: string } }
  | { op: 'history:save'; payload: { conversation: unknown } }
  | { op: 'history:delete'; payload: { id: string } }
  | { op: 'history:search'; payload: { query: string; limit?: number; excludeId?: string } }
  | { op: 'knowledge:retrieve'; payload: { query: string; module?: string; topK?: number } }

function defaultWorkerPath(): string {
  if (typeof __dirname === 'string') {
    return join(__dirname, 'hawdbWorker.js')
  }
  return join(import.meta.dirname, 'hawdbWorker.js')
}

export class EoqHawdbClient {
  private readonly workerPath: string
  private readonly forceInProcess: boolean
  private worker: Worker | null = null
  private inProcessEngine: EoqHawdbEngine | null = null
  private inProcessQueue: Promise<unknown> = Promise.resolve()
  private readonly pending = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private ready = false
  private lastStatus: HawdbStatusInfo | null = null

  constructor(options: EoqHawdbClientOptions = {}) {
    this.workerPath = options.workerPath ?? defaultWorkerPath()
    this.forceInProcess = options.inProcess === true
  }

  isReady(): boolean {
    return this.ready
  }

  cachedStatus(): HawdbStatusInfo | null {
    return this.lastStatus
  }

  private rejectAllPending(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      this.pending.delete(id)
      entry.reject(error)
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }
    const worker = new Worker(this.workerPath)
    worker.on('message', (response: HawdbWorkerResponse) => {
      const entry = this.pending.get(response.id)
      if (!entry) {
        return
      }
      clearTimeout(entry.timer)
      this.pending.delete(response.id)
      if (response.ok) {
        entry.resolve(response.result)
      } else {
        entry.reject(
          response.kind ? new HawdbError(response.kind, response.error) : new Error(response.error)
        )
      }
    })
    worker.on('error', error => {
      this.ready = false
      this.worker = null
      this.rejectAllPending(error instanceof Error ? error : new Error(String(error)))
    })
    worker.on('exit', code => {
      this.ready = false
      if (this.worker === worker) {
        this.worker = null
      }
      if (this.pending.size > 0) {
        this.rejectAllPending(new Error(`HawDB 工作线程已退出（code=${code}）`))
      }
    })
    this.worker = worker
    return worker
  }

  private runInProcess<T>(task: (engine: EoqHawdbEngine) => T | Promise<T>): Promise<T> {
    if (!this.inProcessEngine) {
      this.inProcessEngine = new EoqHawdbEngine()
    }
    const engine = this.inProcessEngine
    const next = this.inProcessQueue.then(() => task(engine))
    this.inProcessQueue = next.catch(() => {})
    return next
  }

  private send<T>(body: RequestBody, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.forceInProcess || !existsSync(this.workerPath)) {
      return this.dispatchInProcess<T>(body)
    }
    const worker = this.ensureWorker()
    const id = this.nextRequestId
    this.nextRequestId += 1
    const request: HawdbWorkerRequest = { ...body, id }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`HawDB 请求超时（${body.op}）`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer
      })
      worker.postMessage(request)
    })
  }

  private dispatchInProcess<T>(body: RequestBody): Promise<T> {
    return this.runInProcess(engine => {
      switch (body.op) {
        case 'open': {
          return engine.open(body.payload) as Promise<T>
        }
        case 'close': {
          engine.close()
          return true as T
        }
        case 'status': {
          return engine.status() as T
        }
        case 'memory:list': {
          return engine.listMemories() as T
        }
        case 'memory:add': {
          return engine.addMemory(body.payload.content, body.payload.source) as Promise<T>
        }
        case 'memory:delete': {
          return engine.deleteMemory(body.payload.id) as Promise<T>
        }
        case 'memory:recall': {
          return engine.recallMemories(body.payload.query, body.payload.limit) as T
        }
        case 'history:list': {
          return engine.listConversations() as T
        }
        case 'history:get': {
          return engine.getConversation(body.payload.id) as T
        }
        case 'history:save': {
          return engine.saveConversation(body.payload.conversation) as Promise<T>
        }
        case 'history:delete': {
          return engine.deleteConversation(body.payload.id) as Promise<T>
        }
        case 'history:search': {
          return engine.searchConversations(
            body.payload.query,
            body.payload.limit,
            body.payload.excludeId
          ) as T
        }
        case 'knowledge:retrieve': {
          return engine.retrieveKnowledge(
            body.payload.query,
            body.payload.module,
            body.payload.topK
          ) as T
        }
      }
    })
  }

  async open(payload: HawdbOpenPayload): Promise<HawdbOpenResult> {
    const result = await this.send<HawdbOpenResult>({ op: 'open', payload })
    this.ready = result.status.ready
    this.lastStatus = result.status
    return result
  }

  async close(): Promise<void> {
    this.ready = false
    if (this.inProcessEngine) {
      try {
        await this.runInProcess(engine => engine.close())
      } finally {
        this.inProcessEngine = null
      }
    }
    const worker = this.worker
    if (!worker) {
      return
    }
    try {
      await this.send({ op: 'close' }, CLOSE_TIMEOUT_MS)
    } catch {
      void 0
    } finally {
      this.worker = null
      await worker.terminate().catch(() => {})
    }
  }

  async status(): Promise<HawdbStatusInfo> {
    const info = await this.send<HawdbStatusInfo>({ op: 'status' })
    this.lastStatus = info
    return info
  }

  listMemories(): Promise<AgentMemory[]> {
    return this.send<AgentMemory[]>({ op: 'memory:list' })
  }

  addMemory(content: string, source: AgentMemory['source']): Promise<AgentMemory> {
    return this.send<AgentMemory>({ op: 'memory:add', payload: { content, source } })
  }

  deleteMemory(id: string): Promise<boolean> {
    return this.send<boolean>({ op: 'memory:delete', payload: { id } })
  }

  recallMemories(query: string, limit?: number): Promise<MemoryRecallMatch[]> {
    return this.send<MemoryRecallMatch[]>({ op: 'memory:recall', payload: { query, limit } })
  }

  listConversations(): Promise<StoredAiConversationSummary[]> {
    return this.send<StoredAiConversationSummary[]>({ op: 'history:list' })
  }

  getConversation(id: string): Promise<StoredAiConversation | null> {
    return this.send<StoredAiConversation | null>({ op: 'history:get', payload: { id } })
  }

  saveConversation(conversation: unknown): Promise<StoredAiConversationSummary[]> {
    return this.send<StoredAiConversationSummary[]>({
      op: 'history:save',
      payload: { conversation }
    })
  }

  deleteConversation(id: string): Promise<StoredAiConversationSummary[]> {
    return this.send<StoredAiConversationSummary[]>({ op: 'history:delete', payload: { id } })
  }

  searchConversations(
    query: string,
    limit?: number,
    excludeId?: string
  ): Promise<ConversationSearchHit[]> {
    return this.send<ConversationSearchHit[]>({
      op: 'history:search',
      payload: { query, limit, excludeId }
    })
  }

  retrieveKnowledge(query: string, module?: string, topK?: number): Promise<KnowledgeSearchResult> {
    return this.send<KnowledgeSearchResult>({
      op: 'knowledge:retrieve',
      payload: { query, module, topK }
    })
  }
}
