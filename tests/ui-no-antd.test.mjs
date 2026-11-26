import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const SRC_ROOT = resolve('src')
const FORBIDDEN_PATTERNS = [
  /from\s+['"]antd(?:\/|['"])/,
  /from\s+['"]@ant-design\//,
  /antd\/dist\//,
  /\.ant-[a-z]/,
  /--ant-[a-z]/
]

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectSourceFiles(full, out)
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

test('renderer and main sources have zero Ant Design imports or style tokens', () => {
  const hits = []
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const content = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        hits.push(`${relative(SRC_ROOT, file)} matched ${pattern}`)
      }
    }
  }
  assert.deepEqual(hits, [])
})

test('package.json does not depend on antd or @ant-design packages', () => {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const antDeps = Object.keys(allDeps).filter((name) => name === 'antd' || name.startsWith('@ant-design/'))
  assert.deepEqual(antDeps, [])
})
