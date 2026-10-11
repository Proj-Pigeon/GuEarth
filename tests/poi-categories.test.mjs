import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POI_CATEGORY_LABELS, poiBigCategory } from '../src/main/ai/poiCategories.ts'

test('real-shaped amap pois classify by their typecode, not the chinese type name', () => {
  assert.equal(poiBigCategory({ type: '餐饮服务;中餐厅;特色/地方风味餐厅', typecode: '050118' }), '05')
  assert.equal(poiBigCategory({ type: '科教文化服务;学校;高等教育;大学', typecode: '141201' }), '14')
  assert.equal(poiBigCategory({ type: '购物服务;商场;购物中心', typecode: '060101' }), '06')
  assert.equal(poiBigCategory({ type: '商务住宅;住宅区;住宅小区', typecode: '120201' }), '12')
  assert.equal(poiBigCategory({ type: '金融保险服务;银行;中央银行', typecode: '160000' }), '16')
})

test('every big category code resolves through the label table', () => {
  const codes = Object.keys(POI_CATEGORY_LABELS)
  assert.equal(codes.length, 20)
  for (const code of codes) {
    assert.match(code, /^\d{2}$/)
    assert.ok(POI_CATEGORY_LABELS[code].length > 0)
    assert.equal(poiBigCategory({ typecode: `${code}1234` }), code)
  }
})

test('pois without a valid typecode are skipped instead of misclassified', () => {
  assert.equal(poiBigCategory({ type: '餐饮服务;中餐厅;特色/地方风味餐厅' }), undefined)
  assert.equal(poiBigCategory({ type: '餐饮服务;中餐厅;特色/地方风味餐厅', typecode: '999999' }), undefined)
  assert.equal(poiBigCategory({ type: '餐饮服务;中餐厅;特色/地方风味餐厅', typecode: 50118 }), undefined)
  assert.equal(poiBigCategory({}), undefined)
})
