import assert from 'node:assert/strict'
import { test } from 'vite-plus/test'
import {
  archiveRedirectTarget,
  assertArchiveSource,
  assertFetchableUrl,
  defaultHawdbBinaryPath,
  HAWDB_BUILDS,
  HAWDB_VERSION,
  hawdbBuildFor,
  isApprovedArchiveRedirectUrl,
  isApprovedArchiveUrl,
  matchesPinnedArchivePath,
  normalizeHawdbArch,
  packagedHawdbBinaryPath,
  parseCliArgs,
  pinnedArchiveUrl
} from '../scripts/fetch-hawdb.mjs'

test('pinned hawdb builds define valid hashes and expected binaries across platforms', () => {
  const keys = Object.keys(HAWDB_BUILDS).sort()
  assert.deepEqual(keys, ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'])
  for (const build of Object.values(HAWDB_BUILDS)) {
    assert.equal(build.version, HAWDB_VERSION)
    assert.match(build.archiveSha256, /^[0-9a-f]{64}$/, build.archiveName)
    assert.ok(build.archiveName.includes(build.triple), build.archiveName)
    assert.ok(build.binaryMemberPath.endsWith(build.binaryName), build.binaryMemberPath)
  }
  assert.equal(normalizeHawdbArch('x86_64'), 'x64')
  assert.equal(normalizeHawdbArch('amd64'), 'x64')
  assert.equal(normalizeHawdbArch('aarch64'), 'arm64')
  assert.equal(hawdbBuildFor('win32', 'x64').binaryName, 'hawdb_ffi.dll')
  assert.equal(hawdbBuildFor('linux', 'arm64').binaryName, 'libhawdb_ffi.so')
  assert.equal(hawdbBuildFor('darwin', 'arm64').binaryName, 'libhawdb_ffi.dylib')
})

test('hawdb download URLs come from the pinned release constant, not from input', () => {
  const winBuild = hawdbBuildFor('win32', 'x64')
  const source = pinnedArchiveUrl(winBuild)
  assert.equal(source, `https://github.com/nowledge-co/hawdb/releases/download/v${HAWDB_VERSION}/${winBuild.archiveName}`)
  assert.ok(isApprovedArchiveUrl(source))
  assert.ok(matchesPinnedArchivePath(source))
  assertArchiveSource(source)
  for (const build of Object.values(HAWDB_BUILDS)) {
    assert.equal(
      pinnedArchiveUrl(build),
      `https://github.com/nowledge-co/hawdb/releases/download/v${HAWDB_VERSION}/${build.archiveName}`
    )
  }

  assert.throws(() => assertArchiveSource(`https://evil.example.com/v${HAWDB_VERSION}/${winBuild.archiveName}`), /拒绝下载未经验证的来源/)
  assert.throws(() => assertArchiveSource(`https://github.com/nowledge-co/hawdb/releases/download/v${HAWDB_VERSION}/other.zip`), /拒绝下载未经验证的来源/)
  assert.throws(() => assertArchiveSource(`${source}?token=1`), /拒绝下载未经验证的来源/)

  const redirect = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r'
  assert.ok(isApprovedArchiveRedirectUrl(redirect))
  assert.equal(archiveRedirectTarget(redirect, source), redirect)
  assert.throws(() => archiveRedirectTarget('https://untrusted.example.com/file.zip', source))
})

test('hawdb fetch revalidates every request URL against the approved hosts', () => {
  const source = pinnedArchiveUrl(hawdbBuildFor('win32', 'x64'))
  const redirect = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r'
  assert.equal(assertFetchableUrl(source), source)
  assert.equal(assertFetchableUrl(redirect), redirect)
  for (const rejected of ['http://github.com/file.zip', 'https://evil.example.com/file.zip', 'file:///tmp/file.zip']) {
    assert.throws(() => assertFetchableUrl(rejected), /拒绝请求未经验证的地址/)
  }
})

test('hawdb CLI parser reads flags and values without depending on argv order', () => {
  assert.deepEqual(parseCliArgs([]), { force: false, platform: process.platform, archArg: process.arch })
  assert.deepEqual(parseCliArgs(['--force', '--arch', 'all', '--platform', 'linux']), {
    force: true,
    platform: 'linux',
    archArg: 'all'
  })
  assert.deepEqual(parseCliArgs(['--arch']), { force: false, platform: process.platform, archArg: process.arch })
  assert.deepEqual(parseCliArgs(['--unknown', 'value']), { force: false, platform: process.platform, archArg: process.arch })
})

test('hawdb output paths place Windows binary flat and POSIX binaries under arch folder', () => {
  assert.ok(packagedHawdbBinaryPath('/repo', 'win32', 'x64').endsWith('resources/bin/hawdb_ffi.dll') || packagedHawdbBinaryPath('/repo', 'win32', 'x64').endsWith('resources\\bin\\hawdb_ffi.dll'))
  assert.ok(packagedHawdbBinaryPath('/repo', 'linux', 'arm64').includes('arm64'))
  assert.ok(defaultHawdbBinaryPath('/repo', 'darwin', 'arm64').endsWith('libhawdb_ffi.dylib'))
})
