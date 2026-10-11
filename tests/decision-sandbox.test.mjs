import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDecisionPrompt, decisionCases, decisionSandboxIntro } from '../src/renderer/src/thematic/decisionSandbox.ts'

test('decision cases: four contexts with essential factors and reachable places', () => {
  assert.equal(decisionCases.length, 4)
  assert.deepEqual(
    decisionCases.map((item) => item.id),
    ['electronics', 'sugar', 'port', 'winery']
  )
  for (const item of decisionCases) {
    assert.ok(item.factors.length >= 5, `${item.id} should offer at least five factors`)
    assert.ok(item.factors.some((factor) => factor.essential), `${item.id} needs at least one essential factor`)
    assert.ok(item.question.includes('？'))
    assert.ok(item.context.length >= 20)
    const [lon, lat] = item.placeLonLat
    assert.ok(lon >= 103 && lon <= 123 && lat >= 21 && lat <= 41, `${item.id} place outside China east-belt`)
  }
  for (const item of decisionCases) {
    const ids = item.factors.map((factor) => factor.id)
    assert.equal(new Set(ids).size, ids.length, `${item.id} factor ids must be unique within the case`)
  }
})

test('buildDecisionPrompt follows the gaokao answer structure and flags missed essentials', () => {
  const electronics = decisionCases[0]
  const prompt = buildDecisionPrompt(electronics, ['land'])
  assert.ok(prompt.includes(electronics.place))
  assert.ok(prompt.includes('土地价格'))
  assert.ok(prompt.includes('有利条件'))
  assert.ok(prompt.includes('限制性条件'))
  assert.ok(prompt.includes('综合评价'))
  assert.ok(prompt.includes('我可能低估了'))
  assert.ok(prompt.includes('analyze_location'))

  const full = buildDecisionPrompt(electronics, electronics.factors.map((factor) => factor.id))
  assert.ok(!full.includes('我可能低估了'))

  const empty = buildDecisionPrompt(electronics, [])
  assert.ok(empty.includes('（暂无）'))
})

test('sandbox intro explains the workflow', () => {
  assert.ok(decisionSandboxIntro.includes('区位因素'))
  assert.ok(decisionSandboxIntro.includes('点评'))
})
