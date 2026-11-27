import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from '@typescript/typescript6'
import { test } from 'vite-plus/test'

const aiTelemetrySource = readFileSync(new URL('../src/common/aiTelemetry.ts', import.meta.url), 'utf8')
const aiTelemetryOutput = transpileModule(aiTelemetrySource, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
}).outputText
const aiTelemetryApi = compileFunction(`${aiTelemetryOutput}\nreturn exports`, ['exports'])({})

const responseReaderSource = readFileSync(new URL('../src/main/ai/responseReader.ts', import.meta.url), 'utf8')
const responseReaderOutput = transpileModule(responseReaderSource, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
}).outputText
const responseReaderApi = compileFunction(`${responseReaderOutput}\nreturn exports`, ['exports'])({})

const source = readFileSync(new URL('../src/main/ai/modelTest.ts', import.meta.url), 'utf8')
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
})

function loadTester(respond, key = 'secret-key') {
  const requests = []
  const captures = []
  const dependencies = new Map([
    ['node:crypto', { randomUUID }],
    ['electron', { net: { fetch: async (url, options) => { requests.push({ url, options }); return respond(url, options) } } }],
    ['../../common/aiTelemetry', aiTelemetryApi],
    ['../keyVault', { readProviderKey: () => key }],
    ['./posthog', { captureAiGeneration: (payload) => { captures.push(payload) } }],
    ['./responseReader', responseReaderApi]
  ])
  const load = compileFunction(`${outputText}\nreturn { testModel: exports.testModel }`, ['require', 'exports'])
  const api = load((id) => {
    const dependency = dependencies.get(id)
    if (!dependency) {throw new Error(`Unexpected module dependency: ${id}`)}
    return dependency
  }, {})
  return { ...api, requests, captures }
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

test('HTTP 200 error payloads are treated as failures with redaction and truncation', async () => {
  const tester = loadTester(() => Response.json({
    error: { message: 'model not found' }
  }, { status: 200 }))
  await assert.rejects(tester.testModel(request()), { message: '模型不存在' })

  const longDetail = `bad secret-key ${'x'.repeat(240)}`
  const longTester = loadTester(() => Response.json({
    error: { message: longDetail }
  }, { status: 200 }))
  await assert.rejects(longTester.testModel(request()), (error) => {
    assert.match(error.message, /^响应失败（HTTP 200）：/)
    assert.doesNotMatch(error.message, /secret-key/)
    assert.match(error.message, /\[redacted\]/)
    assert.ok(error.message.length <= '响应失败（HTTP 200）：'.length + 160)
    return true
  })
})

test('oversized streaming responses abort immediately while reading', async () => {
  let pulls = 0
  let canceled = false
  let aborted = false
  const tester = loadTester((_url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true })
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1
        if (pulls >= 50) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(32 * 1024 + 1))
      },
      cancel() {
        canceled = true
      }
    })
    return new Response(stream, { status: 200 })
  })
  await assert.rejects(tester.testModel(request()), { message: '响应内容过大' })
  assert.ok(pulls < 10)
  assert.equal(canceled, true)
  assert.equal(aborted, true)
})

test('model test telemetry normalizes OpenAI and Anthropic outputs and redacts API keys on failure', async () => {
  const openAiTester = loadTester(() => Response.json({
    id: 'chatcmpl-1',
    choices: [{ index: 0, message: { role: 'assistant', content: 'pong' } }]
  }))
  await openAiTester.testModel(request())
  assert.deepEqual(openAiTester.captures[0].output, [{ role: 'assistant', content: 'pong' }])

  const anthropicTester = loadTester(() => Response.json({
    id: 'msg-1',
    content: [{ type: 'text', text: 'pong-anthropic' }]
  }))
  await anthropicTester.testModel(request({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' }))
  assert.deepEqual(anthropicTester.captures[0].output, [{ role: 'assistant', content: 'pong-anthropic' }])

  const failingTester = loadTester(() => new Response('upstream echoed secret-key', { status: 500 }))
  await assert.rejects(failingTester.testModel(request()))
  assert.doesNotMatch(failingTester.captures[0].error, /secret-key/)
  assert.match(failingTester.captures[0].error, /\[redacted\]/)
})
