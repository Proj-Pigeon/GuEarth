import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vite-plus/test'
import { formatActionError, runGuardedAction } from '../src/renderer/src/components/ui/actionError.ts'
import { computeGuideCardPosition } from '../src/renderer/src/lib/guidePosition.ts'
import { flattenVisibleTree, resolveTreeKeyAction } from '../src/renderer/src/lib/treeNavigation.ts'

test('computeGuideCardPosition flips bottom card above target on 600px viewport when measured height overflows', () => {
  const target = { top: 360, left: 420, width: 220, height: 48 }
  const pos = computeGuideCardPosition(target, 'bottom', 340, 210, 992, 600)
  assert.equal(pos.top + 210 <= target.top, true)
  assert.equal(pos.top >= 16, true)
  assert.equal(pos.top + 210 <= 600 - 16, true)
})

test('computeGuideCardPosition uses measured height rather than fixed 176px for top placement', () => {
  const target = { top: 520, left: 400, width: 80, height: 40 }
  const shortCard = computeGuideCardPosition(target, 'top', 340, 124, 1280, 720)
  const tallCard = computeGuideCardPosition(target, 'top', 340, 210, 1280, 720)
  assert.equal(shortCard.top, 520 - 124 - 14)
  assert.equal(tallCard.top, 520 - 210 - 14)
})

test('computeGuideCardPosition centers card safely when targetRect is null', () => {
  const pos = computeGuideCardPosition(null, 'top', 340, 200, 992, 600)
  assert.equal(pos.top, 200)
  assert.equal(pos.left, 326)
})

test('flattenVisibleTree and resolveTreeKeyAction support WAI-ARIA tree navigation', () => {
  const nodes = [
    {
      key: 'folder:a',
      isFolder: true,
      children: [
        { key: 'shape:1', isFolder: false },
        { key: 'folder:b', isFolder: true, children: [{ key: 'shape:2', isFolder: false }] }
      ]
    },
    { key: 'shape:3', isFolder: false }
  ]

  const collapsed = new Set()
  const collapsedVisible = flattenVisibleTree(nodes, collapsed)
  assert.deepEqual(
    collapsedVisible.map((item) => item.key),
    ['folder:a', 'shape:3']
  )
  assert.deepEqual(resolveTreeKeyAction('ArrowRight', 'folder:a', collapsedVisible, collapsed), {
    type: 'expand',
    key: 'folder:a'
  })
  assert.deepEqual(resolveTreeKeyAction('ArrowDown', 'folder:a', collapsedVisible, collapsed), {
    type: 'focus',
    key: 'shape:3'
  })

  const expanded = new Set(['folder:a'])
  const expandedVisible = flattenVisibleTree(nodes, expanded)
  assert.deepEqual(
    expandedVisible.map((item) => item.key),
    ['folder:a', 'shape:1', 'folder:b', 'shape:3']
  )
  assert.deepEqual(resolveTreeKeyAction('ArrowRight', 'folder:a', expandedVisible, expanded), {
    type: 'focus',
    key: 'shape:1'
  })
  assert.deepEqual(resolveTreeKeyAction('ArrowLeft', 'shape:1', expandedVisible, expanded), {
    type: 'focus',
    key: 'folder:a'
  })
  assert.deepEqual(resolveTreeKeyAction('ArrowLeft', 'folder:a', expandedVisible, expanded), {
    type: 'collapse',
    key: 'folder:a'
  })
  assert.deepEqual(resolveTreeKeyAction('End', 'folder:a', expandedVisible, expanded), {
    type: 'focus',
    key: 'shape:3'
  })
  assert.deepEqual(resolveTreeKeyAction('Home', 'shape:3', expandedVisible, expanded), {
    type: 'focus',
    key: 'folder:a'
  })
  assert.deepEqual(resolveTreeKeyAction('Enter', 'shape:1', expandedVisible, expanded), {
    type: 'activate',
    key: 'shape:1'
  })
  assert.deepEqual(resolveTreeKeyAction(' ', 'shape:1', expandedVisible, expanded), {
    type: 'activate',
    key: 'shape:1'
  })
})

test('runGuardedAction catches sync and async rejections without propagating', async () => {
  const errors = []
  const okSync = await runGuardedAction(() => {}, (message) => errors.push(message))
  assert.equal(okSync, true)
  assert.deepEqual(errors, [])

  const failAsync = await runGuardedAction(
    async () => {
      throw new Error('删除失败')
    },
    (message) => errors.push(message)
  )
  assert.equal(failAsync, false)
  assert.deepEqual(errors, ['删除失败'])

  const failUnknown = await runGuardedAction(
    () => {
      throw null
    },
    (message) => errors.push(message)
  )
  assert.equal(failUnknown, false)
  assert.equal(errors.at(-1), '操作失败，请重试')
  assert.equal(formatActionError('  网络异常  '), '网络异常')
})

test('window chrome, theme sync, and accessibility contracts are wired', () => {
  const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const preloadSource = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
  const controlsSource = readFileSync(
    new URL('../src/renderer/src/components/WindowControls.tsx', import.meta.url),
    'utf8'
  )
  const controlsCss = readFileSync(
    new URL('../src/renderer/src/components/WindowControls.module.css', import.meta.url),
    'utf8'
  )

  assert.match(mainSource, /titleBarStyle:\s*'hidden'/)
  assert.match(mainSource, /nativeTheme\.on\('updated',\s*syncMainWindowBackground\)/)
  assert.match(mainSource, /ipcMain\.on\('app:initial-theme'/)
  assert.match(preloadSource, /ipcRenderer\.sendSync\('app:initial-theme'\)/)
  assert.match(controlsSource, /state\.platform === 'darwin'/)
  assert.doesNotMatch(controlsSource, /onDoubleClick/)
  assert.match(controlsCss, /\.dragStrip\s*\{[^}]*top:\s*6px;[^}]*left:\s*16px;[^}]*right:\s*16px;/s)
})
