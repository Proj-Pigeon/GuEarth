import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  }
})

const { POI_CATEGORY_LABELS } = await import('../src/main/ai/poiCategories.ts')
const { aggregatePois, createPoiAggregation, poiCategoryRows, poiPageCount, poiTruncated } = await import(
  '../src/main/ai/poiAggregation.ts'
)

function pageOf(typecodes, start) {
  return typecodes.map((code, index) => ({ name: `poi-${start + index}`, typecode: code }))
}

test('aggregatePois counts every fetched poi but classifies only valid typecodes', () => {
  const aggregation = createPoiAggregation()
  aggregatePois(aggregation, [
    { name: 'a', typecode: '050118' },
    { name: 'b', typecode: '050101' },
    { name: 'c', typecode: '060101' },
    { name: 'd', type: '餐饮服务;中餐厅' },
    { name: 'e' },
    { name: 'f', typecode: '999999' },
    { name: 'g', typecode: 50118 }
  ])
  assert.equal(aggregation.fetched, 7)
  assert.equal(aggregation.sampled, 3)
  assert.deepEqual([...aggregation.counts.entries()].sort(), [['05', 2], ['06', 1]])
})

test('aggregatePois accumulates across paginated responses', () => {
  const aggregation = createPoiAggregation()
  aggregatePois(aggregation, pageOf(['050000', '060000', '140000'], 0))
  aggregatePois(aggregation, pageOf(['050000', '120000'], 3))
  assert.equal(aggregation.fetched, 5)
  assert.equal(aggregation.sampled, 5)
  assert.equal(aggregation.counts.get('05'), 2)
  assert.equal(aggregation.counts.get('06'), 1)
  assert.equal(aggregation.counts.get('14'), 1)
  assert.equal(aggregation.counts.get('12'), 1)
})

test('poiPageCount caps pages by reported total, sample budget, and the hard page limit', () => {
  assert.equal(poiPageCount(1000, 900), 36)
  assert.equal(poiPageCount(1000, 100), 4)
  assert.equal(poiPageCount(30, 900), 2)
  assert.equal(poiPageCount(26, 900), 2)
  assert.equal(poiPageCount(25, 900), 1)
  assert.equal(poiPageCount(0, 900), 0)
})

test('poiTruncated reports whether more results exist than the fetched pages hold', () => {
  assert.equal(poiTruncated(1000, 10), true)
  assert.equal(poiTruncated(251, 10), true)
  assert.equal(poiTruncated(250, 10), false)
  assert.equal(poiTruncated(24, 1), false)
})

test('poiCategoryRows sorts by count descending and resolves label table entries', () => {
  const aggregation = createPoiAggregation()
  aggregatePois(aggregation, [
    { typecode: '140000' },
    { typecode: '050000' },
    { typecode: '050100' },
    { typecode: '050200' }
  ])
  const rows = poiCategoryRows(aggregation.counts)
  assert.deepEqual(rows.map((row) => row.code), ['05', '14'])
  assert.deepEqual(rows.map((row) => row.count), [3, 1])
  assert.equal(rows[0].label, POI_CATEGORY_LABELS['05'])
  assert.equal(rows[1].label, POI_CATEGORY_LABELS['14'])
  assert.ok(rows.every((row) => row.label.length > 0))
})

test('poiCategoryRows keeps unknown codes as their raw value', () => {
  const rows = poiCategoryRows(new Map([['99', 1]]))
  assert.deepEqual(rows, [{ code: '99', label: '99', count: 1 }])
})
