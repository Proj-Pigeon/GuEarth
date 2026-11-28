import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { test } from 'vite-plus/test'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function parseYamlStringList(yamlText, sectionKey) {
  const lines = yamlText.split(/\r?\n/)
  const items = []
  let inSection = false
  for (const line of lines) {
    if (!inSection) {
      if (new RegExp(`^${sectionKey}:\\s*$`).test(line)) {
        inSection = true
      }
      continue
    }
    if (/^\S/.test(line)) {
      break
    }
    const match = line.match(/^\s*-\s+(.+?)\s*$/)
    if (!match) {
      continue
    }
    const raw = match[1]
    const unquoted =
      (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))
        ? raw.slice(1, -1)
        : raw
    items.push(unquoted)
  }
  return items
}

function isIncludedByBuilderPatterns(relPosixPath, patterns) {
  let included = false
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (posix.matchesGlob(relPosixPath, pattern.slice(1))) {
        included = false
      }
    } else if (posix.matchesGlob(relPosixPath, pattern)) {
      included = true
    }
  }
  return included
}

function collectFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(full))
    } else if (entry.isFile()) {
      results.push(full)
    }
  }
  return results
}

function collectRelativeRequires(entryPath, visited = new Set()) {
  const normalized = resolve(entryPath)
  if (visited.has(normalized)) {
    return visited
  }
  visited.add(normalized)
  const source = readFileSync(normalized, 'utf8')
  for (const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const target = resolve(dirname(normalized), match[1])
    if (existsSync(target)) {
      collectRelativeRequires(target, visited)
    }
  }
  return visited
}

test('electron-builder files config keeps koffi runtime JS modules while excluding C++ sources', () => {
  const builderYml = readFileSync(resolve(repoRoot, 'electron-builder.yml'), 'utf8')
  const filePatterns = parseYamlStringList(builderYml, 'files')
  const asarUnpackPatterns = parseYamlStringList(builderYml, 'asarUnpack')

  assert.ok(filePatterns.length > 0)

  const koffiRoot = resolve(repoRoot, 'node_modules/koffi')
  const koffiEntry = resolve(koffiRoot, 'index.cjs')
  assert.ok(existsSync(koffiEntry))

  const requiredFiles = [resolve(koffiRoot, 'package.json'), ...collectRelativeRequires(koffiEntry)]
  for (const absPath of requiredFiles) {
    const rel = relative(repoRoot, absPath).replaceAll('\\', '/')
    assert.ok(
      isIncludedByBuilderPatterns(rel, filePatterns),
      `expected koffi runtime file to be packaged: ${rel}`
    )
  }

  for (const excludedSample of [
    'node_modules/koffi/doc/index.md',
    'node_modules/koffi/lib/native/base/base.cc',
    'node_modules/koffi/vendor/node-api-headers/include/node_api.h',
    'node_modules/koffi/src/koffi/src/ffi.cc',
    'node_modules/koffi/src/koffi/src/ffi.hh',
    'node_modules/koffi/src/koffi/CMakeLists.txt'
  ]) {
    assert.equal(
      isIncludedByBuilderPatterns(excludedSample, filePatterns),
      false,
      `expected koffi non-runtime file to be excluded: ${excludedSample}`
    )
  }

  const koromixDir = resolve(repoRoot, 'node_modules/@koromix')
  if (existsSync(koromixDir)) {
    const nativeAddons = collectFiles(koromixDir).filter(file => file.endsWith('.node'))
    assert.ok(nativeAddons.length > 0)
    for (const addon of nativeAddons) {
      const rel = relative(repoRoot, addon).replaceAll('\\', '/')
      assert.ok(
        isIncludedByBuilderPatterns(rel, filePatterns),
        `expected addon to be packaged: ${rel}`
      )
      assert.ok(
        asarUnpackPatterns.some(pattern => posix.matchesGlob(rel, pattern)),
        `expected addon to be asarUnpacked: ${rel}`
      )
    }
  }
})

test('main and preload bundles only require builtins, electron, or packaged node_modules', () => {
  const viteConfig = readFileSync(resolve(repoRoot, 'electron.vite.config.ts'), 'utf8')
  assert.match(viteConfig, /externalizeDeps:\s*false/)

  const builtins = new Set([
    'electron',
    ...builtinModules,
    ...builtinModules.map(name => `node:${name}`)
  ])
  const packagedExternals = new Set(['koffi'])

  for (const dir of ['out/main', 'out/preload']) {
    const absDir = resolve(repoRoot, dir)
    if (!existsSync(absDir)) {
      continue
    }
    for (const file of collectFiles(absDir).filter(entry => /\.(c|m)?js$/.test(entry))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:^|[^\w$.])require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const specifier = match[1]
        if (specifier.startsWith('.') || specifier.includes('${')) {
          continue
        }
        assert.ok(
          builtins.has(specifier) || packagedExternals.has(specifier),
          `unexpected unpackaged external require("${specifier}") in ${relative(repoRoot, file)}`
        )
      }
    }
  }
})
