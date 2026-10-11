import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchLatestRelease } from '../updater-server/lib/github.js'
import { buildUpdateManifest, findInstallerAsset, parseAssetDigest } from '../updater-server/lib/manifest.js'

const HEX_DIGEST = '902f46f0692ed25c73d6db4a8547dbfd5167f6434aa2685272bdcbaf77528073'

test('findInstallerAsset picks the uploaded exe and skips non-installer assets', () => {
  const release = {
    assets: [
      { name: 'guearth-0.1.13-x64-setup.exe.blockmap', state: 'uploaded' },
      { name: 'guearth-0.1.13-x64-setup.exe.sha256', state: 'uploaded' },
      { name: 'guearth-0.1.14-x64-setup.exe', state: 'starter' },
      { name: 'guearth-0.1.13-x64-setup.exe', state: 'uploaded', digest: `sha256:${HEX_DIGEST}` }
    ]
  }
  assert.equal(findInstallerAsset(release)?.name, 'guearth-0.1.13-x64-setup.exe')
  assert.equal(findInstallerAsset({ assets: [{ name: 'release-notes.md', state: 'uploaded' }] }), null)
  assert.equal(findInstallerAsset({ assets: [] }), null)
  assert.equal(findInstallerAsset(null), null)
})

test('parseAssetDigest accepts 64-char hex with or without the sha256 prefix', () => {
  assert.equal(parseAssetDigest(`sha256:${HEX_DIGEST}`), HEX_DIGEST)
  assert.equal(parseAssetDigest(HEX_DIGEST), HEX_DIGEST)
  assert.equal(parseAssetDigest('sha256:not-a-digest'), null)
  assert.equal(parseAssetDigest(`sha256:${HEX_DIGEST.slice(1)}`), null)
  assert.equal(parseAssetDigest(undefined), null)
})

test('buildUpdateManifest mirrors the hazel fields and adds sha256 when GitHub provides a digest', () => {
  const manifest = buildUpdateManifest(
    { tag_name: 'v0.1.13', body: '# v0.1.13 更新日志', published_at: '2026-10-06T08:04:31Z' },
    {
      browser_download_url: 'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.13/guearth-0.1.13-x64-setup.exe',
      digest: `sha256:${HEX_DIGEST}`
    }
  )
  assert.deepEqual(manifest, {
    name: 'v0.1.13',
    notes: '# v0.1.13 更新日志',
    pub_date: '2026-10-06T08:04:31Z',
    url: 'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.13/guearth-0.1.13-x64-setup.exe',
    sha256: HEX_DIGEST
  })
  const withoutDigest = buildUpdateManifest(
    { tag_name: 'v0.1.12', body: '', published_at: '' },
    { browser_download_url: 'https://example.com/guearth-0.1.12-x64-setup.exe' }
  )
  assert.equal('sha256' in withoutDigest, false)
})

test('fetchLatestRelease requests the latest release of the configured repo with auth', async () => {
  const calls = []
  const payload = { tag_name: 'v0.1.13', assets: [] }
  const release = await fetchLatestRelease({
    repo: 'Proj-Pigeon/GuEarth',
    token: 'test-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return { ok: true, json: async () => payload }
    }
  })
  assert.equal(release, payload)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.github.com/repos/Proj-Pigeon/GuEarth/releases/latest')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token')
  assert.equal(calls[0].init.headers['User-Agent'], 'guearth-updater-server')
})

test('fetchLatestRelease falls back to the default repo when GITHUB_REPO is unset', async () => {
  delete process.env['GITHUB_REPO']
  delete process.env['GITHUB_TOKEN']
  const calls = []
  await fetchLatestRelease({
    fetchImpl: async (url) => {
      calls.push(url)
      return { ok: false, status: 403 }
    }
  })
  assert.equal(calls[0], 'https://api.github.com/repos/Proj-Pigeon/GuEarth/releases/latest')
})

test('fetchLatestRelease returns null on HTTP errors and network failures', async () => {
  const httpError = await fetchLatestRelease({
    repo: 'Proj-Pigeon/GuEarth',
    fetchImpl: async () => ({ ok: false, status: 403 })
  })
  assert.equal(httpError, null)
  const networkError = await fetchLatestRelease({
    repo: 'Proj-Pigeon/GuEarth',
    fetchImpl: async () => {
      throw new Error('offline')
    }
  })
  assert.equal(networkError, null)
})
