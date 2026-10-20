import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { test } from 'node:test'

import { assertOffscreenRecordingSupported, resolveFfmpegBinary } from '../src/main/ffmpeg.ts'
import { resolveOffscreenEntry } from '../src/main/offscreenPaths.ts'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const recordingsRoot = join(tmpdir(), 'guearth-offscreen-paths')

test('a direct child resolves beneath the recording directory', () => {
  assert.equal(resolveOffscreenEntry(recordingsRoot, '.guearth-offscreen-ab12'), join(recordingsRoot, '.guearth-offscreen-ab12'))
  assert.equal(resolveOffscreenEntry(`${recordingsRoot}${sep}`, '.guearth-offscreen-ab12'), join(recordingsRoot, '.guearth-offscreen-ab12'))
  assert.equal(resolveOffscreenEntry(recordingsRoot, '..foo'), join(recordingsRoot, '..foo'))
  assert.equal(resolveOffscreenEntry(recordingsRoot, 'frame-00000000.jpg'), join(recordingsRoot, 'frame-00000000.jpg'))
})

test('traversal-like entry names never resolve to a child', () => {
  const foreign = [
    '',
    '.',
    '..',
    '../escape',
    '..\\escape',
    'nested/escape',
    'nested\\escape',
    '..\\..\\Windows\\System32',
    '../.guearth-offscreen-stolen'
  ]
  for (const name of foreign) assert.equal(resolveOffscreenEntry(recordingsRoot, name), null, `name=${JSON.stringify(name)}`)
})

test('absolute and prefix-foreign names are rejected', () => {
  assert.equal(resolveOffscreenEntry(recordingsRoot, resolve(recordingsRoot, 'child')), null)
  assert.equal(resolveOffscreenEntry(recordingsRoot, `${recordingsRoot}-evil`), null)
  assert.equal(resolveOffscreenEntry(recordingsRoot, '/etc/passwd'), null)
  assert.equal(resolveOffscreenEntry(recordingsRoot, 'C:\\Windows\\System32'), null)
})

test('directory entries that are symlinks never pass the sweep directory filter', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'guearth-offscreen-symlink-'))
  try {
    const target = join(root, 'outside-target')
    mkdirSync(target)
    const link = join(root, '.guearth-offscreen-link')
    try {
      symlinkSync(target, link, 'junction')
    } catch {
      return t.skip('当前环境无法创建目录联接')
    }
    const entry = readdirSync(root, { withFileTypes: true }).find((item) => item.name === '.guearth-offscreen-link')
    assert.ok(entry)
    assert.equal(entry.isDirectory(), false)
    assert.equal(entry.isSymbolicLink(), true)
    const eligible = readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory() && item.name.startsWith('.guearth-offscreen-'))
    assert.deepEqual(eligible, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the stale sweep resolves every candidate through the shared path guard', () => {
  assert.ok(mainSource.includes("import { resolveOffscreenEntry } from './offscreenPaths'"))
  assert.ok(mainSource.includes('async function offscreenFrameDirectoryActive(directory: string, entryName: string): Promise<boolean> {'))
  assert.ok(mainSource.includes('const path = resolveOffscreenEntry(directory, entryName)'))
  assert.ok(mainSource.includes('if (!path) return true'))
  assert.ok(mainSource.includes('.filter((entry) => entry.isDirectory() && entry.name.startsWith(OFFSCREEN_TEMP_PREFIX))'))
  assert.ok(mainSource.includes('if (await offscreenFrameDirectoryActive(directory, entry.name)) return'))
  assert.ok(mainSource.includes('const path = resolveOffscreenEntry(directory, entry.name)'))
  assert.ok(!mainSource.includes('rm(join(directory, entry.name)'))
})

test('offscreen recording rejects unsupported platforms with a clear error', () => {
  assert.doesNotThrow(() => assertOffscreenRecordingSupported('win32'))
  for (const platform of ['darwin', 'linux', 'freebsd']) {
    assert.throws(() => assertOffscreenRecordingSupported(platform), (error) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes('Windows x64'))
      assert.ok(error.message.includes(platform))
      return true
    })
  }
})

test('the encoder resolver guards the platform before probing the binary path', () => {
  assert.throws(() => resolveFfmpegBinary(recordingsRoot, '', false, 'darwin'), (error) => {
    assert.ok(error.message.includes('Windows x64'))
    return true
  })
})

test('a packaged build never tells end users to run a developer command', () => {
  assert.throws(() => resolveFfmpegBinary(recordingsRoot, join(recordingsRoot, 'absent-resources'), true, 'win32'), (error) => {
    assert.ok(error.message.includes('重新安装咕咕地球'))
    assert.ok(!error.message.includes('npm run'))
    return true
  })
})

test('a development build still points the developer at the fetch command', () => {
  assert.throws(() => resolveFfmpegBinary(join(recordingsRoot, 'absent-app'), '', false, 'win32'), (error) => {
    assert.ok(error.message.includes('npm run fetch:ffmpeg'))
    return true
  })
})

test('the encode IPC entry rejects unsupported platforms before touching the recorder', () => {
  assert.ok(mainSource.includes("ipcMain.handle('recordings:offscreen-encode'"))
  assert.ok(mainSource.includes('assertOffscreenRecordingSupported(process.platform)'))
})
