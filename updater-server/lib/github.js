const GITHUB_API_BASE = 'https://api.github.com'
const DEFAULT_REPO = 'Proj-Pigeon/GuEarth'
const REQUEST_TIMEOUT_MS = 8000

export async function fetchLatestRelease({ repo, token, fetchImpl } = {}) {
  const target = repo ?? process.env['GITHUB_REPO'] ?? DEFAULT_REPO
  const doFetch = fetchImpl ?? globalThis.fetch
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'guearth-updater-server'
  }
  const authToken = token ?? process.env['GITHUB_TOKEN']
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  try {
    const response = await doFetch(`${GITHUB_API_BASE}/repos/${target}/releases/latest`, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}
