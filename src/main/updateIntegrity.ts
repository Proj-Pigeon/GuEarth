import { createHash } from 'crypto'
import { createReadStream } from 'fs'

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/
const SHA256_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/

function stripSha256Prefix(value: string): { prefixed: boolean; value: string } {
  const lowered = value.toLowerCase()
  if (lowered.startsWith('sha256-')) return { prefixed: true, value: value.slice('sha256-'.length) }
  if (lowered.startsWith('sha256:')) return { prefixed: true, value: value.slice('sha256:'.length) }
  return { prefixed: false, value }
}

export function parseSha256(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const { prefixed, value } = stripSha256Prefix(raw.trim())
  const lowered = value.toLowerCase()
  if (SHA256_HEX_PATTERN.test(lowered)) return lowered
  if (prefixed && SHA256_BASE64_PATTERN.test(value)) {
    const decoded = Buffer.from(value, 'base64').toString('hex')
    return SHA256_HEX_PATTERN.test(decoded) ? decoded : null
  }
  return null
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function releaseTagCandidates(rawName: unknown, version: string): string[] {
  const candidates: string[] = []
  if (typeof rawName === 'string') {
    const name = rawName.trim()
    if (name) candidates.push(name)
  }
  for (const candidate of [`v${version}`, version]) {
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }
  return candidates
}

export function extractAssetDigest(release: unknown, downloadUrl: string): string | null {
  if (!isRecord(release) || !Array.isArray(release['assets'])) return null
  const fileName = downloadUrl.split('/').pop() ?? ''
  for (const entry of release['assets']) {
    if (!isRecord(entry) || entry['state'] !== 'uploaded') continue
    const urlMatches = entry['browser_download_url'] === downloadUrl
    const nameMatches = fileName !== '' && entry['name'] === fileName
    if (!urlMatches && !nameMatches) continue
    const digest = parseSha256(entry['digest'])
    if (digest) return digest
  }
  return null
}

function splitVersion(version: string): [number[], string] {
  const withoutBuild = version.trim().replace(/^v/, '').split('+')[0]
  const hyphen = withoutBuild.indexOf('-')
  const core = hyphen >= 0 ? withoutBuild.slice(0, hyphen) : withoutBuild
  const prerelease = hyphen >= 0 ? withoutBuild.slice(hyphen + 1) : ''
  const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return [numbers, prerelease]
}

function isNumericIdentifier(identifier: string): boolean {
  return /^\d+$/.test(identifier)
}

function comparePrerelease(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return 1
  if (!right) return -1
  const leftParts = left.split('.')
  const rightParts = right.split('.')
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (isNumericIdentifier(leftPart) && isNumericIdentifier(rightPart)) {
      const diff = Number(leftPart) - Number(rightPart)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (isNumericIdentifier(leftPart) !== isNumericIdentifier(rightPart)) {
      return isNumericIdentifier(leftPart) ? -1 : 1
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1
    }
  }
  return 0
}

export function compareVersions(left: string, right: string): number {
  const [leftCore, leftPre] = splitVersion(left)
  const [rightCore, rightPre] = splitVersion(right)
  const length = Math.max(leftCore.length, rightCore.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (leftCore[index] ?? 0) - (rightCore[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return comparePrerelease(leftPre, rightPre)
}
