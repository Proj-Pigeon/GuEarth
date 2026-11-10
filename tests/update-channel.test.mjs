import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { updateInstallContent, updateReadyHint } from '../src/renderer/src/stores/updateCopy.ts'
import {
  DEB_INSTALL_EXECUTABLE,
  DEB_INSTALL_RESOURCES,
  isDebInstallLocation,
  appImageInstallDestination,
  assetNameFromUrl,
  assetNameMatchesFeed,
  canonicalHazelPlatform,
  debInstallPlan,
  findTrustedExecutable,
  hazelPlatformForAssetName,
  installAppImageFile,
  isPathInsideDirectory,
  resolveLinuxPackageKind,
  resolveUpdateTarget,
  updateFeedPath
} from '../src/main/updateChannel.ts'

const RELEASE_ASSETS = {
  debX64: 'guearth-0.1.17-amd64.deb',
  debArm64: 'guearth-0.1.17-arm64.deb',
  appImageX64: 'guearth-0.1.17-x86_64.AppImage',
  appImageArm64: 'guearth-0.1.17-arm64.AppImage',
  exe: 'guearth-0.1.17-x64-setup.exe'
}

test('hazel platform classification matches the filenames published for v0.1.17', () => {
  assert.equal(hazelPlatformForAssetName(RELEASE_ASSETS.debX64), 'deb')
  assert.equal(hazelPlatformForAssetName(RELEASE_ASSETS.debArm64), 'deb_arm64')
  assert.equal(hazelPlatformForAssetName(RELEASE_ASSETS.appImageX64), 'AppImage')
  assert.equal(hazelPlatformForAssetName(RELEASE_ASSETS.appImageArm64), 'AppImage_arm64')
  assert.equal(hazelPlatformForAssetName(RELEASE_ASSETS.exe), 'exe')
  assert.equal(hazelPlatformForAssetName('guearth-1.0.0-aarch64.AppImage'), 'AppImage_arm64')
})

test('hazel platform classification ignores non-installers and lowercase extensions', () => {
  assert.equal(hazelPlatformForAssetName('latest-linux.yml'), null)
  assert.equal(hazelPlatformForAssetName('guearth-0.1.17-x64-setup.exe.blockmap'), null)
  assert.equal(hazelPlatformForAssetName('guearth-0.1.17-x86_64.appimage'), null)
  assert.equal(hazelPlatformForAssetName('README.md'), null)
  assert.equal(hazelPlatformForAssetName(''), null)
})

test('canonical hazel platforms accept the aliases the update server uses', () => {
  assert.equal(canonicalHazelPlatform('win32'), 'exe')
  assert.equal(canonicalHazelPlatform('exe'), 'exe')
  assert.equal(canonicalHazelPlatform('appimage'), 'AppImage')
  assert.equal(canonicalHazelPlatform('AppImage'), 'AppImage')
  assert.equal(canonicalHazelPlatform('appimage_arm64'), 'AppImage_arm64')
  assert.equal(canonicalHazelPlatform('deb'), 'deb')
  assert.equal(canonicalHazelPlatform('deb_arm64'), 'deb_arm64')
  assert.equal(canonicalHazelPlatform('debian_arm64'), 'deb_arm64')
  assert.equal(canonicalHazelPlatform('linux'), null)
})

test('an update asset is accepted only when its filename is the requested feed', () => {
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.exe, 'win32'), true)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.appImageX64, 'appimage'), true)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.appImageArm64, 'appimage'), false)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.appImageArm64, 'appimage_arm64'), true)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.appImageX64, 'appimage_arm64'), false)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.debX64, 'deb'), true)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.debArm64, 'deb'), false)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.debArm64, 'deb_arm64'), true)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.debX64, 'deb_arm64'), false)
  assert.equal(assetNameMatchesFeed(RELEASE_ASSETS.exe, 'deb'), false)
})

test('asset names are taken from the download URL path', () => {
  const url = `https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/${RELEASE_ASSETS.appImageArm64}`
  assert.equal(assetNameFromUrl(url), RELEASE_ASSETS.appImageArm64)
  assert.equal(assetNameFromUrl('https://example.com/files/guearth%201.AppImage'), null)
  assert.equal(assetNameFromUrl('https://example.com/files/guearth%2Fevil.AppImage'), null)
  assert.equal(assetNameFromUrl('file:///tmp/guearth.AppImage'), null)
  assert.equal(assetNameFromUrl('not a url'), null)
})

test('feed paths keep the hazel /update/{platform}/{version} shape', () => {
  assert.equal(updateFeedPath('https://guearth-updater.isla.fan', 'win32', '0.1.16'), 'https://guearth-updater.isla.fan/update/win32/0.1.16')
  assert.equal(updateFeedPath('https://guearth-updater.isla.fan/', 'appimage_arm64', '0.1.16'), 'https://guearth-updater.isla.fan/update/appimage_arm64/0.1.16')
  assert.equal(updateFeedPath('https://guearth-updater.isla.fan', 'deb', '0.1.16'), 'https://guearth-updater.isla.fan/update/deb/0.1.16')
})

function runtime(patch) {
  return {
    platform: 'linux',
    arch: 'x64',
    debInstalled: false,
    allowPackageKindOverride: false,
    ...patch
  }
}

test('update targets follow the packaged Windows and Linux channels', () => {
  assert.deepEqual(resolveUpdateTarget(runtime({ platform: 'win32', arch: 'x64' })), {
    kind: 'nsis',
    arch: 'x64',
    feedPlatform: 'win32'
  })
  assert.equal(resolveUpdateTarget(runtime({ platform: 'win32', arch: 'arm64' })), null)
  assert.equal(resolveUpdateTarget(runtime({ platform: 'darwin', arch: 'arm64', appImagePath: '/tmp/GuEarth.AppImage' })), null)
  assert.deepEqual(resolveUpdateTarget(runtime({ arch: 'x64', appImagePath: '/home/teacher/guearth-0.1.17-x86_64.AppImage' })), {
    kind: 'appimage',
    arch: 'x64',
    feedPlatform: 'appimage'
  })
  assert.deepEqual(resolveUpdateTarget(runtime({ arch: 'arm64', appImagePath: '/home/teacher/guearth-0.1.17-arm64.AppImage' })), {
    kind: 'appimage',
    arch: 'arm64',
    feedPlatform: 'appimage_arm64'
  })
  assert.deepEqual(resolveUpdateTarget(runtime({ arch: 'x64', debInstalled: true })), {
    kind: 'deb',
    arch: 'x64',
    feedPlatform: 'deb'
  })
  assert.deepEqual(resolveUpdateTarget(runtime({ arch: 'arm64', debInstalled: true })), {
    kind: 'deb',
    arch: 'arm64',
    feedPlatform: 'deb_arm64'
  })
  assert.equal(resolveUpdateTarget(runtime({ arch: 'x64' })), null)
  assert.equal(resolveUpdateTarget(runtime({ arch: 'ia32', appImagePath: '/tmp/guearth.AppImage' })), null)
})

test('AppImage detection wins over a deb install, and the dev override is explicit', () => {
  assert.equal(resolveLinuxPackageKind(runtime({ appImagePath: '/tmp/guearth.AppImage', debInstalled: true })), 'appimage')
  assert.equal(resolveLinuxPackageKind(runtime({ appImagePath: '   ', debInstalled: true })), 'deb')
  assert.equal(resolveLinuxPackageKind(runtime({ packageKindOverride: 'deb', allowPackageKindOverride: true })), 'deb')
  assert.equal(resolveLinuxPackageKind(runtime({ packageKindOverride: 'deb', allowPackageKindOverride: false, appImagePath: '/tmp/guearth.AppImage' })), 'appimage')
  assert.equal(resolveLinuxPackageKind(runtime({ packageKindOverride: 'AppImage', allowPackageKindOverride: true })), null)
  assert.equal(DEB_INSTALL_EXECUTABLE, '/opt/GuEarth/guearth')
  assert.equal(DEB_INSTALL_RESOURCES, '/opt/GuEarth/resources')
  assert.equal(isDebInstallLocation(['/opt/GuEarth/guearth']), true)
  assert.equal(isDebInstallLocation(['/usr/bin/guearth', '/opt/GuEarth/resources']), true)
  assert.equal(isDebInstallLocation(['/tmp/.mount_guearth/guearth', '/tmp/.mount_guearth/resources']), false)
  assert.equal(isDebInstallLocation(['/opt/GuEarth-extra/resources']), false)
})

test('installer paths must stay inside the updates directory', () => {
  assert.equal(isPathInsideDirectory('/tmp/guearth-updates/guearth-0.1.17-x64.deb', '/tmp/guearth-updates'), true)
  assert.equal(isPathInsideDirectory('/tmp/guearth-updates/nested/guearth.deb', '/tmp/guearth-updates'), true)
  assert.equal(isPathInsideDirectory('/tmp/guearth-updates-evil/guearth.deb', '/tmp/guearth-updates'), false)
  assert.equal(isPathInsideDirectory('/tmp/guearth-updates/../guearth.deb', '/tmp/guearth-updates'), false)
  assert.equal(isPathInsideDirectory('/tmp/guearth-updates', '/tmp/guearth-updates'), false)
})

const skipAppImageOnWindows = process.platform === 'win32' ? 'AppImage paths and permissions are POSIX-only' : false

test('AppImage destination keeps a custom filename and otherwise adopts the release name', { skip: skipAppImageOnWindows }, () => {
  assert.equal(
    appImageInstallDestination('/home/teacher/GuEarth.AppImage', RELEASE_ASSETS.appImageX64),
    '/home/teacher/GuEarth.AppImage'
  )
  assert.equal(
    appImageInstallDestination('/home/teacher/guearth-0.1.16-x86_64.AppImage', RELEASE_ASSETS.appImageX64),
    `/home/teacher/${RELEASE_ASSETS.appImageX64}`
  )
  assert.equal(
    appImageInstallDestination(`/home/teacher/${RELEASE_ASSETS.appImageX64}`, RELEASE_ASSETS.appImageX64),
    `/home/teacher/${RELEASE_ASSETS.appImageX64}`
  )
  assert.equal(appImageInstallDestination('guearth.AppImage', RELEASE_ASSETS.appImageX64), null)
  assert.equal(appImageInstallDestination('/home/teacher/guearth.AppImage', '../guearth.AppImage'), null)
  assert.equal(appImageInstallDestination('/home/teacher/guearth.AppImage\0', RELEASE_ASSETS.appImageX64), null)
})

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'guearth-appimage-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('installing an AppImage replaces a versioned file with the release asset', { skip: skipAppImageOnWindows }, () => {
  withTempDir((dir) => {
    const current = join(dir, 'guearth-0.1.16-x86_64.AppImage')
    const installerDir = join(dir, 'download')
    const installer = join(installerDir, 'guearth-0.1.17-x64.AppImage')
    mkdirSync(installerDir)
    writeFileSync(current, 'old-image')
    writeFileSync(installer, 'new-image')
    const destination = installAppImageFile(installer, current, RELEASE_ASSETS.appImageX64)
    assert.equal(destination, join(dir, RELEASE_ASSETS.appImageX64))
    assert.equal(readFileSync(destination, 'utf8'), 'new-image')
    assert.equal(statSync(destination).mode & 0o777, 0o755)
    assert.throws(() => statSync(current))
    assert.throws(() => statSync(installer))
    assert.throws(() => statSync(join(dir, `.${RELEASE_ASSETS.appImageX64}.update`)))
  })
})

test('installing an AppImage overwrites a custom filename in place', { skip: skipAppImageOnWindows }, () => {
  withTempDir((dir) => {
    const current = join(dir, 'GuEarth.AppImage')
    const installer = join(dir, 'download.bin')
    writeFileSync(current, 'old-image')
    writeFileSync(installer, 'new-image')
    const destination = installAppImageFile(installer, current, RELEASE_ASSETS.appImageArm64)
    assert.equal(destination, current)
    assert.equal(readFileSync(current, 'utf8'), 'new-image')
    assert.equal(statSync(current).mode & 0o777, 0o755)
    assert.throws(() => statSync(installer))
  })
})

test('a rejected AppImage path leaves the current file untouched', { skip: skipAppImageOnWindows }, () => {
  withTempDir((dir) => {
    const current = join(dir, 'guearth-0.1.16-x86_64.AppImage')
    const installer = join(dir, 'download.bin')
    writeFileSync(current, 'old-image')
    writeFileSync(installer, 'new-image')
    assert.throws(() => installAppImageFile(installer, 'relative.AppImage', RELEASE_ASSETS.appImageX64), /AppImage 路径无效/)
    assert.equal(readFileSync(current, 'utf8'), 'old-image')
    assert.equal(readFileSync(installer, 'utf8'), 'new-image')
  })
})

test('install prompts describe the package that will actually be applied', () => {
  assert.equal(updateInstallContent(''), '应用将退出并启动安装程序，完成后可重新打开咕咕地球。')
  assert.equal(updateInstallContent('nsis'), '应用将退出并启动安装程序，完成后可重新打开咕咕地球。')
  assert.match(updateInstallContent('appimage'), /AppImage/)
  assert.match(updateInstallContent('deb'), /系统授权/)
  assert.match(updateReadyHint('appimage'), /AppImage/)
  assert.match(updateReadyHint('deb'), /授权/)
  assert.match(updateReadyHint('nsis'), /重启安装/)
})

test('deb install plans use pkexec argv and skip elevation for root', () => {
  const file = '/home/teacher/.config/guearth/updates/guearth-0.1.18-x64.deb'
  assert.deepEqual(debInstallPlan(file, 1000, '/usr/bin/dpkg', '/usr/bin/pkexec'), {
    command: '/usr/bin/pkexec',
    args: ['--disable-internal-agent', '/usr/bin/dpkg', '-i', file]
  })
  assert.deepEqual(debInstallPlan(file, 0, '/usr/bin/dpkg', null), {
    command: '/usr/bin/dpkg',
    args: ['-i', file]
  })
  assert.equal(debInstallPlan(file, 1000, '/usr/bin/dpkg', null), null)
  assert.equal(debInstallPlan(file, 1000, null, '/usr/bin/pkexec'), null)
  assert.equal(debInstallPlan('relative.deb', 0, '/usr/bin/dpkg', null), null)
  assert.equal(debInstallPlan(file, 0, 'dpkg', null), null)
  assert.equal(debInstallPlan(file, 0, '/tmp/dpkg', null), null)
  assert.equal(debInstallPlan(file, 0, '/usr/local/bin/dpkg', null), null)
  assert.equal(debInstallPlan(file, 0, '/usr/bin/../tmp/dpkg', null), null)
  assert.equal(debInstallPlan(file, 1000, '/usr/bin/dpkg', '/tmp/pkexec'), null)
  assert.equal(debInstallPlan(file, 1000, '/usr/bin/dpkg', '/usr/bin/dpkg'), null)
  assert.deepEqual(debInstallPlan(file, 0, '/sbin/dpkg', null), {
    command: '/sbin/dpkg',
    args: ['-i', file]
  })
})

test('deb tools resolve only from trusted directories', () => {
  const dpkg = findTrustedExecutable('dpkg')
  const pkexec = findTrustedExecutable('pkexec')
  assert.equal(dpkg === null || /^\/(?:usr\/s?bin|s?bin)\/dpkg$/.test(dpkg), true)
  assert.equal(pkexec === null || /^\/(?:usr\/s?bin|s?bin)\/pkexec$/.test(pkexec), true)
  withTempDir((dir) => {
    const trusted = join(dir, 'bin')
    const outside = join(dir, 'outside')
    mkdirSync(trusted)
    mkdirSync(outside)
    const tool = join(trusted, 'dpkg')
    const evil = join(outside, 'dpkg')
    writeFileSync(tool, 'real')
    writeFileSync(evil, 'evil')
    assert.equal(findTrustedExecutable('dpkg', [trusted]), realpathSync(tool))
    assert.equal(findTrustedExecutable('dpkg', [outside]), realpathSync(evil))
    assert.equal(findTrustedExecutable('../dpkg', [trusted]), null)
    assert.equal(findTrustedExecutable('dpkg/../../bin/sh', [trusted]), null)
    assert.notEqual(findTrustedExecutable('dpkg'), realpathSync(tool))
    const planted = join(dir, 'planted')
    mkdirSync(planted)
    writeFileSync(join(planted, 'dpkg'), 'planted')
    writeFileSync(join(planted, 'pkexec'), 'planted')
    const previousPath = process.env.PATH
    process.env.PATH = `${planted}${delimiter}${previousPath ?? ''}`
    try {
      const resolvedDpkg = findTrustedExecutable('dpkg')
      const resolvedPkexec = findTrustedExecutable('pkexec')
      assert.equal(resolvedDpkg === null || !resolvedDpkg.startsWith(planted), true)
      assert.equal(resolvedPkexec === null || !resolvedPkexec.startsWith(planted), true)
    } finally {
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
    }
    try {
      symlinkSync(evil, join(trusted, 'pkexec'))
    } catch (error) {
      if (process.platform === 'win32') return
      throw error
    }
    assert.equal(findTrustedExecutable('pkexec', [trusted]), null)
  })
})
