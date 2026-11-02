import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

const ffmpegVersion = '8.1.3'

export const FFMPEG_BUILDS = {
  'win32-x64': {
    version: ffmpegVersion,
    platform: 'win32',
    arch: 'x64',
    archiveName: 'ffmpeg-8.1.3-win32-x64-lgpl.tar.xz',
    archiveSha256: '73422b77282a70b3012e4dc43ce6acbb220399a75039cc2bf15ce7b1ccf7993b',
    archiveBytes: 127358740,
    binaryMemberPath: 'ffmpeg-8.1.3-win32-x64-lgpl/bin/ffmpeg.exe',
    binaryName: 'ffmpeg.exe',
    binarySha256: '77e7a67a4651fad7b7b4e5802272229a15f7e8b9491ace4c637a160594889b85',
    binaryBytes: 132246016
  },
  'linux-x64': {
    version: ffmpegVersion,
    platform: 'linux',
    arch: 'x64',
    archiveName: 'ffmpeg-8.1.3-linux-x64-lgpl.tar.xz',
    archiveSha256: 'f31e025dc380fd4aa99dd4dc98eeeea631e16f0a9f3703c31e4cc02e653a5a60',
    archiveBytes: 136051144,
    binaryMemberPath: 'ffmpeg-8.1.3-linux-x64-lgpl/bin/ffmpeg',
    binaryName: 'ffmpeg',
    binarySha256: 'c52d9dd02bb63874f9d2c5ab96c96f043ca450f4ec6ecdf495a0c93659be1066',
    binaryBytes: 140970184
  },
  'linux-arm64': {
    version: ffmpegVersion,
    platform: 'linux',
    arch: 'arm64',
    archiveName: 'ffmpeg-8.1.3-linux-arm64-lgpl.tar.xz',
    archiveSha256: 'cdfcf36dc159c8173df9b970bc145d41a9092a26de0e49bc56c61ad171de1c59',
    archiveBytes: 115301160,
    binaryMemberPath: 'ffmpeg-8.1.3-linux-arm64-lgpl/bin/ffmpeg',
    binaryName: 'ffmpeg',
    binarySha256: 'bda9af06fd166c83dc43097477d34c25eebe077ebe4e21d646b605f710d59c70',
    binaryBytes: 116169984
  }
}

export const FFMPEG_BUILD = FFMPEG_BUILDS['win32-x64']

export const APPROVED_ARCHIVE_HOSTS = ['registry.npmmirror.com', 'github.com']

export const APPROVED_ARCHIVE_REDIRECT_HOSTS = ['cdn.npmmirror.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']

const maxArchiveRedirects = 5

const pinnedArchiveNames = new Set(Object.values(FFMPEG_BUILDS).map((build) => build.archiveName))

export function normalizeFfmpegArch(arch) {
  if (arch === 'x64' || arch === 'x86_64' || arch === 'amd64') return 'x64'
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64'
  return arch
}

export function ffmpegBuildFor(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${normalizeFfmpegArch(arch)}`
  const build = FFMPEG_BUILDS[key]
  if (!build) {
    throw new Error(`内置视频编码器目前提供 Windows x64 与 Linux x64/arm64 构建，当前平台 ${platform} ${arch} 暂不支持`)
  }
  return build
}

export function hostFfmpegBuild() {
  return FFMPEG_BUILDS[`${process.platform}-${normalizeFfmpegArch(process.arch)}`] ?? FFMPEG_BUILD
}

function pinnedArchiveUrls(build) {
  return [
    `https://registry.npmmirror.com/-/binary/ffmpeg-builds/v${build.version}/${build.archiveName}`,
    `https://github.com/KarinJS/FFmpeg-Builds/releases/download/v${build.version}/${build.archiveName}`
  ]
}

function parseArchiveUrl(value) {
  try {
    return new URL(String(value))
  } catch {
    return null
  }
}

function rejectedArchiveLabel(url) {
  const parsed = parseArchiveUrl(url)
  return parsed?.hostname || parsed?.protocol || String(url)
}

export function isApprovedArchiveUrl(url) {
  const parsed = parseArchiveUrl(url)
  return parsed != null && parsed.protocol === 'https:' && APPROVED_ARCHIVE_HOSTS.includes(parsed.hostname)
}

export function isApprovedArchiveRedirectUrl(url) {
  const parsed = parseArchiveUrl(url)
  if (parsed == null || parsed.protocol !== 'https:') return false
  return APPROVED_ARCHIVE_HOSTS.includes(parsed.hostname) || APPROVED_ARCHIVE_REDIRECT_HOSTS.includes(parsed.hostname)
}

export function archiveRedirectTarget(location, currentUrl) {
  if (location == null || location === '') throw new Error(`下载重定向缺少目标地址：${rejectedArchiveLabel(currentUrl)}`)
  let resolved = null
  try {
    resolved = new URL(location, currentUrl).href
  } catch {
    throw new Error(`下载重定向目标无法解析：${location}`)
  }
  if (!isApprovedArchiveRedirectUrl(resolved)) {
    throw new Error(`拒绝下载未经验证的重定向目标：${rejectedArchiveLabel(resolved)}`)
  }
  return resolved
}

export function matchesPinnedArchivePath(url) {
  const parsed = parseArchiveUrl(url)
  if (parsed == null || parsed.search !== '' || parsed.hash !== '') return false
  const name = parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1)
  return pinnedArchiveNames.has(name) && parsed.pathname.endsWith(`/v${ffmpegVersion}/${name}`)
}

export function approvedArchiveSource(overrideUrl) {
  if (!isApprovedArchiveUrl(overrideUrl)) {
    throw new Error(
      `FFMPEG_FETCH_URL 来源不受信任：${rejectedArchiveLabel(overrideUrl)}；仅允许主机为 ${APPROVED_ARCHIVE_HOSTS.join('、')} 的 HTTPS 地址，离线安装请将 FFMPEG_FETCH_FILE 指向本地归档`
    )
  }
  const parsed = parseArchiveUrl(overrideUrl)
  if (!matchesPinnedArchivePath(parsed.href)) {
    const allowed = [...pinnedArchiveNames].join('、')
    throw new Error(
      `FFMPEG_FETCH_URL 归档路径不受信任：${parsed.pathname}${parsed.search}；仅允许指向 v${ffmpegVersion} 的 ${allowed}，离线安装请将 FFMPEG_FETCH_FILE 指向本地归档`
    )
  }
  const approvedHost = APPROVED_ARCHIVE_HOSTS.find((host) => host === parsed.hostname)
  return new URL(parsed.pathname, `https://${approvedHost}/`).href
}

export function assertArchiveSource(url) {
  if (!isApprovedArchiveUrl(url) || !matchesPinnedArchivePath(url)) {
    throw new Error(`拒绝下载未经验证的来源：${rejectedArchiveLabel(url)}`)
  }
  return url
}

export function archiveSources(overrideUrl, build = hostFfmpegBuild()) {
  const pinned = pinnedArchiveUrls(build)
  if (!overrideUrl) return [...pinned]
  return [approvedArchiveSource(overrideUrl), ...pinned]
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function defaultBinaryPath(repoRoot, platform = process.platform, arch = process.arch) {
  const normalized = normalizeFfmpegArch(arch)
  const build = FFMPEG_BUILDS[`${platform}-${normalized}`]
  if (!build) return join(repoRoot, 'resources', 'bin', 'ffmpeg.exe')
  if (build.platform !== 'linux') return join(repoRoot, 'resources', 'bin', build.binaryName)
  const isHost = platform === process.platform && normalized === normalizeFfmpegArch(process.arch)
  if (isHost) return join(repoRoot, 'resources', 'bin', build.binaryName)
  return join(repoRoot, 'resources', 'bin', normalized, build.binaryName)
}

export function packagedBinaryPath(repoRoot, platform = process.platform, arch = process.arch) {
  const normalized = normalizeFfmpegArch(arch)
  const build = FFMPEG_BUILDS[`${platform}-${normalized}`]
  if (!build) return defaultBinaryPath(repoRoot, platform, arch)
  if (build.platform === 'linux') return join(repoRoot, 'resources', 'bin', normalized, build.binaryName)
  return join(repoRoot, 'resources', 'bin', build.binaryName)
}

function outputPaths(repoRoot, build) {
  return [...new Set([
    packagedBinaryPath(repoRoot, build.platform, build.arch),
    defaultBinaryPath(repoRoot, build.platform, build.arch)
  ])]
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyFile(path, { sha256, bytes }) {
  const info = await stat(path)
  if (bytes !== undefined && info.size !== bytes) {
    return { ok: false, reason: `大小不符（期望 ${bytes} 字节，实际 ${info.size} 字节）` }
  }
  const digest = await sha256File(path)
  if (digest !== sha256) return { ok: false, reason: `SHA256 不符（期望 ${sha256}，实际 ${digest}）` }
  return { ok: true }
}

export async function verifyFfmpegBinary(path, build = hostFfmpegBuild()) {
  if (!existsSync(path)) return { ok: false, reason: `文件不存在：${path}` }
  return verifyFile(path, { sha256: build.binarySha256, bytes: build.binaryBytes })
}

async function binaryMatches(path, build) {
  if (!existsSync(path)) return false
  const current = await verifyFile(path, { sha256: build.binarySha256, bytes: build.binaryBytes })
  return current.ok
}

function tarCommand() {
  if (process.platform !== 'win32') return 'tar'
  const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return existsSync(systemTar) ? systemTar : 'tar'
}

async function fetchArchive(url) {
  assertArchiveSource(url)
  let current = url
  for (let hop = 0; hop <= maxArchiveRedirects; hop += 1) {
    const response = await fetch(current, { redirect: 'manual', headers: { 'user-agent': 'GuEarth-FFmpeg-Fetch' } })
    if (response.status < 300 || response.status >= 400) return response
    if (hop === maxArchiveRedirects) break
    current = archiveRedirectTarget(response.headers.get('location'), current)
  }
  throw new Error(`下载重定向次数过多：${rejectedArchiveLabel(url)}`)
}

async function download(url, destination) {
  console.log(`下载内置视频编码器：${url}`)
  const response = await fetchArchive(url)
  if (!response.ok || response.body == null) throw new Error(`HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function placeBinary(extracted, targets) {
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true })
    await rm(target, { force: true })
    await copyFile(extracted, target)
    if (process.platform !== 'win32') await chmod(target, 0o755)
  }
}

export async function fetchFfmpeg({ repoRoot, force = false, platform = process.platform, arch = process.arch } = {}) {
  const build = ffmpegBuildFor(platform, arch)
  const targets = outputPaths(repoRoot, build)
  if (!force) {
    const ready = await Promise.all(targets.map((target) => binaryMatches(target, build)))
    if (ready.every(Boolean)) {
      console.log(`内置视频编码器已就绪：${targets.join('、')}`)
      return targets[0]
    }
  }
  await mkdir(dirname(targets[0]), { recursive: true })
  const workDirectory = await mkdtemp(join(dirname(targets[0]), '.fetch-'))
  try {
    const archivePath = join(workDirectory, build.archiveName)
    const localArchive = process.env.FFMPEG_FETCH_FILE
    if (localArchive) {
      await copyFile(localArchive, archivePath)
      console.log(`使用本地归档：${localArchive}`)
      const localCheck = await verifyFile(archivePath, { sha256: build.archiveSha256, bytes: build.archiveBytes })
      if (!localCheck.ok) throw new Error(`归档校验失败：${localCheck.reason}`)
    } else {
      let lastError = null
      for (const source of archiveSources(process.env.FFMPEG_FETCH_URL, build)) {
        try {
          await download(source, archivePath)
          const sourceCheck = await verifyFile(archivePath, { sha256: build.archiveSha256, bytes: build.archiveBytes })
          if (!sourceCheck.ok) throw new Error(`归档校验失败：${sourceCheck.reason}`)
          lastError = null
          break
        } catch (error) {
          lastError = error
          console.warn(`来源不可用：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (lastError) throw lastError
    }
    await runFile(tarCommand(), ['-xf', archivePath, '-C', workDirectory, build.binaryMemberPath], { windowsHide: true })
    const extracted = join(workDirectory, build.binaryMemberPath)
    const binaryCheck = await verifyFile(extracted, { sha256: build.binarySha256, bytes: build.binaryBytes })
    if (!binaryCheck.ok) throw new Error(`编码器校验失败：${binaryCheck.reason}`)
    await placeBinary(extracted, targets)
    console.log(`内置视频编码器已更新：${targets.join('、')}`)
    return targets[0]
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

function buildsFromArgs(argv) {
  const index = argv.indexOf('--arch')
  if (index < 0) return [ffmpegBuildFor(process.platform, process.arch)]
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error('请在 --arch 后指定 x64、arm64 或 all')
  if (value === 'all') return [FFMPEG_BUILDS['linux-x64'], FFMPEG_BUILDS['linux-arm64']]
  if (argv.includes('--linux') || process.platform === 'linux') return [ffmpegBuildFor('linux', value)]
  return [ffmpegBuildFor(process.platform, value)]
}

const runsAsScript = process.argv[1] != null && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (runsAsScript) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const force = process.argv.includes('--force')
  Promise.all(buildsFromArgs(process.argv).map((build) => fetchFfmpeg({
    repoRoot,
    force,
    platform: build.platform,
    arch: build.arch
  }))).catch((error) => {
    console.error(`内置视频编码器获取失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
