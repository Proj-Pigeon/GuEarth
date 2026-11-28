import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'

import { ModuleKind, ScriptTarget, transpileModule } from '@typescript/typescript6'
import { test } from 'vite-plus/test'

import * as tileMirror from '../src/common/tileMirror.ts'

const responseReaderSource = readFileSync(
  new URL('../src/main/ai/responseReader.ts', import.meta.url),
  'utf8'
)
const responseReaderOutput = transpileModule(responseReaderSource, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
}).outputText
const responseReaderApi = compileFunction(`${responseReaderOutput}\nreturn exports`, ['exports'])(
  {}
)

const source = readFileSync(new URL('../src/main/ai/modelImporter.ts', import.meta.url), 'utf8')
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
})

function loadImporter(respond, key = 'secret-key') {
  const requests = []
  const dependencies = new Map([
    [
      'electron',
      {
        net: {
          fetch: async (url, options) => {
            requests.push({ url, options })
            return respond(url, options)
          }
        }
      }
    ],
    ['../../common/tileMirror', tileMirror],
    ['../keyVault', { readProviderKey: () => key }],
    ['./responseReader', responseReaderApi]
  ])
  const load = compileFunction(
    `${outputText}\nreturn { importModels: exports.importModels, modelImporterInternals: exports.modelImporterInternals }`,
    ['require', 'exports']
  )
  const api = load(id => {
    const dependency = dependencies.get(id)
    if (!dependency) {
      throw new Error(`Unexpected module dependency: ${id}`)
    }
    return dependency
  }, {})
  return { ...api, requests }
}

const response = (body, status = 200) => Response.json(body, { status })
const catalog = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: {
      'gpt-5-mini': {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['minimal', 'low', 'medium', 'high'] }],
        limit: { context: 400_000 },
        modalities: { input: ['text', 'image'] }
      },
      'plain-model': {
        id: 'plain-model',
        name: 'Plain',
        reasoning: false,
        limit: { context: 8192 },
        modalities: { input: ['text'] }
      }
    }
  }
}

function request(overrides = {}) {
  return {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.example.com/v1',
    models: [],
    ...overrides
  }
}

test('OpenAI model import appends one models path and maps matched capabilities', async () => {
  const importer = loadImporter(url => {
    if (url === 'https://models.dev/api.json') {
      return response(catalog)
    }
    assert.equal(url, 'https://api.example.com/v1/models')
    return response({ data: [{ id: 'gpt-5-mini' }, { id: 'unmatched' }] })
  })
  const result = await importer.importModels(request())
  assert.equal(result.models.length, 2)
  assert.deepEqual(result.models[0], {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    contextWindow: 400_000,
    streaming: true,
    vision: true,
    thinking: true,
    thinkingLevel: 'high',
    enabled: true,
    matched: true,
    failureReason: undefined,
    existing: false
  })
  assert.equal(result.models[1].matched, false)
  assert.match(result.models[1].failureReason, /没有精确匹配/)
  assert.equal(importer.requests[0].options.headers.Authorization, 'Bearer secret-key')
})

test('OpenAI host-only URL receives v1 models path', async () => {
  const importer = loadImporter(url => {
    if (url === 'https://models.dev/api.json') {
      return response({})
    }
    assert.equal(url, 'https://api.example.com/v1/models')
    return response({ data: [] })
  })
  await importer.importModels(request({ baseUrl: 'https://api.example.com/' }))
})

test('Anthropic import follows after_id cursor pagination', async () => {
  const urls = []
  const importer = loadImporter(url => {
    urls.push(url)
    if (url === 'https://models.dev/api.json') {
      return response({
        anthropic: {
          id: 'anthropic',
          name: 'Anthropic',
          models: {
            'claude-1': {
              id: 'claude-1',
              name: 'Claude 1',
              reasoning: false,
              limit: { context: 10_000 }
            },
            'claude-2': {
              id: 'claude-2',
              name: 'Claude 2',
              reasoning: false,
              limit: { context: 20_000 }
            }
          }
        }
      })
    }
    if (url === 'https://api.anthropic.com/v1/models') {
      return response({ data: [{ id: 'claude-1' }], has_more: true, last_id: 'claude-1' })
    }
    return response({ data: [{ id: 'claude-2' }], has_more: false, last_id: 'claude-2' })
  })
  const result = await importer.importModels(
    request({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' })
  )
  assert.deepEqual(urls.slice(0, 3), [
    'https://api.anthropic.com/v1/models',
    'https://models.dev/api.json',
    'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-1'
  ])
  assert.equal(result.models.length, 2)
  assert.equal(importer.requests[0].options.headers['x-api-key'], 'secret-key')
  assert.equal(importer.requests[0].options.headers['anthropic-version'], '2023-06-01')
})

test('model group compatibility matches the model name after the first slash', async () => {
  const importer = loadImporter(url => {
    if (url === 'https://models.dev/api.json') {
      return response(catalog)
    }
    return response({ data: [{ id: 'auto/gpt-5-mini' }] })
  })
  const strict = await importer.importModels(request())
  assert.equal(strict.models[0].matched, false)
  const compatible = await importer.importModels(request({ modelGroupCompat: true }))
  assert.equal(compatible.models[0].matched, true)
  assert.equal(compatible.models[0].label, 'GPT-5 Mini')
  assert.equal(compatible.models[0].contextWindow, 400_000)
})

test('duplicate model ids prefer the official provider metadata', async () => {
  const duplicated = {
    openai: {
      id: 'openai',
      name: 'OpenAI',
      models: {
        'gpt-6.1-sol': {
          id: 'gpt-6.1-sol',
          name: 'GPT-6.1 Sol',
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
          limit: { context: 1_050_000 },
          modalities: { input: ['text', 'image'] },
          canonical_model_id: 'openai/gpt-6.1-sol'
        }
      }
    },
    reseller: {
      id: 'reseller',
      name: 'Reseller',
      models: {
        'gpt-6.1-sol': {
          id: 'gpt-6.1-sol',
          name: 'GPT-6.1 Sol',
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
          limit: { context: 640_000 },
          modalities: { input: ['text', 'image'] },
          canonical_model_id: 'openai/gpt-6.1-sol'
        }
      }
    }
  }
  const importer = loadImporter(url => {
    if (url === 'https://models.dev/api.json') {
      return response(duplicated)
    }
    return response({ data: [{ id: 'auto/gpt-6.1-sol' }] })
  })
  const result = await importer.importModels(
    request({ baseUrl: 'https://sub.example.com/v1', modelGroupCompat: true })
  )
  assert.equal(result.models[0].matched, true)
  assert.equal(result.models[0].contextWindow, 1_050_000)
})

test('model group compatibility resolves reseller-only duplicates', async () => {
  const resellers = {
    alpha: {
      id: 'alpha',
      name: 'Alpha',
      models: {
        'reseller-model': {
          id: 'reseller-model',
          name: 'Reseller Model',
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
          limit: { context: 1_000_000 },
          modalities: { input: ['text', 'image'] },
          canonical_model_id: 'vendor/reseller-model'
        }
      }
    },
    beta: {
      id: 'beta',
      name: 'Beta',
      models: {
        'reseller-model': {
          id: 'reseller-model',
          name: 'Reseller Model',
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
          limit: { context: 1_048_576 },
          modalities: { input: ['text', 'image'] },
          canonical_model_id: 'vendor/reseller-model'
        }
      }
    }
  }
  const importer = loadImporter(url => {
    if (url === 'https://models.dev/api.json') {
      return response(resellers)
    }
    return response({ data: [{ id: 'auto/reseller-model' }] })
  })
  const strict = await importer.importModels(request())
  assert.equal(strict.models[0].matched, false)
  const compatible = await importer.importModels(request({ modelGroupCompat: true }))
  assert.equal(compatible.models[0].matched, true)
  assert.equal(compatible.models[0].contextWindow, 1_048_576)
})

test('model ids can be re-matched without requesting the provider list again', async () => {
  const requests = []
  const importer = loadImporter(url => {
    requests.push(url)
    return response(catalog)
  }, '')
  const result = await importer.importModels(
    request({
      ids: ['auto/gpt-5-mini'],
      modelGroupCompat: true
    })
  )
  assert.deepEqual(requests, ['https://models.dev/api.json'])
  assert.equal(result.models[0].matched, true)
})

test('effort mapping uses high or the highest available lower level', () => {
  const { modelImporterInternals } = loadImporter(() => response({ data: [] }))
  assert.deepEqual(
    modelImporterInternals.effortLevel([{ type: 'effort', values: ['low', 'medium', 'high'] }]),
    { thinking: true, thinkingLevel: 'high' }
  )
  assert.deepEqual(
    modelImporterInternals.effortLevel([{ type: 'effort', values: ['minimal', 'low'] }]),
    { thinking: true, thinkingLevel: 'low' }
  )
  assert.equal(
    modelImporterInternals.effortLevel([{ type: 'budget_tokens', min: 1024 }]).thinking,
    false
  )
})

test('import errors do not include the provider key', async () => {
  const importer = loadImporter(() => {
    throw new Error('upstream failed')
  })
  await assert.rejects(importer.importModels(request()), error => {
    assert.doesNotMatch(error.message, /secret-key/)
    return true
  })
})

test('Anthropic import rejects stalled pagination cursors and page overflow', async () => {
  const stalled = loadImporter(url => {
    if (url.includes('after_id=cursor-1')) {
      return response({ data: [{ id: 'm2' }], has_more: true, last_id: 'cursor-1' })
    }
    return response({ data: [{ id: 'm1' }], has_more: true, last_id: 'cursor-1' })
  })
  await assert.rejects(
    stalled.importModels(request({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' })),
    {
      message: 'Anthropic 模型列表分页游标未推进'
    }
  )

  let page = 0
  const overflow = loadImporter(() => {
    page += 1
    return response({ data: [{ id: `m-${page}` }], has_more: true, last_id: `cursor-${page}` })
  })
  await assert.rejects(
    overflow.importModels(request({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' })),
    {
      message: 'Anthropic 模型列表页数超出上限'
    }
  )
})

test('oversized provider model responses abort while reading the stream', async () => {
  let pulls = 0
  let canceled = false
  let aborted = false
  const importer = loadImporter((_url, options) => {
    options.signal.addEventListener('abort', () => {
      aborted = true
    })
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1
        if (pulls >= 50) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1))
      },
      cancel() {
        canceled = true
      }
    })
    return new Response(stream, { status: 200 })
  })
  await assert.rejects(importer.importModels(request()), { message: '模型列表响应过大' })
  assert.ok(pulls < 10)
  assert.equal(canceled, true)
  assert.equal(aborted, true)
})

test('models.dev catalog uses EdgeOne mirror when enabled and falls back to origin on failure', async () => {
  const urls = []
  let mirrorFail = false
  const importer = loadImporter(url => {
    urls.push(url)
    if (url === 'https://proxy.project-pigeon.com/modelsdev') {
      if (mirrorFail) {
        return response({}, 502)
      }
      return response(catalog)
    }
    if (url === 'https://models.dev/api.json') {
      return response(catalog)
    }
    return response({ data: [{ id: 'gpt-5-mini' }] })
  })
  importer.modelImporterInternals.setModelsDevMirrorEnabled(true)
  const first = await importer.importModels(request({ ids: ['gpt-5-mini'] }))
  assert.equal(first.models[0].matched, true)
  assert.deepEqual(urls, ['https://proxy.project-pigeon.com/modelsdev'])

  const fallbackUrls = []
  mirrorFail = true
  const fallbackImporter = loadImporter(url => {
    fallbackUrls.push(url)
    if (url === 'https://proxy.project-pigeon.com/modelsdev') {
      return response({}, 502)
    }
    if (url === 'https://models.dev/api.json') {
      return response(catalog)
    }
    return response({ data: [{ id: 'gpt-5-mini' }] })
  })
  fallbackImporter.modelImporterInternals.setModelsDevMirrorEnabled(true)
  const second = await fallbackImporter.importModels(request({ ids: ['gpt-5-mini'] }))
  assert.equal(second.models[0].matched, true)
  assert.deepEqual(fallbackUrls, [
    'https://proxy.project-pigeon.com/modelsdev',
    'https://models.dev/api.json'
  ])
})
