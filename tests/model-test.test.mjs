import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/main/ai/modelTest.ts', import.meta.url), 'utf8')
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
})

function loadTester(respond, key = 'secret-key') {
  const requests = []
  const dependencies = new Map([
    ['electron', { net: { fetch: async (url, options) => { requests.push({ url, options }); return respond(url, options) } } }],
    ['../keyVault', { readProviderKey: () => key }]
  ])
  const load = compileFunction(`${outputText}\nreturn { testModel: exports.testModel }`, ['require', 'exports'])
  const api = load((id) => {
    const dependency = dependencies.get(id)
    if (!dependency) throw new Error(`Unexpected module dependency: ${id}`)
    return dependency
  }, {})
  return { ...api, requests }
}

const request = (overrides = {}) => ({
  id: 'openai',
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  modelId: 'gpt-test',
  ...overrides
})

test('OpenAI response test posts a minimal chat request', async () => {
  const tester = loadTester(() => Response.json({ id: 'chatcmpl-test', choices: [] }))
  const result = await tester.testModel(request())
  assert.ok(result.latencyMs >= 0)
  assert.equal(tester.requests[0].url, 'https://api.example.com/v1/chat/completions')
  assert.equal(tester.requests[0].options.headers.Authorization, 'Bearer secret-key')
  assert.equal(JSON.parse(tester.requests[0].options.body).model, 'gpt-test')
})

test('Anthropic response test uses messages and Anthropic headers', async () => {
  const tester = loadTester(() => Response.json({ id: 'msg-test', content: [] }))
  await tester.testModel(request({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' }))
  assert.equal(tester.requests[0].url, 'https://api.anthropic.com/v1/messages')
  assert.equal(tester.requests[0].options.headers['x-api-key'], 'secret-key')
  assert.equal(tester.requests[0].options.headers['anthropic-version'], '2023-06-01')
})

test('insufficient balance is reported in plain language', async () => {
  const tester = loadTester(() => Response.json({
    error: { message: 'Insufficient Balance', type: 'insufficient_balance_error', code: 'invalid_request_error' }
  }, { status: 402 }))
  await assert.rejects(tester.testModel(request()), { message: '账户余额不足或额度已用尽' })
})

test('authentication failures never include the API key', async () => {
  const tester = loadTester(() => new Response('rejected secret-key', { status: 401 }))
  await assert.rejects(tester.testModel(request()), (error) => {
    assert.match(error.message, /API Key/)
    assert.doesNotMatch(error.message, /secret-key/)
    return true
  })
})

test('unknown failures keep the status and redact the API key', async () => {
  const tester = loadTester(() => new Response('upstream secret-key', { status: 500 }))
  await assert.rejects(tester.testModel(request()), (error) => {
    assert.match(error.message, /HTTP 500/)
    assert.doesNotMatch(error.message, /secret-key/)
    assert.match(error.message, /\[redacted\]/)
    return true
  })
})
