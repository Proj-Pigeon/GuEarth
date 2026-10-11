import { fetchLatestRelease } from '../lib/github.js'
import { buildUpdateManifest, findInstallerAsset } from '../lib/manifest.js'

const EDGE_CACHE_SECONDS = 300

export default async function handler(req, res) {
  const platform = typeof req.query.platform === 'string' ? req.query.platform : ''
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=600`)
  if (platform !== 'win32') return res.status(204).end()
  const release = await fetchLatestRelease()
  if (!release) {
    console.error('update check failed to load release data from GitHub')
    return res.status(204).end()
  }
  const asset = findInstallerAsset(release)
  if (!asset) return res.status(204).end()
  return res.status(200).json(buildUpdateManifest(release, asset))
}
