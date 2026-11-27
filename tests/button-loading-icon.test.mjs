import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'vitest'
import ts from 'typescript'

const RENDERER_ROOT = resolve('src/renderer/src')
const BUTTON_TAGS = new Set(['Button'])
const ICON_TAG_RE = /Icon$/

function collectTsxFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectTsxFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.tsx')) results.push(full)
  }
  return results
}

function extractImportedIcons(sourceFile) {
  const names = new Set()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    if (moduleName !== 'lucide-react') continue
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
    for (const element of namedBindings.elements) {
      names.add(element.name.text)
    }
  }
  return names
}

function jsxTagName(tagNameNode) {
  if (ts.isIdentifier(tagNameNode)) return tagNameNode.text
  if (ts.isPropertyAccessExpression(tagNameNode)) return tagNameNode.getText()
  return ''
}

function hasLoadingAttr(attributes) {
  for (const property of attributes.properties) {
    if (ts.isJsxAttribute(property) && property.name.getText() === 'loading') {
      return true
    }
  }
  return false
}

function isIconTag(tag, importedIcons) {
  return importedIcons.has(tag) || ICON_TAG_RE.test(tag) || tag === 'svg'
}

function findIconsInJsxChildren(children, importedIcons, sourceFile) {
  const found = []
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node.tagName)
      if (isIconTag(tag, importedIcons)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        found.push({ tag, line: line + 1 })
        return
      }
      return
    }
    if (ts.isJsxElement(node)) {
      const tag = jsxTagName(node.openingElement.tagName)
      if (isIconTag(tag, importedIcons)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        found.push({ tag, line: line + 1 })
        return
      }
      for (const child of node.children) visit(child)
      return
    }
    if (ts.isJsxFragment(node)) {
      for (const child of node.children) visit(child)
      return
    }
    if (ts.isJsxExpression(node) && node.expression) {
      visitExpression(node.expression)
    }
  }
  const visitExpression = (expr) => {
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
      visit(expr)
      return
    }
    if (ts.isParenthesizedExpression(expr)) {
      visitExpression(expr.expression)
      return
    }
    if (ts.isConditionalExpression(expr)) {
      visitExpression(expr.whenTrue)
      visitExpression(expr.whenFalse)
      return
    }
    if (ts.isBinaryExpression(expr)) {
      visitExpression(expr.left)
      visitExpression(expr.right)
    }
  }
  for (const child of children) visit(child)
  return found
}

function walkTsx(node, visitor) {
  visitor(node)
  ts.forEachChild(node, (child) => walkTsx(child, visitor))
}

test('all loading buttons place icons in the icon prop so loading replaces the original icon', () => {
  const violations = []
  let checkedButtons = 0

  for (const file of collectTsxFiles(RENDERER_ROOT)) {
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const importedIcons = extractImportedIcons(sourceFile)

    walkTsx(sourceFile, (node) => {
      if (ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node.tagName)
        if (BUTTON_TAGS.has(tag) && hasLoadingAttr(node.attributes)) checkedButtons++
        return
      }
      if (!ts.isJsxElement(node)) return
      const tag = jsxTagName(node.openingElement.tagName)
      if (!BUTTON_TAGS.has(tag) || !hasLoadingAttr(node.openingElement.attributes)) return
      checkedButtons++
      const misplaced = findIconsInJsxChildren(node.children, importedIcons, sourceFile)
      for (const icon of misplaced) {
        violations.push(`${relative(RENDERER_ROOT, file)}:${icon.line} <${icon.tag}> inside loading <${tag}>`)
      }
    })
  }

  assert.ok(checkedButtons >= 15, `expected to inspect loading buttons, found ${checkedButtons}`)
  assert.deepEqual(violations, [])
})
