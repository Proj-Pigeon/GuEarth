import { parentPort } from 'node:worker_threads'
import { EoqHawdbEngine } from './engine'
import { HawdbError } from './ffi'
import type { HawdbWorkerRequest, HawdbWorkerResponse } from './protocol'

const engine = new EoqHawdbEngine()
let queue: Promise<void> = Promise.resolve()

async function dispatch(request: HawdbWorkerRequest): Promise<unknown> {
  switch (request.op) {
    case 'open': {
      return engine.open(request.payload)
    }
    case 'close': {
      engine.close()
      return true
    }
    case 'status': {
      return engine.status()
    }
    case 'memory:list': {
      return engine.listMemories()
    }
    case 'memory:add': {
      return engine.addMemory(request.payload.content, request.payload.source)
    }
    case 'memory:delete': {
      return engine.deleteMemory(request.payload.id)
    }
    case 'memory:recall': {
      return engine.recallMemories(request.payload.query, request.payload.limit)
    }
    case 'history:list': {
      return engine.listConversations()
    }
    case 'history:get': {
      return engine.getConversation(request.payload.id)
    }
    case 'history:save': {
      return engine.saveConversation(request.payload.conversation)
    }
    case 'history:delete': {
      return engine.deleteConversation(request.payload.id)
    }
    case 'history:search': {
      return engine.searchConversations(request.payload.query, request.payload.limit, request.payload.excludeId)
    }
    case 'knowledge:retrieve': {
      return engine.retrieveKnowledge(request.payload.query, request.payload.module, request.payload.topK)
    }
  }
}

function respond(message: HawdbWorkerResponse): void {
  parentPort?.postMessage(message)
}

if (parentPort) {
  parentPort.on('message', (request: HawdbWorkerRequest) => {
    queue = queue
      .then(async () => {
        try {
          const result = await dispatch(request)
          respond({ id: request.id, ok: true, result })
        } catch (error) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            kind: error instanceof HawdbError ? error.kind : undefined
          })
        }
      })
      .catch(() => {})
  })
}
