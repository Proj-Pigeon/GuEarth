import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, writeFile, readdir, rename, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const historyFsUrl = `data:text/javascript,${encodeURIComponent(`
  import { rename as move } from 'node:fs/promises'
  export { readFile, writeFile, unlink } from 'node:fs/promises'
  export const failRenames = new Map()
  export async function rename(from, to) {
    if (failRenames.has(to)) {
      const remaining = failRenames.get(to)
      if (remaining === 0) {
        failRenames.delete(to)
        throw Object.assign(new Error('locked'), { code: 'EIO' })
      }
      failRenames.set(to, remaining - 1)
    }
    await move(from, to)
  }
`)}`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'fs/promises' && context.parentURL.endsWith('/jsonStore.ts')) return nextResolve(historyFsUrl, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { failRenames } = await import(historyFsUrl)
const { AiChatHistoryStore } = await import('../src/main/ai/chatHistoryStore.ts')
const { AiMemoryStore } = await import('../src/main/ai/memoryStore.ts')
const { serialQueue, flushJsonWrites } = await import('../src/main/jsonStore.ts')

function conversation(id, updatedAt = 1, content = '地理问题') {
  return {
    id, title: id, createdAt: 1, updatedAt,
    messages: [
      { id: 'u1', role: 'user', content, parts: [], status: 'done', error: '' },
      { id: 'a1', role: 'assistant', content: '回答', parts: [{ kind: 'reasoning', id: 'r1', text: '推理', ms: 12, startedAt: 1 }, { kind: 'text', text: '回答' }], status: 'error', error: '连接中断' }
    ],
    compression: { summary: '历史摘要', coveredMessageIds: ['u1'] }
  }
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'guearth-history-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { path: join(directory, 'history.json'), directory }
}

test('migrates legacy history preserving messages, compression and the original file', async (t) => {
  const { path } = await fixture(t)
  const original = JSON.stringify([conversation('older', 1), conversation('newer', 2)])
  await writeFile(path, original)
  const store = new AiChatHistoryStore()
  await store.init(path)
  assert.deepEqual(store.list().map((item) => item.id), ['newer', 'older'])
  assert.equal('messages' in store.list()[0], false)
  assert.deepEqual(await store.get('newer'), conversation('newer', 2))
  assert.equal(await readFile(path, 'utf8'), original)
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(await reopened.get('older'), conversation('older'))
})

test('loads only the selected conversation body and rejects unknown paths', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('healthy'))
  await store.save(conversation('broken', 2))
  const index = JSON.parse(await readFile(join(`${path}.d`, 'index.json'), 'utf8'))
  await writeFile(join(`${path}.d`, index.conversations.find((item) => item.id === 'broken').file), '{')
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.equal(reopened.list().length, 2)
  assert.deepEqual(await reopened.get('healthy'), conversation('healthy'))
  await assert.rejects(reopened.get('broken'), SyntaxError)
  assert.equal(await reopened.get('../index'), null)
  await assert.rejects(reopened.save(conversation('../index')))
})

test('serializes concurrent updates and deletes, retaining the last committed body', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(conversation('same', i, `question-${i}`))))
  assert.equal((await store.get('same')).messages[0].content, 'question-11')
  assert.equal((await readdir(`${path}.d`)).length, 3)
  await Promise.all([store.save(conversation('same', 12)), store.delete('same'), store.save(conversation('replacement', 13))])
  assert.deepEqual(store.list().map((item) => item.id), ['replacement'])
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(reopened.list(), store.list())
})

test('failed manifest writes preserve the previously committed conversation', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('same'))
  const indexPath = join(`${path}.d`, 'index.json')
  await rename(indexPath, `${indexPath}.saved`)
  await mkdir(indexPath)
  await assert.rejects(store.save(conversation('same', 2, 'uncommitted')))
  assert.deepEqual(await store.get('same'), conversation('same'))
  await rm(indexPath, { recursive: true })
  await rename(`${indexPath}.saved`, indexPath)
  await store.save(conversation('same', 3, 'committed'))
  assert.equal((await store.get('same')).messages[0].content, 'committed')
  assert.equal((await readdir(`${path}.d`)).length, 3)
})

test('retention removes evicted bodies and keeps exactly fifty summaries', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await Promise.all(Array.from({ length: 53 }, (_, i) => store.save(conversation(`c${i}`, i))))
  assert.equal(store.list().length, 50)
  assert.equal(await store.get('c0'), null)
  assert.equal(store.list()[0].id, 'c52')
  assert.equal((await readdir(`${path}.d`)).length, 52)
})

test('recovers a corrupt manifest and preserves its original bytes', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('recover'))
  await writeFile(join(`${path}.d`, 'index.json'), '{broken')
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(await reopened.get('recover'), conversation('recover'))
  const backup = (await readdir(`${path}.d`)).find((file) => file.endsWith('.bak'))
  assert.equal(await readFile(join(`${path}.d`, backup), 'utf8'), '{broken')
})

test('does not migrate deleted legacy conversations again when the index is missing', async (t) => {
  const { path } = await fixture(t)
  const original = JSON.stringify([conversation('private'), conversation('retained', 2)])
  await writeFile(path, original)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.delete('private')
  await rm(join(`${path}.d`, 'index.json'))
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(reopened.list().map((item) => item.id), ['retained'])
  assert.equal(await reopened.get('private'), null)
  assert.deepEqual(await reopened.get('retained'), conversation('retained', 2))
  assert.equal(await readFile(path, 'utf8'), original)
})

test('recovery excludes deleted, superseded, evicted and uncommitted residual bodies', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('private'))
  const index = JSON.parse(await readFile(join(`${path}.d`, 'index.json'), 'utf8'))
  const deletedFile = index.conversations[0].file
  await store.delete('private')
  await store.save(conversation('updated', 2, 'old private text'))
  const oldIndex = JSON.parse(await readFile(join(`${path}.d`, 'index.json'), 'utf8'))
  const supersededFile = oldIndex.conversations[0].file
  await store.save(conversation('updated', 100, 'current text'))
  await store.save(conversation('evicted', 0))
  const evictionIndex = JSON.parse(await readFile(join(`${path}.d`, 'index.json'), 'utf8'))
  const evictedFile = evictionIndex.conversations.find((item) => item.id === 'evicted').file
  for (let i = 0; i < 49; i++) await store.save(conversation(`retained-${i}`, 3 + i))
  const expected = store.list()
  await writeFile(join(`${path}.d`, deletedFile), JSON.stringify(conversation('private')))
  await writeFile(join(`${path}.d`, supersededFile), JSON.stringify(conversation('updated', 200, 'old private text')))
  await writeFile(join(`${path}.d`, evictedFile), JSON.stringify(conversation('evicted', 300)))
  await writeFile(join(`${path}.d`, 'uncommitted.body.json'), JSON.stringify(conversation('uncommitted', 400)))
  await writeFile(join(`${path}.d`, 'index.json'), '{broken')
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(reopened.list(), expected)
  assert.equal(await reopened.get('private'), null)
  assert.equal(await reopened.get('evicted'), null)
  assert.equal(await reopened.get('uncommitted'), null)
  assert.equal((await reopened.get('updated')).messages[0].content, 'current text')
})

test('a failed recovery precommit preserves the committed index and body', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('retained'))
  const indexPath = join(`${path}.d`, 'index.json')
  const committed = await readFile(indexPath, 'utf8')
  failRenames.set(join(`${path}.d`, 'recovery.json'), 0)
  await assert.rejects(store.delete('retained'), { code: 'EIO' })
  assert.equal(await readFile(indexPath, 'utf8'), committed)
  assert.deepEqual(await store.get('retained'), conversation('retained'))
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(await reopened.get('retained'), conversation('retained'))
})

test('a failed recovery finalization cannot restore a successfully deleted conversation', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('private'))
  await store.save(conversation('retained', 2))
  const index = JSON.parse(await readFile(join(`${path}.d`, 'index.json'), 'utf8'))
  const privateFile = index.conversations.find((item) => item.id === 'private').file
  failRenames.set(join(`${path}.d`, 'recovery.json'), 1)
  await assert.rejects(store.delete('private'))
  assert.deepEqual(await store.get('private'), conversation('private'))
  await writeFile(join(`${path}.d`, privateFile), JSON.stringify(conversation('private')))
  await writeFile(join(`${path}.d`, 'index.json'), '{broken')
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(reopened.list().map((item) => item.id), ['retained', 'private'])
  assert.deepEqual(await reopened.get('private'), conversation('private'))
  assert.deepEqual(await reopened.get('retained'), conversation('retained', 2))
})

test('a failed recovery finalization rolls back a replacement commit', async (t) => {
  const { path } = await fixture(t)
  const store = new AiChatHistoryStore()
  await store.init(path)
  await store.save(conversation('same'))
  const recoveryPath = join(`${path}.d`, 'recovery.json')
  failRenames.set(recoveryPath, 1)
  await assert.rejects(store.save(conversation('same', 2, 'uncommitted')))
  assert.equal((await store.get('same')).messages[0].content, '地理问题')
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.equal((await reopened.get('same')).messages[0].content, '地理问题')
})

test('a failed legacy migration remains retryable on the next launch', async (t) => {
  const { path } = await fixture(t)
  await writeFile(path, JSON.stringify([conversation('legacy')]))
  const directory = `${path}.d`
  const indexPath = join(directory, 'index.json')
  const first = new AiChatHistoryStore()
  failRenames.set(indexPath, 0)
  await assert.rejects(first.init(path))
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(await reopened.get('legacy'), conversation('legacy'))
})

test('existing history without trustworthy manifests does not scan bodies or repeat migration', async (t) => {
  for (const state of ['missing', 'corrupt', 'unsupported']) {
    const { path } = await fixture(t)
    const store = new AiChatHistoryStore()
    await writeFile(path, JSON.stringify([conversation('private')]))
    await store.init(path)
    await store.delete('private')
    await writeFile(join(`${path}.d`, 'private.residual.json'), JSON.stringify(conversation('private')))
    await rm(join(`${path}.d`, 'index.json'))
    const recoveryPath = join(`${path}.d`, 'recovery.json')
    if (state === 'missing') await rm(recoveryPath)
    else await writeFile(recoveryPath, state === 'corrupt' ? '{broken' : JSON.stringify({ version: 2, conversations: [] }))
    const reopened = new AiChatHistoryStore()
    await reopened.init(path)
    assert.deepEqual(reopened.list(), [])
    assert.equal(await reopened.get('private'), null)
  }
})

test('upgrades a valid v1 index and refuses a recovered body with a different ID', async (t) => {
  const { path } = await fixture(t)
  await mkdir(`${path}.d`)
  const retained = conversation('retained')
  const { messages, compression, ...entry } = retained
  await writeFile(join(`${path}.d`, 'index.json'), JSON.stringify({ version: 1, conversations: [entry] }))
  await writeFile(join(`${path}.d`, 'retained.json'), JSON.stringify(retained))
  const store = new AiChatHistoryStore()
  await store.init(path)
  assert.deepEqual(await store.get('retained'), retained)
  await rm(join(`${path}.d`, 'index.json'))
  await writeFile(join(`${path}.d`, 'retained.json'), JSON.stringify(conversation('private')))
  const reopened = new AiChatHistoryStore()
  await reopened.init(path)
  assert.deepEqual(reopened.list(), [])
})

test('concurrent memory changes persist without dropping earlier changes', async (t) => {
  const { directory } = await fixture(t)
  const path = join(directory, 'memories.json')
  const store = new AiMemoryStore()
  await store.init(path)
  const added = await Promise.all(Array.from({ length: 10 }, (_, i) => store.add(`memory-${i}`, 'user')))
  await Promise.all([store.delete(added[0].id), store.add('last', 'agent')])
  const reopened = new AiMemoryStore()
  await reopened.init(path)
  assert.equal(reopened.list().length, 10)
  assert.equal(reopened.list().some((item) => item.id === added[0].id), false)
  assert.equal(reopened.list().at(-1).content, 'last')
})

test('shutdown flush waits for queued operations after an earlier failure', async () => {
  const enqueue = serialQueue()
  const order = []
  const rejected = enqueue(async () => { throw new Error('failed') })
  await assert.rejects(rejected)
  const saved = enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    order.push('saved')
  })
  await flushJsonWrites()
  assert.deepEqual(order, ['saved'])
  await saved
})
