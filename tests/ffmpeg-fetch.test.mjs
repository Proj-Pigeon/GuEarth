import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FFMPEG_BUILD,
  approvedArchiveSource,
  archiveSources,
  assertArchiveSource,
  defaultBinaryPath,
  fetchFfmpeg,
  isApprovedArchiveUrl,
  matchesPinnedArchivePath,
  sha256Text,
  verifyFile,
  verifyFfmpegBinary
} from '../scripts/fetch-ffmpeg.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const pinnedArchivePathSuffix = `/v${FFMPEG_BUILD.version}/${FFMPEG_BUILD.archiveName}`
const pinnedMirrorUrl = `https://registry.npmmirror.com/-/binary/ffmpeg-builds${pinnedArchivePathSuffix}`
const pinnedReleaseUrl = `https://github.com/KarinJS/FFmpeg-Builds/releases/download${pinnedArchivePathSuffix}`

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

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

test('ffmpeg fetch accepts the pinned artifact served from an approved mirror host', () => {
  for (const url of [pinnedMirrorUrl, pinnedReleaseUrl]) {
    assert.ok(matchesPinnedArchivePath(url), url)
    const sources = archiveSources(url)
    assert.equal(sources.length, 3)
    assert.equal(sources[0], url)
    assert.deepEqual(sources.slice(1), archiveSources(undefined))
    for (const source of sources) assert.ok(isApprovedArchiveUrl(source), source)
  }
  const relayedMirror = `https://registry.npmmirror.com/mirrors/ffmpeg-builds${pinnedArchivePathSuffix}`
  assert.equal(approvedArchiveSource(relayedMirror), relayedMirror)
  assert.equal(archiveSources(undefined).length, 2)
})

test('ffmpeg fetch rejects override paths that are not the pinned artifact', () => {
  const wrongArtifacts = [
    'https://github.com/KarinJS/FFmpeg-Builds/releases/download/v8.1.3/ffmpeg-8.1.3-win32-x64-full.tar.xz',
    `https://registry.npmmirror.com/-/binary/ffmpeg-builds/v8.1.2/${FFMPEG_BUILD.archiveName}`,
    `https://github.com/KarinJS/FFmpeg-Builds/releases/download${pinnedArchivePathSuffix}?token=stolen`
  ]
  for (const url of wrongArtifacts) {
    assert.equal(isApprovedArchiveUrl(url), true, url)
    assert.equal(matchesPinnedArchivePath(url), false, url)
    assert.throws(
      () => archiveSources(url),
      (error) => {
        assert.match(error.message, /FFMPEG_FETCH_URL 归档路径不受信任/)
        assert.match(error.message, /FFMPEG_FETCH_FILE/)
        assert.ok(error.message.includes(new URL(url).pathname), error.message)
        return true
      },
      url
    )
  }
})

test('ffmpeg fetch rejects non-HTTPS overrides even on approved hosts', () => {
  const insecure = `http://registry.npmmirror.com/-/binary/ffmpeg-builds${pinnedArchivePathSuffix}`
  assert.equal(matchesPinnedArchivePath(insecure), true)
  assert.equal(isApprovedArchiveUrl(insecure), false)
  assert.throws(() => archiveSources(insecure), (error) => {
    assert.match(error.message, /FFMPEG_FETCH_URL 来源不受信任：registry\.npmmirror\.com/)
    assert.match(error.message, /FFMPEG_FETCH_FILE/)
    return true
  })
})

test('ffmpeg fetch rejects untrusted hosts that serve the pinned path shape', () => {
  const untrustedHost = `https://mirror.example.com/mirrors${pinnedArchivePathSuffix}`
  assert.equal(matchesPinnedArchivePath(untrustedHost), true)
  assert.equal(isApprovedArchiveUrl(untrustedHost), false)
  assert.throws(() => archiveSources(untrustedHost), (error) => {
    assert.match(error.message, /FFMPEG_FETCH_URL 来源不受信任：mirror\.example\.com/)
    assert.match(error.message, /FFMPEG_FETCH_FILE/)
    return true
  })
  assert.throws(() => assertArchiveSource(untrustedHost), /拒绝下载未经验证的来源：mirror\.example\.com/)
})

test('the download sink only accepts allowlisted pinned artifact URLs', () => {
  for (const url of archiveSources(undefined)) assert.equal(assertArchiveSource(url), url)
  assert.equal(assertArchiveSource(pinnedMirrorUrl), pinnedMirrorUrl)
  assert.throws(() => assertArchiveSource(`https://example.com/${FFMPEG_BUILD.archiveName}`), /拒绝下载未经验证的来源/)
  assert.throws(
    () => assertArchiveSource('https://github.com/KarinJS/FFmpeg-Builds/releases/download/v8.1.3/other.tar.xz'),
    /拒绝下载未经验证的来源/
  )
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

test('the offline FFMPEG_FETCH_FILE branch bypasses the network source allowlist', async (t) => {
  if (process.platform !== 'win32') return t.skip('内置编码器仅在 Windows 上获取')
  const sandbox = await mkdtemp(join(tmpdir(), 'guearth-ffmpeg-offline-'))
  const previousFile = process.env.FFMPEG_FETCH_FILE
  const previousUrl = process.env.FFMPEG_FETCH_URL
  process.env.FFMPEG_FETCH_FILE = join(sandbox, 'absent-archive.tar.xz')
  process.env.FFMPEG_FETCH_URL = `https://example.com/${FFMPEG_BUILD.archiveName}`
  try {
    await assert.rejects(fetchFfmpeg({ repoRoot: sandbox, force: true }), (error) => {
      assert.equal(error.code, 'ENOENT')
      assert.doesNotMatch(error.message, /FFMPEG_FETCH_URL/)
      return true
    })
  } finally {
    restoreEnv('FFMPEG_FETCH_FILE', previousFile)
    restoreEnv('FFMPEG_FETCH_URL', previousUrl)
    await rm(sandbox, { recursive: true, force: true })
  }
})
