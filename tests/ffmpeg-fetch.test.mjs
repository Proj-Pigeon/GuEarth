import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { FFMPEG_BUILD, archiveSources, defaultBinaryPath, isApprovedArchiveUrl, sha256Text, verifyFile, verifyFfmpegBinary } from '../scripts/fetch-ffmpeg.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

test('the pinned ffmpeg build hashes and sizes are well formed', () => {
  assert.match(FFMPEG_BUILD.archiveSha256, /^[0-9a-f]{64}$/)
  assert.match(FFMPEG_BUILD.binarySha256, /^[0-9a-f]{64}$/)
  assert.ok(FFMPEG_BUILD.archiveBytes > 100 * 1024 * 1024)
  assert.ok(FFMPEG_BUILD.binaryBytes > 100 * 1024 * 1024)
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('ffmpeg fetch prefers the configured override then the pinned mirrors', () => {
  const pinned = archiveSources(undefined)
  assert.equal(pinned.length, 2)
  assert.match(pinned[0], /^https:\/\/registry\.npmmirror\.com\//)
  assert.match(pinned[1], /^https:\/\/github\.com\/KarinJS\/FFmpeg-Builds\//)
  for (const url of pinned) assert.ok(url.endsWith(`v8.1.3/${FFMPEG_BUILD.archiveName}`))
  const override = `https://github.com/KarinJS/FFmpeg-Builds/releases/download/v8.1.3/${FFMPEG_BUILD.archiveName}`
  const overridden = archiveSources(override)
  assert.equal(overridden[0], override)
  assert.equal(overridden.length, 3)
})

test('ffmpeg fetch accepts the pinned and GitHub redirect artifact hosts', () => {
  for (const url of archiveSources(undefined)) assert.ok(isApprovedArchiveUrl(url), url)
  assert.ok(isApprovedArchiveUrl('https://objects.githubusercontent.com/github-production-release-asset/ffmpeg.tar.xz'))
  assert.ok(isApprovedArchiveUrl(`https://registry.npmmirror.com/-/binary/ffmpeg-builds/v8.1.3/${FFMPEG_BUILD.archiveName}`))
})

test('ffmpeg fetch rejects untrusted override hosts and schemes', () => {
  const untrusted = [
    `http://registry.npmmirror.com/-/binary/ffmpeg-builds/v8.1.3/${FFMPEG_BUILD.archiveName}`,
    `file:///C:/ffmpeg/${FFMPEG_BUILD.archiveName}`,
    `https://localhost/${FFMPEG_BUILD.archiveName}`,
    `https://example.com/${FFMPEG_BUILD.archiveName}`
  ]
  for (const url of untrusted) {
    assert.equal(isApprovedArchiveUrl(url), false, url)
    assert.throws(() => archiveSources(url), (error) => {
      assert.match(error.message, /FFMPEG_FETCH_URL 来源不受信任/)
      assert.match(error.message, /FFMPEG_FETCH_FILE/)
      return true
    })
  }
})

test('binary verification reports matching and mismatching payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guearth-ffmpeg-verify-'))
  try {
    const file = join(directory, 'payload.bin')
    await writeFile(file, 'guearth')
    const digest = sha256Text('guearth')
    assert.equal((await verifyFile(file, { sha256: digest, bytes: 7 })).ok, true)
    const wrongSize = await verifyFile(file, { sha256: digest, bytes: 6 })
    assert.equal(wrongSize.ok, false)
    assert.match(wrongSize.reason, /大小/)
    const wrongHash = await verifyFile(file, { sha256: sha256Text('other'), bytes: 7 })
    assert.equal(wrongHash.ok, false)
    assert.match(wrongHash.reason, /SHA256/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('the encoder target lives in resources/bin and missing binaries are reported', async () => {
  assert.equal(defaultBinaryPath(repoRoot), join(repoRoot, 'resources', 'bin', 'ffmpeg.exe'))
  const missing = await verifyFfmpegBinary(join(repoRoot, 'resources', 'bin', 'missing-ffmpeg.exe'))
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /不存在/)
})

test('the provisioned binary matches the pinned digest when present', async (t) => {
  const target = defaultBinaryPath(repoRoot)
  if (!existsSync(target)) return t.skip('尚未获取内置编码器（npm run fetch:ffmpeg）')
  const result = await verifyFfmpegBinary(target)
  assert.equal(result.ok, true, result.reason)
})
