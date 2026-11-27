import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, chmod, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'vite-plus/test'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw error
    }
  }
})

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const { parseLosslessJson, stringifyParameters } = await import('../src/main/ai/hawdb/jsonCodec.ts')
const {
  buildConversationSearchText,
  buildConversationSnippet,
  buildKnowledgeSearchText,
  extractKnowledgeGraphEdges
} = await import('../src/main/ai/hawdb/graphBuilder.ts')
const { findHawdbBinary, hawdbBinaryFileName, hawdbBinaryPathFor } = await import('../src/main/ai/hawdb/paths.ts')
const { EoqHawdbEngine } = await import('../src/main/ai/hawdb/engine.ts')
const { EoqHawdbClient } = await import('../src/main/ai/hawdb/client.ts')
const { AiMemoryStore } = await import('../src/main/ai/memoryStore.ts')
const { AiChatHistoryStore } = await import('../src/main/ai/chatHistoryStore.ts')

function loadKnowledgeFixtures() {
  const files = ['entries.json', 'entries-expanded.json', 'entries-curriculum.json', 'entries-final.json', 'entries-human.json']
  return files.flatMap((file) => JSON.parse(readFileSync(resolve(repoRoot, 'src/main/ai/knowledge', file), 'utf8')))
}

function sampleConversation(id, updatedAt, title, userText, summary) {
  return {
    id,
    title,
    createdAt: updatedAt - 10,
    updatedAt,
    messages: [
      { id: `${id}-u1`, role: 'user', content: userText, parts: [], status: 'done', error: '' },
      { id: `${id}-a1`, role: 'assistant', content: `关于「${title}」的详细讲解与地理坐标`, parts: [{ kind: 'text', text: `关于「${title}」的详细讲解与地理坐标` }], status: 'done', error: '' }
    ],
    ...(summary ? { compression: { summary, coveredMessageIds: [`${id}-u1`] } } : {})
  }
}

test('jsonCodec preserves bigints, binary payloads and rejects invalid parameters', () => {
  const big = 9_007_199_254_740_993n
  assert.equal(stringifyParameters({ id: big, ok: true, empty: null }), '{"id":9007199254740993,"ok":true,"empty":null}')
  assert.equal(parseLosslessJson('{"id":9007199254740993,"small":42}').id, big)
  assert.equal(parseLosslessJson('{"id":9007199254740993,"small":42}').small, 42)
  assert.equal(stringifyParameters(new Uint8Array([1, 2, 3])), '{"$binary":"AQID"}')
  assert.throws(() => stringifyParameters(Number.NaN), TypeError)
  assert.throws(() => stringifyParameters(Number.POSITIVE_INFINITY), TypeError)
  const cyclic = {}
  cyclic.self = cyclic
  assert.throws(() => stringifyParameters(cyclic), TypeError)
})

test('graphBuilder builds search text, snippets and extracts contrast and related edges', () => {
  const entries = loadKnowledgeFixtures()
  const edges = extractKnowledgeGraphEdges(entries)
  assert.ok(edges.length > 50)
  assert.ok(edges.some((edge) => edge.relation === 'CONTRASTS_WITH'))
  assert.ok(edges.some((edge) => edge.relation === 'RELATED_TO'))
  const karst = entries.find((entry) => entry.id === 'landform-karst')
  assert.ok(karst)
  assert.ok(buildKnowledgeSearchText(karst).includes('喀斯特地貌'))
  const conv = sampleConversation('c1', 100, '青藏高原气候', '青藏高原高寒气候成因是什么？', '总结了海拔与大气保温作用')
  assert.ok(buildConversationSearchText(conv).includes('大气保温作用'))
  assert.ok(buildConversationSnippet(conv, '高寒气候').includes('高寒气候'))
})

test('paths helper resolves platform library filenames for dev and packaged builds', () => {
  assert.equal(hawdbBinaryFileName('win32'), 'hawdb_ffi.dll')
  assert.equal(hawdbBinaryFileName('darwin'), 'libhawdb_ffi.dylib')
  assert.equal(hawdbBinaryFileName('linux'), 'libhawdb_ffi.so')
  assert.ok(hawdbBinaryPathFor('/app', '/res', true, 'linux').endsWith('libhawdb_ffi.so'))
  assert.ok(hawdbBinaryPathFor('/app', '/res', false, 'win32').endsWith('hawdb_ffi.dll'))
})

const nativeLibraryPath = findHawdbBinary(repoRoot, join(repoRoot, 'resources'), false)

test('EoqHawdbEngine persists memories, conversations, BM25 recall and Cypher knowledge graph across restarts', async (t) => {
  if (!nativeLibraryPath) {
    t.skip('HawDB native binary not fetched')
    return
  }
  const baseDir = await mkdtemp(join(repoRoot, '.tmp-hawdb-test-'))
  t.onTestFinished(() => rm(baseDir, { recursive: true, force: true }))

  const dbRoot = join(baseDir, 'eoq-hawdb')
  const legacyMemoriesPath = join(baseDir, 'ai-memories.json')
  const legacyHistoryPath = join(baseDir, 'ai-chat-history.json')
  await writeFile(
    legacyMemoriesPath,
    JSON.stringify([
      { id: 'm-legacy-1', content: '用户是高中地理老师，偏好结合高考真题讲解', source: 'user', createdAt: 1000 }
    ])
  )
  await writeFile(
    legacyHistoryPath,
    JSON.stringify([
      sampleConversation('conv-legacy', 2000, '桂林喀斯特案例', '带我看看桂林漓江喀斯特峰林', '讨论了桂林漓江坐标与溶蚀成因')
    ])
  )

  const entries = loadKnowledgeFixtures()
  const engine = new EoqHawdbEngine()
  try {
    const opened = await engine.open({
      libraryPath: nativeLibraryPath,
      dbRoot,
      legacyMemoriesPath,
      legacyHistoryPath,
      knowledgeEntries: entries,
      knowledgeHash: 'fixture-v1'
    })
    assert.equal(opened.status.ready, true)
    assert.equal(opened.status.knowledgeCount, entries.length)
    assert.equal(opened.memories.length, 1)
    assert.equal(opened.memories[0].id, 'm-legacy-1')
    assert.equal(opened.conversations.length, 1)
    assert.equal(opened.conversations[0].id, 'conv-legacy')

    const added = await engine.addMemory('常用关注地区是青藏高原和云贵高原', 'agent')
    assert.equal(engine.listMemories().length, 2)
    const recalled = engine.recallMemories('青藏高原', 5)
    assert.ok(recalled.some((item) => item.id === added.id))

    const savedList = await engine.saveConversation(
      sampleConversation('conv-2', 3000, '河西走廊绿洲农业', '分析河西走廊绿洲农业的水源条件')
    )
    assert.deepEqual(savedList.map((item) => item.id), ['conv-2', 'conv-legacy'])

    const hits = engine.searchConversations('桂林漓江溶蚀', 5, 'conv-2')
    assert.ok(hits.length > 0)
    assert.equal(hits[0].id, 'conv-legacy')
    assert.equal(hits[0].compressionSummary, '讨论了桂林漓江坐标与溶蚀成因')

    const knowledge = engine.retrieveKnowledge('喀斯特地貌形成原因', undefined, 3)
    assert.ok(knowledge.matches.length > 0)
    assert.equal(knowledge.matches[0].id, 'landform-karst')
    assert.ok(Array.isArray(knowledge.matches[0].relatedConcepts))
    assert.ok(knowledge.matches[0].relatedConcepts.length > 0)
  } finally {
    engine.close()
  }

  const reopenedEngine = new EoqHawdbEngine()
  try {
    const reopened = await reopenedEngine.open({
      libraryPath: nativeLibraryPath,
      dbRoot,
      legacyMemoriesPath,
      legacyHistoryPath,
      knowledgeEntries: entries,
      knowledgeHash: 'fixture-v1'
    })
    assert.equal(reopened.memories.length, 2)
    assert.deepEqual(reopened.conversations.map((item) => item.id), ['conv-2', 'conv-legacy'])
    assert.equal(await reopenedEngine.deleteMemory('m-legacy-1'), true)
    assert.equal(reopenedEngine.listMemories().length, 1)
    const remaining = await reopenedEngine.deleteConversation('conv-legacy')
    assert.deepEqual(remaining.map((item) => item.id), ['conv-2'])
  } finally {
    reopenedEngine.close()
  }
})

test('EoqHawdbEngine falls back cleanly to memory-snapshot under restricted directories and persists via snapshot.json', async (t) => {
  if (!nativeLibraryPath) {
    t.skip('HawDB native binary not fetched')
    return
  }
  const baseDir = await mkdtemp(join(tmpdir(), 'guearth-hawdb-snap-'))
  t.onTestFinished(() => rm(baseDir, { recursive: true, force: true }))
  const dbRoot = join(baseDir, 'eoq-hawdb')
  if (process.platform !== 'win32') {
    await mkdir(join(dbRoot, 'db'), { recursive: true })
    await chmod(join(dbRoot, 'db'), 0o500).catch(() => {})
    t.onTestFinished(() => chmod(join(dbRoot, 'db'), 0o700).catch(() => {}))
  }
  const entries = loadKnowledgeFixtures().slice(0, 12)

  const engine = new EoqHawdbEngine()
  try {
    const opened = await engine.open({
      libraryPath: nativeLibraryPath,
      dbRoot,
      knowledgeEntries: entries,
      knowledgeHash: 'snap-v1'
    })
    assert.equal(opened.status.ready, true)
    assert.equal(opened.status.storageMode, 'memory-snapshot')
    await engine.addMemory('偏好地图对比教学法', 'user')
    await engine.saveConversation(sampleConversation('snap-c1', 5000, '板块边界', '喜马拉雅山脉的板块成因'))
    assert.ok(existsSync(join(dbRoot, 'snapshot.json')))
  } finally {
    engine.close()
  }

  const reopened = new EoqHawdbEngine()
  try {
    const state = await reopened.open({
      libraryPath: nativeLibraryPath,
      dbRoot,
      knowledgeEntries: entries,
      knowledgeHash: 'snap-v1'
    })
    assert.equal(state.memories.length, 1)
    assert.equal(state.memories[0].content, '偏好地图对比教学法')
    assert.equal(state.conversations.length, 1)
    assert.equal(state.conversations[0].id, 'snap-c1')
    const found = reopened.searchConversations('喜马拉雅山脉', 5)
    assert.equal(found[0]?.id, 'snap-c1')
  } finally {
    reopened.close()
  }
})

test('AiMemoryStore and AiChatHistoryStore work end-to-end when attached to EoqHawdbClient', async (t) => {
  if (!nativeLibraryPath) {
    t.skip('HawDB native binary not fetched')
    return
  }
  const baseDir = await mkdtemp(join(repoRoot, '.tmp-hawdb-client-'))
  t.onTestFinished(() => rm(baseDir, { recursive: true, force: true }))
  await mkdir(baseDir, { recursive: true })

  const client = new EoqHawdbClient({ inProcess: true })
  try {
    const opened = await client.open({
      libraryPath: nativeLibraryPath,
      dbRoot: join(baseDir, 'eoq-hawdb'),
      knowledgeEntries: loadKnowledgeFixtures().slice(0, 20),
      knowledgeHash: 'client-v1'
    })
    const memoryStore = new AiMemoryStore()
    const historyStore = new AiChatHistoryStore()
    memoryStore.attachHawdb(client, opened.memories)
    historyStore.attachHawdb(client, opened.conversations)

    const savedMemory = await memoryStore.add('讲授高一必修一自然地理', 'user')
    assert.equal(memoryStore.list().length, 1)
    const recalled = await memoryStore.recall('自然地理', 5)
    assert.equal(recalled[0]?.id, savedMemory.id)

    await historyStore.save(sampleConversation('c-store-1', 6000, '黄土高原水土流失', '黄土高原沟壑纵横的原因'))
    assert.equal(historyStore.list().length, 1)
    assert.equal((await historyStore.get('c-store-1'))?.title, '黄土高原水土流失')
    const searchHits = await historyStore.search('黄土高原沟壑', 5)
    assert.equal(searchHits[0]?.id, 'c-store-1')

    assert.equal(await memoryStore.delete(savedMemory.id), true)
    assert.equal(memoryStore.list().length, 0)
    await historyStore.delete('c-store-1')
    assert.equal(historyStore.list().length, 0)
  } finally {
    await client.close()
  }
})

test('EoqHawdbClient communicates with the compiled worker_threads bundle', async (t) => {
  const compiledWorker = resolve(repoRoot, 'out/main/hawdbWorker.js')
  if (!nativeLibraryPath || !existsSync(compiledWorker)) {
    t.skip('HawDB native binary or compiled worker bundle not present')
    return
  }
  const baseDir = await mkdtemp(join(repoRoot, '.tmp-hawdb-worker-'))
  t.onTestFinished(() => rm(baseDir, { recursive: true, force: true }))

  const client = new EoqHawdbClient({ workerPath: compiledWorker })
  try {
    const opened = await client.open({
      libraryPath: nativeLibraryPath,
      dbRoot: join(baseDir, 'eoq-hawdb'),
      knowledgeEntries: loadKnowledgeFixtures().slice(0, 25),
      knowledgeHash: 'worker-v1'
    })
    assert.equal(opened.status.ready, true)
    const memory = await client.addMemory('工作线程写入的地理教学偏好', 'user')
    const recalled = await client.recallMemories('地理教学偏好', 3)
    assert.equal(recalled[0]?.id, memory.id)
    const knowledge = await client.retrieveKnowledge('喀斯特地貌', undefined, 2)
    assert.ok(knowledge.matches.length > 0)
  } finally {
    await client.close()
  }
})
