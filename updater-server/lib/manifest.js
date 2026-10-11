const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function findInstallerAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find((asset) => asset.state === 'uploaded' && asset.name.endsWith('.exe')) ?? null
}

export function parseAssetDigest(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.startsWith('sha256:') ? raw.slice('sha256:'.length) : raw.trim()
  return SHA256_HEX_PATTERN.test(value) ? value : null
}

export function buildUpdateManifest(release, asset) {
  const manifest = {
    name: typeof release.tag_name === 'string' ? release.tag_name : '',
    notes: typeof release.body === 'string' ? release.body : '',
    pub_date: typeof release.published_at === 'string' ? release.published_at : '',
    url: asset.browser_download_url
  }
  const digest = parseAssetDigest(asset.digest)
  if (digest) manifest.sha256 = digest
  return manifest
}
