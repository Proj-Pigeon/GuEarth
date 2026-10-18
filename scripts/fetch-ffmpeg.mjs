import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

export const FFMPEG_BUILD = {
  version: '8.1.3',
  archiveName: 'ffmpeg-8.1.3-win32-x64-lgpl.tar.xz',
  archiveSha256: '73422b77282a70b3012e4dc43ce6acbb220399a75039cc2bf15ce7b1ccf7993b',
  archiveBytes: 127358740,
  binaryMemberPath: 'ffmpeg-8.1.3-win32-x64-lgpl/bin/ffmpeg.exe',
  binarySha256: '77e7a67a4651fad7b7b4e5802272229a15f7e8b9491ace4c637a160594889b85',
  binaryBytes: 132246016
}

const pinnedArchiveUrls = [
  'https://registry.npmmirror.com/-/binary/ffmpeg-builds/v8.1.3/ffmpeg-8.1.3-win32-x64-lgpl.tar.xz',
  'https://github.com/KarinJS/FFmpeg-Builds/releases/download/v8.1.3/ffmpeg-8.1.3-win32-x64-lgpl.tar.xz'
]

export const APPROVED_ARCHIVE_HOSTS = ['registry.npmmirror.com', 'github.com']

export const APPROVED_ARCHIVE_REDIRECT_HOSTS = ['cdn.npmmirror.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']

const pinnedArchivePathSuffix = `/v${FFMPEG_BUILD.version}/${FFMPEG_BUILD.archiveName}`

const maxArchiveRedirects = 5

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
  return parsed != null && parsed.search === '' && parsed.hash === '' && parsed.pathname.endsWith(pinnedArchivePathSuffix)
}

export function approvedArchiveSource(overrideUrl) {
  if (!isApprovedArchiveUrl(overrideUrl)) {
    throw new Error(
      `FFMPEG_FETCH_URL 来源不受信任：${rejectedArchiveLabel(overrideUrl)}；仅允许主机为 ${APPROVED_ARCHIVE_HOSTS.join('、')} 的 HTTPS 地址，离线安装请将 FFMPEG_FETCH_FILE 指向本地归档`
    )
  }
  const parsed = parseArchiveUrl(overrideUrl)
  if (!matchesPinnedArchivePath(parsed.href)) {
    throw new Error(
      `FFMPEG_FETCH_URL 归档路径不受信任：${parsed.pathname}${parsed.search}；仅允许指向 v${FFMPEG_BUILD.version} 的 ${FFMPEG_BUILD.archiveName}，离线安装请将 FFMPEG_FETCH_FILE 指向本地归档`
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

export function archiveSources(overrideUrl) {
  if (!overrideUrl) return [...pinnedArchiveUrls]
  return [approvedArchiveSource(overrideUrl), ...pinnedArchiveUrls]
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function defaultBinaryPath(repoRoot) {
  return join(repoRoot, 'resources', 'bin', 'ffmpeg.exe')
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

export async function verifyFfmpegBinary(path) {
  if (!existsSync(path)) return { ok: false, reason: `文件不存在：${path}` }
  return verifyFile(path, { sha256: FFMPEG_BUILD.binarySha256, bytes: FFMPEG_BUILD.binaryBytes })
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

export async function fetchFfmpeg({ repoRoot, force = false } = {}) {
  if (process.platform !== 'win32') throw new Error('内置视频编码器目前仅提供 Windows x64 构建')
  const target = defaultBinaryPath(repoRoot)
  const current = await verifyFfmpegBinary(target)
  if (current.ok && !force) {
    console.log(`内置视频编码器已就绪：${target}`)
    return target
  }
  await mkdir(dirname(target), { recursive: true })
  const workDirectory = await mkdtemp(join(dirname(target), '.fetch-'))
  try {
    const archivePath = join(workDirectory, FFMPEG_BUILD.archiveName)
    const localArchive = process.env.FFMPEG_FETCH_FILE
    if (localArchive) {
      await copyFile(localArchive, archivePath)
      console.log(`使用本地归档：${localArchive}`)
      const localCheck = await verifyFile(archivePath, { sha256: FFMPEG_BUILD.archiveSha256, bytes: FFMPEG_BUILD.archiveBytes })
      if (!localCheck.ok) throw new Error(`归档校验失败：${localCheck.reason}`)
    } else {
      let lastError = null
      for (const source of archiveSources(process.env.FFMPEG_FETCH_URL)) {
        try {
          await download(source, archivePath)
          const sourceCheck = await verifyFile(archivePath, { sha256: FFMPEG_BUILD.archiveSha256, bytes: FFMPEG_BUILD.archiveBytes })
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
    await runFile(tarCommand(), ['-xf', archivePath, '-C', workDirectory, FFMPEG_BUILD.binaryMemberPath], { windowsHide: true })
    const extracted = join(workDirectory, FFMPEG_BUILD.binaryMemberPath)
    const binaryCheck = await verifyFile(extracted, { sha256: FFMPEG_BUILD.binarySha256, bytes: FFMPEG_BUILD.binaryBytes })
    if (!binaryCheck.ok) throw new Error(`编码器校验失败：${binaryCheck.reason}`)
    await rm(target, { force: true })
    await rename(extracted, target)
    console.log(`内置视频编码器已更新：${target}`)
    return target
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

const runsAsScript = process.argv[1] != null && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (runsAsScript) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  fetchFfmpeg({ repoRoot, force: process.argv.includes('--force') }).catch((error) => {
    console.error(`内置视频编码器获取失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
