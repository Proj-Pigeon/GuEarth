import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  approvedArchiveSource,
  archiveRedirectTarget,
  archiveSources,
  assertArchiveSource,
  defaultHawdbBinaryPath,
  HAWDB_BUILDS,
  HAWDB_VERSION,
  hawdbBuildFor,
  isApprovedArchiveRedirectUrl,
  isApprovedArchiveUrl,
  matchesPinnedArchivePath,
  normalizeHawdbArch,
  packagedHawdbBinaryPath
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

test('hawdb fetch accepts only pinned GitHub release URLs and approved redirect hosts', () => {
  const winBuild = hawdbBuildFor('win32', 'x64')
  const sources = archiveSources(undefined, winBuild)
  assert.equal(sources.length, 1)
  assert.ok(isApprovedArchiveUrl(sources[0]))
  assert.ok(matchesPinnedArchivePath(sources[0]))
  assert.equal(approvedArchiveSource(sources[0]), sources[0])
  assertArchiveSource(sources[0])

  assert.throws(() => approvedArchiveSource(`https://evil.example.com/v${HAWDB_VERSION}/${winBuild.archiveName}`))
  assert.throws(() => approvedArchiveSource(`https://github.com/nowledge-co/hawdb/releases/download/v${HAWDB_VERSION}/other.zip`))
  assert.throws(() => approvedArchiveSource(`${sources[0]}?token=1`))

  const redirect = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r'
  assert.ok(isApprovedArchiveRedirectUrl(redirect))
  assert.equal(archiveRedirectTarget(redirect, sources[0]), redirect)
  assert.throws(() => archiveRedirectTarget('https://untrusted.example.com/file.zip', sources[0]))
})

test('hawdb output paths place Windows binary flat and POSIX binaries under arch folder', () => {
  assert.ok(packagedHawdbBinaryPath('/repo', 'win32', 'x64').endsWith('resources/bin/hawdb_ffi.dll') || packagedHawdbBinaryPath('/repo', 'win32', 'x64').endsWith('resources\\bin\\hawdb_ffi.dll'))
  assert.ok(packagedHawdbBinaryPath('/repo', 'linux', 'arm64').includes('arm64'))
  assert.ok(defaultHawdbBinaryPath('/repo', 'darwin', 'arm64').endsWith('libhawdb_ffi.dylib'))
})
