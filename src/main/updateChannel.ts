import { chmodSync, copyFileSync, linkSync, renameSync, rmSync } from 'fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path'

const SAFE_ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
const VERSIONED_FILE_NAME = /\d+\.\d+\.\d+/
const ABSOLUTE_PATH = /^\/[^\0]*$/
const HAZEL_EXTENSIONS = new Set(['exe', 'dmg', 'rpm', 'deb', 'AppImage'])

const HAZEL_ALIAS_GROUPS: Record<string, readonly string[]> = {
  darwin: ['mac', 'macos', 'osx'],
  exe: ['win32', 'windows', 'win'],
  deb: ['debian'],
  rpm: ['fedora'],
  AppImage: ['appimage'],
  dmg: ['dmg']
}

const HAZEL_ALIASES: Record<string, readonly string[]> = {}
for (const [platform, aliases] of Object.entries(HAZEL_ALIAS_GROUPS)) {
  HAZEL_ALIASES[platform] = aliases
  HAZEL_ALIASES[`${platform}_arm64`] = aliases.map((alias) => `${alias}_arm64`)
}

export const DEB_INSTALL_EXECUTABLE = '/opt/GuEarth/guearth'
export const DEB_INSTALL_RESOURCES = '/opt/GuEarth/resources'

export function isDebInstallLocation(paths: readonly string[]): boolean {
  return paths.some((candidate) => candidate === DEB_INSTALL_EXECUTABLE || candidate === DEB_INSTALL_RESOURCES)
}

export type UpdateArch = 'x64' | 'arm64'
export type UpdatePackageKind = 'nsis' | 'appimage' | 'deb'

export interface UpdateTarget {
  kind: UpdatePackageKind
  arch: UpdateArch
  feedPlatform: string
}

export interface UpdateRuntime {
  platform: string
  arch: string
  appImagePath?: string
  debInstalled: boolean
  packageKindOverride?: string
  allowPackageKindOverride: boolean
}

export interface CommandPlan {
  command: string
  args: string[]
}

export function canonicalHazelPlatform(platform: string): string | null {
  if (Object.prototype.hasOwnProperty.call(HAZEL_ALIASES, platform)) return platform
  for (const [guess, aliases] of Object.entries(HAZEL_ALIASES)) {
    if (aliases.includes(platform)) return guess
  }
  return null
}

export function hazelPlatformForAssetName(fileName: string): string | null {
  const slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  const extension = base.slice(dot + 1)
  if (!HAZEL_EXTENSIONS.has(extension)) return null
  const archSuffix = base.includes('arm64') || base.includes('aarch64') ? '_arm64' : ''
  return `${extension}${archSuffix}`
}

export function assetNameFromUrl(downloadUrl: string): string | null {
  let pathname = ''
  try {
    const parsed = new URL(downloadUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    pathname = parsed.pathname
  } catch {
    return null
  }
  const raw = pathname.split('/').pop() ?? ''
  if (!raw) return null
  let name = ''
  try {
    name = decodeURIComponent(raw)
  } catch {
    return null
  }
  return SAFE_ASSET_NAME.test(name) ? name : null
}

export function assetNameMatchesFeed(fileName: string, feedPlatform: string): boolean {
  const assetPlatform = hazelPlatformForAssetName(fileName)
  const expected = canonicalHazelPlatform(feedPlatform)
  return assetPlatform !== null && expected !== null && assetPlatform === expected
}

export function updateFeedPath(baseUrl: string, feedPlatform: string, currentVersion: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/update/${feedPlatform}/${currentVersion}`
}

export function feedPlatformFor(kind: UpdatePackageKind, arch: UpdateArch): string | null {
  if (kind === 'nsis' && arch === 'x64') return 'win32'
  if (kind === 'appimage' && arch === 'x64') return 'appimage'
  if (kind === 'appimage' && arch === 'arm64') return 'appimage_arm64'
  if (kind === 'deb' && arch === 'x64') return 'deb'
  if (kind === 'deb' && arch === 'arm64') return 'deb_arm64'
  return null
}

function asArch(arch: string): UpdateArch | null {
  if (arch === 'x64' || arch === 'arm64') return arch
  return null
}

export function resolveLinuxPackageKind(runtime: UpdateRuntime): 'appimage' | 'deb' | null {
  const override = runtime.packageKindOverride?.trim()
  if (runtime.allowPackageKindOverride && (override === 'appimage' || override === 'deb')) return override
  if (runtime.appImagePath && runtime.appImagePath.trim()) return 'appimage'
  if (runtime.debInstalled) return 'deb'
  return null
}

export function resolveUpdateTarget(runtime: UpdateRuntime): UpdateTarget | null {
  const arch = asArch(runtime.arch)
  if (!arch) return null
  if (runtime.platform === 'win32') {
    if (arch !== 'x64') return null
    return { kind: 'nsis', arch, feedPlatform: 'win32' }
  }
  if (runtime.platform !== 'linux') return null
  const kind = resolveLinuxPackageKind(runtime)
  if (!kind) return null
  const feedPlatform = feedPlatformFor(kind, arch)
  if (!feedPlatform) return null
  return { kind, arch, feedPlatform }
}

export function isPathInsideDirectory(filePath: string, directory: string): boolean {
  if (!filePath || !directory) return false
  const root = resolve(directory)
  const target = resolve(filePath)
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  return target.startsWith(prefix)
}

export function appImageInstallDestination(currentPath: string, assetFileName: string): string | null {
  if (!isAbsolute(currentPath) || currentPath.includes('\0')) return null
  if (!SAFE_ASSET_NAME.test(assetFileName)) return null
  const existingBaseName = basename(currentPath)
  if (existingBaseName === assetFileName || !VERSIONED_FILE_NAME.test(existingBaseName)) return currentPath
  return join(dirname(currentPath), assetFileName)
}

export function installAppImageFile(installerPath: string, currentAppImage: string, assetFileName: string): string {
  if (!ABSOLUTE_PATH.test(installerPath)) throw new Error('更新包路径无效')
  const destination = appImageInstallDestination(currentAppImage, assetFileName)
  if (!destination) throw new Error('AppImage 路径无效，无法安装更新')
  chmodSync(installerPath, 0o755)
  const staged = join(dirname(destination), `.${basename(destination)}.update`)
  rmSync(staged, { force: true })
  try {
    try {
      linkSync(installerPath, staged)
    } catch {
      copyFileSync(installerPath, staged)
    }
    chmodSync(staged, 0o755)
    renameSync(staged, destination)
  } catch (error) {
    rmSync(staged, { force: true })
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`无法替换 AppImage：${reason}`)
  }
  chmodSync(destination, 0o755)
  if (installerPath !== destination) rmSync(installerPath, { force: true })
  if (destination !== currentAppImage) rmSync(currentAppImage, { force: true })
  return destination
}

export function debInstallPlan(installerPath: string, uid: number, dpkgPath: string | null, pkexecPath: string | null): CommandPlan | null {
  if (!ABSOLUTE_PATH.test(installerPath)) return null
  if (!dpkgPath || !ABSOLUTE_PATH.test(dpkgPath)) return null
  if (uid === 0) return { command: dpkgPath, args: ['-i', installerPath] }
  if (!pkexecPath || !ABSOLUTE_PATH.test(pkexecPath)) return null
  return { command: pkexecPath, args: ['--disable-internal-agent', dpkgPath, '-i', installerPath] }
}
