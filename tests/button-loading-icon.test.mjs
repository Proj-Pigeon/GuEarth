import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { parse } from '@vue/compiler-sfc'

const RENDERER_ROOT = resolve('src/renderer/src')
const BUTTON_TAGS = new Set(['a-button', 'AButton', 'Button'])
const ICON_TAG_RE = /(?:Outlined|Filled|TwoTone)$/

function collectVueFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectVueFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.vue')) results.push(full)
  }
  return results
}

function extractAntIconNames(scriptContent) {
  const names = new Set()
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@ant-design\/icons-vue['"]/g
  let match
  while ((match = importRe.exec(scriptContent)) !== null) {
    for (const part of match[1].split(',')) {
      const cleaned = part.trim()
      if (!cleaned) continue
      const alias = cleaned.split(/\s+as\s+/)
      names.add((alias[1] ?? alias[0]).trim())
    }
  }
  return names
}

function hasLoadingProp(element) {
  return (element.props ?? []).some((prop) => {
    if (prop.type === 6 && prop.name === 'loading') return true
    if (prop.type === 7 && prop.name === 'bind' && prop.arg?.content === 'loading') return true
    return false
  })
}

function isIconSlotTemplate(node) {
  if (node.type !== 1 || node.tag !== 'template') return false
  return (node.props ?? []).some(
    (prop) => prop.type === 7 && prop.name === 'slot' && prop.arg?.content === 'icon'
  )
}

function isIconElement(node, importedIcons) {
  if (node.type !== 1) return false
  return importedIcons.has(node.tag) || ICON_TAG_RE.test(node.tag) || node.tag === 'svg'
}

function findIconsOutsideIconSlot(children, importedIcons) {
  const found = []
  for (const child of children ?? []) {
    if (isIconSlotTemplate(child)) continue
    if (isIconElement(child, importedIcons)) {
      found.push({ tag: child.tag, line: child.loc?.start?.line ?? 0 })
      continue
    }
    if (child.children) found.push(...findIconsOutsideIconSlot(child.children, importedIcons))
  }
  return found
}

function walkElements(nodes, visitor) {
  for (const node of nodes ?? []) {
    if (node.type === 1) visitor(node)
    if (node.children) walkElements(node.children, visitor)
    if (node.branches) {
      for (const branch of node.branches) walkElements(branch.children, visitor)
    }
  }
}

test('all loading buttons place icons in the #icon slot so loading replaces the original icon', () => {
  const violations = []
  let checkedButtons = 0

  for (const file of collectVueFiles(RENDERER_ROOT)) {
    const source = readFileSync(file, 'utf8')
    const { descriptor } = parse(source, { filename: file })
    if (!descriptor.template?.ast) continue
    const scriptText = `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`
    const importedIcons = extractAntIconNames(scriptText)

    walkElements(descriptor.template.ast.children, (node) => {
      if (!BUTTON_TAGS.has(node.tag) || !hasLoadingProp(node)) return
      checkedButtons++
      const misplaced = findIconsOutsideIconSlot(node.children, importedIcons)
      for (const icon of misplaced) {
        violations.push(`${relative(RENDERER_ROOT, file)}:${icon.line} <${icon.tag}> inside loading <${node.tag}>`)
      }
    })
  }

  assert.ok(checkedButtons >= 15, `expected to inspect loading buttons, found ${checkedButtons}`)
  assert.deepEqual(violations, [])
})
