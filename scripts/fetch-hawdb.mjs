import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

export const HAWDB_VERSION = '0.35.1'

export const HAWDB_BUILDS = {
  'win32-x64': {
    version: HAWDB_VERSION,
    platform: 'win32',
    arch: 'x64',
    triple: 'x86_64-pc-windows-msvc',
    archiveName: `hawdb-ffi-${HAWDB_VERSION}-x86_64-pc-windows-msvc.zip`,
    archiveSha256: 'd3351d72b2717bc7fdf45ed697d670b457ced247de9d3728ecde92eb727d7357',
    binaryMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-pc-windows-msvc/bin/hawdb_ffi.dll`,
    manifestMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-pc-windows-msvc/manifest.json`,
    binaryName: 'hawdb_ffi.dll'
  },
  'linux-x64': {
    version: HAWDB_VERSION,
    platform: 'linux',
    arch: 'x64',
    triple: 'x86_64-unknown-linux-gnu',
    archiveName: `hawdb-ffi-${HAWDB_VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
    archiveSha256: 'ac4cf5d1696ac307c74e8edbb886968f25d258e3e09cebc300fc7dd339a287bb',
    binaryMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-unknown-linux-gnu/lib/libhawdb_ffi.so`,
    manifestMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-unknown-linux-gnu/manifest.json`,
    binaryName: 'libhawdb_ffi.so'
  },
  'linux-arm64': {
    version: HAWDB_VERSION,
    platform: 'linux',
    arch: 'arm64',
    triple: 'aarch64-unknown-linux-gnu',
    archiveName: `hawdb-ffi-${HAWDB_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    archiveSha256: 'ffd93cea5fc399014ffe2fde1231f8a5c14ea8e1d0012ab3a7c1492ded72ff0a',
    binaryMemberPath: `hawdb-ffi-${HAWDB_VERSION}-aarch64-unknown-linux-gnu/lib/libhawdb_ffi.so`,
    manifestMemberPath: `hawdb-ffi-${HAWDB_VERSION}-aarch64-unknown-linux-gnu/manifest.json`,
    binaryName: 'libhawdb_ffi.so'
  },
  'darwin-arm64': {
    version: HAWDB_VERSION,
    platform: 'darwin',
    arch: 'arm64',
    triple: 'aarch64-apple-darwin',
    archiveName: `hawdb-ffi-${HAWDB_VERSION}-aarch64-apple-darwin.tar.gz`,
    archiveSha256: '55d06dcd0be08f1278363e09cc95c39c213d360a075c5bcad123f24205ee7c6b',
    binaryMemberPath: `hawdb-ffi-${HAWDB_VERSION}-aarch64-apple-darwin/lib/libhawdb_ffi.dylib`,
    manifestMemberPath: `hawdb-ffi-${HAWDB_VERSION}-aarch64-apple-darwin/manifest.json`,
    binaryName: 'libhawdb_ffi.dylib'
  },
  'darwin-x64': {
    version: HAWDB_VERSION,
    platform: 'darwin',
    arch: 'x64',
    triple: 'x86_64-apple-darwin',
    archiveName: `hawdb-ffi-${HAWDB_VERSION}-x86_64-apple-darwin.tar.gz`,
    archiveSha256: 'afd874c4de16684d6752991a390720396c42b0e06677e7f4289c89c1062a25db',
    binaryMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-apple-darwin/lib/libhawdb_ffi.dylib`,
    manifestMemberPath: `hawdb-ffi-${HAWDB_VERSION}-x86_64-apple-darwin/manifest.json`,
    binaryName: 'libhawdb_ffi.dylib'
  }
}

export const APPROVED_ARCHIVE_HOSTS = ['github.com']
export const APPROVED_ARCHIVE_REDIRECT_HOSTS = ['objects.githubusercontent.com', 'release-assets.githubusercontent.com']

const maxArchiveRedirects = 5
const pinnedArchiveNames = new Set(Object.values(HAWDB_BUILDS).map((build) => build.archiveName))

export function normalizeHawdbArch(arch) {
  if (arch === 'x64' || arch === 'x86_64' || arch === 'amd64') return 'x64'
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64'
  return arch
}

export function hawdbBuildFor(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${normalizeHawdbArch(arch)}`
  const build = HAWDB_BUILDS[key]
  if (!build) {
    throw new Error(`HawDB 预编译库目前支持 Windows x64、Linux x64/arm64 与 macOS x64/arm64，当前平台 ${platform} ${arch} 暂不支持`)
  }
  return build
}

export function hostHawdbBuild() {
  return HAWDB_BUILDS[`${process.platform}-${normalizeHawdbArch(process.arch)}`] ?? HAWDB_BUILDS['win32-x64']
}

function pinnedArchiveUrls(build) {
  return [`https://github.com/nowledge-co/hawdb/releases/download/v${build.version}/${build.archiveName}`]
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
  return pinnedArchiveNames.has(name) && parsed.pathname.endsWith(`/v${HAWDB_VERSION}/${name}`)
}

export function approvedArchiveSource(overrideUrl) {
  if (!isApprovedArchiveUrl(overrideUrl)) {
    throw new Error(
      `HAWDB_FETCH_URL 来源不受信任：${rejectedArchiveLabel(overrideUrl)}；仅允许主机为 ${APPROVED_ARCHIVE_HOSTS.join('、')} 的 HTTPS 地址，离线安装请将 HAWDB_FETCH_FILE 指向本地归档`
    )
  }
  const parsed = parseArchiveUrl(overrideUrl)
  if (!matchesPinnedArchivePath(parsed.href)) {
    const allowed = [...pinnedArchiveNames].join('、')
    throw new Error(
      `HAWDB_FETCH_URL 归档路径不受信任：${parsed.pathname}${parsed.search}；仅允许指向 v${HAWDB_VERSION} 的 ${allowed}`
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

export function assertFetchableUrl(url) {
  if (!isApprovedArchiveRedirectUrl(url)) {
    throw new Error(`拒绝请求未经验证的地址：${rejectedArchiveLabel(url)}`)
  }
  return url
}

export function archiveSources(overrideUrl, build = hostHawdbBuild()) {
  const pinned = pinnedArchiveUrls(build)
  if (!overrideUrl) return [...pinned]
  return [approvedArchiveSource(overrideUrl), ...pinned]
}

export function defaultHawdbBinaryPath(repoRoot, platform = process.platform, arch = process.arch) {
  const normalized = normalizeHawdbArch(arch)
  const build = HAWDB_BUILDS[`${platform}-${normalized}`]
  if (!build) return join(repoRoot, 'resources', 'bin', 'hawdb_ffi.dll')
  if (build.platform === 'win32') return join(repoRoot, 'resources', 'bin', build.binaryName)
  const isHost = platform === process.platform && normalized === normalizeHawdbArch(process.arch)
  if (isHost) return join(repoRoot, 'resources', 'bin', build.binaryName)
  return join(repoRoot, 'resources', 'bin', normalized, build.binaryName)
}

export function packagedHawdbBinaryPath(repoRoot, platform = process.platform, arch = process.arch) {
  const normalized = normalizeHawdbArch(arch)
  const build = HAWDB_BUILDS[`${platform}-${normalized}`]
  if (!build) return defaultHawdbBinaryPath(repoRoot, platform, arch)
  if (build.platform === 'win32') return join(repoRoot, 'resources', 'bin', build.binaryName)
  return join(repoRoot, 'resources', 'bin', normalized, build.binaryName)
}

function outputPaths(repoRoot, build) {
  return [...new Set([
    packagedHawdbBinaryPath(repoRoot, build.platform, build.arch),
    defaultHawdbBinaryPath(repoRoot, build.platform, build.arch)
  ])]
}

function stampPath(binaryPath) {
  return `${binaryPath}.stamp.json`
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

async function binaryMatchesStamp(path, build) {
  if (!existsSync(path) || !existsSync(stampPath(path))) return false
  try {
    const stamp = JSON.parse(await readFile(stampPath(path), 'utf8'))
    if (stamp.version !== build.version || stamp.triple !== build.triple || stamp.archiveSha256 !== build.archiveSha256) {
      return false
    }
    const result = await verifyFile(path, { sha256: stamp.binarySha256, bytes: stamp.binaryBytes })
    return result.ok
  } catch {
    return false
  }
}

function tarCommand() {
  if (process.platform !== 'win32') return 'tar'
  const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return existsSync(systemTar) ? systemTar : 'tar'
}

async function fetchArchive(url) {
  let current = assertArchiveSource(url)
  for (let hop = 0; hop <= maxArchiveRedirects; hop += 1) {
    const response = await fetch(assertFetchableUrl(current), { redirect: 'manual', headers: { 'user-agent': 'GuEarth-HawDB-Fetch' } })
    if (response.status < 300 || response.status >= 400) return response
    if (hop === maxArchiveRedirects) break
    current = archiveRedirectTarget(response.headers.get('location'), current)
  }
  throw new Error(`下载重定向次数过多：${rejectedArchiveLabel(url)}`)
}

async function download(url, destination) {
  console.log(`下载 HawDB 引擎库：${url}`)
  const response = await fetchArchive(url)
  if (!response.ok || response.body == null) throw new Error(`HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function extractMembers(archivePath, members, workDirectory) {
  if (archivePath.endsWith('.zip') && process.platform !== 'win32') {
    await runFile('unzip', ['-o', archivePath, ...members, '-d', workDirectory], { windowsHide: true })
    return
  }
  const flag = archivePath.endsWith('.tar.gz') ? '-xzf' : '-xf'
  await runFile(tarCommand(), [flag, archivePath, '-C', workDirectory, ...members], { windowsHide: true })
}

async function placeBinary(extracted, targets, stamp) {
  const stampText = `${JSON.stringify(stamp, null, 2)}\n`
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true })
    await rm(target, { force: true })
    await copyFile(extracted, target)
    if (process.platform !== 'win32') await chmod(target, 0o755)
    await writeFile(stampPath(target), stampText, 'utf8')
  }
}

export async function fetchHawdb({ repoRoot, force = false, platform = process.platform, arch = process.arch } = {}) {
  const build = hawdbBuildFor(platform, arch)
  const targets = outputPaths(repoRoot, build)
  if (!force) {
    const ready = await Promise.all(targets.map((target) => binaryMatchesStamp(target, build)))
    if (ready.every(Boolean)) {
      console.log(`HawDB 引擎库已就绪：${targets.join('、')}`)
      return targets[0]
    }
  }
  await mkdir(dirname(targets[0]), { recursive: true })
  const workDirectory = await mkdtemp(join(dirname(targets[0]), '.fetch-hawdb-'))
  try {
    const archivePath = join(workDirectory, build.archiveName)
    const localArchive = process.env.HAWDB_FETCH_FILE
    if (localArchive) {
      await copyFile(localArchive, archivePath)
      console.log(`使用本地 HawDB 归档：${localArchive}`)
      const localCheck = await verifyFile(archivePath, { sha256: build.archiveSha256 })
      if (!localCheck.ok) throw new Error(`归档校验失败：${localCheck.reason}`)
    } else {
      let lastError = null
      for (const source of archiveSources(process.env.HAWDB_FETCH_URL, build)) {
        try {
          await download(source, archivePath)
          const sourceCheck = await verifyFile(archivePath, { sha256: build.archiveSha256 })
          if (!sourceCheck.ok) throw new Error(`归档校验失败：${sourceCheck.reason}`)
          lastError = null
          break
        } catch (error) {
          lastError = error
          await rm(archivePath, { force: true })
        }
      }
      if (lastError) throw lastError
    }
    await extractMembers(archivePath, [build.binaryMemberPath, build.manifestMemberPath], workDirectory)
    const extractedBinary = join(workDirectory, ...build.binaryMemberPath.split('/'))
    const extractedManifest = join(workDirectory, ...build.manifestMemberPath.split('/'))
    const binaryInfo = await stat(extractedBinary)
    const binarySha256 = await sha256File(extractedBinary)
    if (existsSync(extractedManifest)) {
      const manifest = JSON.parse(await readFile(extractedManifest, 'utf8'))
      const relPath = build.binaryMemberPath.split('/').slice(1).join('/')
      const entry = Array.isArray(manifest.files)
        ? manifest.files.find((item) => item?.path === relPath)
        : manifest.files?.[relPath]
      if (entry?.sha256 && entry.sha256 !== binarySha256) {
        throw new Error(`manifest 校验失败：期望 ${entry.sha256}，实际 ${binarySha256}`)
      }
    }
    const stamp = {
      version: build.version,
      triple: build.triple,
      archiveSha256: build.archiveSha256,
      binarySha256,
      binaryBytes: binaryInfo.size
    }
    await placeBinary(extractedBinary, targets, stamp)
    console.log(`已安装 HawDB ${build.version}（${build.triple}）：${targets.join('、')}`)
    return targets[0]
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

const BOOLEAN_FLAGS = new Set(['--force'])

const VALUE_FLAGS = new Map([
  ['--platform', 'platform'],
  ['--arch', 'archArg']
])

const ALL_ARCH_PLATFORMS = new Set(['linux', 'darwin'])

export function parseCliArgs(argv) {
  const options = { force: false, platform: process.platform, archArg: process.arch }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (BOOLEAN_FLAGS.has(token)) {
      options.force = true
      continue
    }
    const target = VALUE_FLAGS.get(token)
    if (target && argv[i + 1]) {
      options[target] = argv[i + 1]
      i += 1
    }
  }
  return options
}

const isEntrypoint = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isEntrypoint) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const { force, platform, archArg } = parseCliArgs(process.argv.slice(2))
  const arches = archArg === 'all'
    ? (ALL_ARCH_PLATFORMS.has(platform) ? ['x64', 'arm64'] : ['x64'])
    : [archArg]
  for (const arch of arches) {
    await fetchHawdb({ repoRoot, force, platform, arch })
  }
}
