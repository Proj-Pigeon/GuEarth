import { app, BrowserWindow, ipcMain, net } from 'electron'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, type WriteStream } from 'fs'
import { join } from 'path'
import { logger } from '../common/logger'
import type { UpdateState, UpdaterEvent } from '../preload'
import { compareVersions, extractAssetDigest, hashFile, isRecord, parseSha256, releaseTagCandidates } from './updateIntegrity'

const DEFAULT_UPDATE_BASE_URL = 'https://guearth-updater.isla.fan'
const GITHUB_API_BASE = 'https://api.github.com'
const RELEASES_REPO = 'Proj-Pigeon/GuEarth'
const CHECK_TIMEOUT_MS = 15000
const PROGRESS_EMIT_INTERVAL_MS = 400
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const INSTALL_QUIT_DELAY_MS = 300

let downloadsDir = ''
let status: UpdateState['status'] = 'idle'
let version = ''
let notes = ''
let downloadUrl = ''
let installerPath = ''
let receivedBytes = 0
let totalBytes = 0
let expectedSha256 = ''

function updateCheckEnabled(): boolean {
  return process.platform === 'win32' && (app.isPackaged || process.env['GUEARTH_UPDATE_URL'] !== undefined)
}

function updateBaseUrl(): string {
  return process.env['GUEARTH_UPDATE_URL'] ?? DEFAULT_UPDATE_BASE_URL
}

function installerPathFor(targetVersion: string): string {
  return join(downloadsDir, `guearth-${targetVersion}-setup.exe`)
}

function snapshot(): UpdateState {
  return { status, currentVersion: app.getVersion(), version, received: receivedBytes, total: totalBytes }
}

function emit(event: UpdaterEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:event', event)
  }
}

function cleanupStaleInstallers(keepPath: string): void {
  if (!existsSync(downloadsDir)) return
  for (const name of readdirSync(downloadsDir)) {
    const path = join(downloadsDir, name)
    if (path !== keepPath) {
      try {
        rmSync(path, { force: true })
      } catch {
        void 0
      }
    }
  }
}

async function resolveDigestFromGitHub(rawName: unknown, version: string, downloadUrl: string): Promise<string | null> {
  for (const tag of releaseTagCandidates(rawName, version)) {
    try {
      const response = await net.fetch(`${GITHUB_API_BASE}/repos/${RELEASES_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      })
      if (response.status !== 200) continue
      const digest = extractAssetDigest(await response.json(), downloadUrl)
      if (digest) {
        logger.info('updater', '更新源清单未携带 sha256，已从 GitHub 发布资产摘要解析校验值', { tag })
        return digest
      }
    } catch {
      void 0
    }
  }
  return null
}

async function checkForUpdate(): Promise<void> {
  if (status === 'downloading' || status === 'ready') return
  try {
    const response = await net.fetch(`${updateBaseUrl()}/update/win32/${app.getVersion()}`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    if (response.status !== 200) return
    const payload: unknown = await response.json()
    if (!isRecord(payload)) return
    const remoteVersion = typeof payload.name === 'string' ? payload.name.replace(/^v/, '').trim() : ''
    const url = typeof payload.url === 'string' ? payload.url.trim() : ''
    if (!VERSION_PATTERN.test(remoteVersion) || compareVersions(remoteVersion, app.getVersion()) <= 0) return
    if (!/^https?:\/\/\S+$/i.test(url)) return
    const sha256 = parseSha256(payload.sha256) ?? (await resolveDigestFromGitHub(payload.name, remoteVersion, url))
    if (!sha256) {
      logger.warn('updater', '更新源清单与 GitHub 发布资产均未提供有效 sha256，已忽略该更新', { version: remoteVersion })
      return
    }
    version = remoteVersion
    notes = typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : ''
    downloadUrl = url
    expectedSha256 = sha256
    status = 'available'
    emit({ type: 'available', version, notes })
  } catch {
    void 0
  }
}

function finishStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once('error', reject)
    stream.end(() => resolve())
  })
}

async function cachedInstallerIsTrustworthy(path: string): Promise<boolean> {
  if (!expectedSha256) return false
  try {
    return (await hashFile(path)) === expectedSha256
  } catch {
    return false
  }
}

async function downloadUpdate(): Promise<void> {
  if (status !== 'available' || !downloadUrl) throw new Error('当前没有可用更新')
  const finalPath = installerPathFor(version)
  if (existsSync(finalPath) && (await cachedInstallerIsTrustworthy(finalPath))) {
    installerPath = finalPath
    status = 'ready'
    emit({ type: 'downloaded', version })
    return
  }
  const tempPath = `${finalPath}.tmp`
  status = 'downloading'
  receivedBytes = 0
  totalBytes = 0
  emit({ type: 'progress', received: 0, total: 0 })
  const hash = createHash('sha256')
  let stream: WriteStream | null = null
  try {
    mkdirSync(downloadsDir, { recursive: true })
    rmSync(finalPath, { force: true })
    rmSync(tempPath, { force: true })
    const activeStream = createWriteStream(tempPath)
    stream = activeStream
    const streamFailure = new Promise<never>((_, reject) => {
      activeStream.once('error', (error) => reject(error))
    })
    const response = await net.fetch(downloadUrl, { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) throw new Error('更新下载地址无效')
    const lengthHeader = Number(response.headers.get('content-length') ?? 0)
    totalBytes = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : 0
    const reader = response.body.getReader()
    let lastEmitAt = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      receivedBytes += value.byteLength
      hash.update(value)
      if (!activeStream.write(Buffer.from(value))) {
        await Promise.race([new Promise<void>((resolve) => activeStream.once('drain', () => resolve())), streamFailure])
      }
      const now = Date.now()
      if (now - lastEmitAt >= PROGRESS_EMIT_INTERVAL_MS) {
        lastEmitAt = now
        emit({ type: 'progress', received: receivedBytes, total: totalBytes })
      }
    }
    if (totalBytes > 0 && receivedBytes !== totalBytes) throw new Error('更新下载不完整')
    await Promise.race([finishStream(activeStream), streamFailure])
    if (hash.digest('hex') !== expectedSha256) throw new Error('更新包校验失败，安装包可能与发布版本不一致')
    renameSync(tempPath, finalPath)
    installerPath = finalPath
    status = 'ready'
    emit({ type: 'progress', received: receivedBytes, total: receivedBytes })
    emit({ type: 'downloaded', version })
    cleanupStaleInstallers(finalPath)
  } catch (error) {
    stream?.destroy()
    try {
      rmSync(tempPath, { force: true })
    } catch {
      void 0
    }
    status = 'available'
    const reason = error instanceof Error ? error.message : '未知错误'
    logger.error('updater', '更新下载失败', reason)
    emit({ type: 'error', message: `更新下载失败：${reason}，可点击底部下载按钮重试` })
  }
}

async function installUpdate(): Promise<void> {
  if (status !== 'ready' || !installerPath || !existsSync(installerPath)) throw new Error('更新尚未下载完成')
  if (!(await cachedInstallerIsTrustworthy(installerPath))) {
    rmSync(installerPath, { force: true })
    status = 'available'
    logger.error('updater', '安装前校验失败，已丢弃安装包', installerPath)
    emit({ type: 'error', message: '安装包校验失败，已清除缓存，请重新下载更新' })
    throw new Error('安装包校验失败，请重新下载更新')
  }
  try {
    const installer = spawn(installerPath, [], { detached: true, stdio: 'ignore' })
    installer.once('error', () => void 0)
    installer.unref()
  } catch {
    logger.error('updater', '安装程序启动失败', installerPath)
    rmSync(installerPath, { force: true })
    status = 'available'
    emit({ type: 'error', message: '安装程序启动失败，已清除安装包，请重新下载更新' })
    return
  }
  setTimeout(() => app.quit(), INSTALL_QUIT_DELAY_MS)
}

export function initUpdater(userDataUpdatesPath: string): void {
  downloadsDir = userDataUpdatesPath
  ipcMain.handle('updater:get-state', () => snapshot())
  ipcMain.handle('updater:download', () => {
    if (status === 'downloading') throw new Error('更新正在下载中')
    if (status === 'ready') return
    if (status !== 'available' || !downloadUrl) throw new Error('当前没有可用更新')
    void downloadUpdate()
  })
  ipcMain.handle('updater:install', () => installUpdate())
  if (!updateCheckEnabled()) return
  void checkForUpdate()
}
