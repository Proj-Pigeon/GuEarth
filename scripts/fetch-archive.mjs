const maxRedirects = 5

export function approvedDownloadUrl(value, hosts) {
  const parsed = URL.parse(value)
  const host = hosts.find(candidate => parsed?.origin === `https://${candidate}`)
  if (!host || parsed.username || parsed.password) {
    throw new Error(`拒绝请求未经验证的地址：${parsed?.hostname || parsed?.protocol || value}`)
  }
  const target = new URL(`https://${host}`)
  target.pathname = parsed.pathname
  target.search = parsed.search
  return target.href
}

function fetchFromApprovedOrigin(value, origins, userAgent) {
  const url = new URL(value)
  if (url.username || url.password) {
    throw new Error(`拒绝请求包含凭据的地址：${url.hostname}`)
  }
  if (origins.has(url.origin)) {
    return fetch(url, { redirect: 'manual', headers: { 'user-agent': userAgent } })
  }
  throw new Error(`拒绝请求未经验证的地址：${url.hostname}`)
}

export async function fetchArchive(source, { hosts, resolveRedirect, userAgent }) {
  const origins = new Set(hosts.map(host => `https://${host}`))
  let url = source
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchFromApprovedOrigin(url, origins, userAgent)
    if (response.status < 300 || response.status >= 400) {
      return response
    }
    await response.body?.cancel()
    if (hop === maxRedirects) {
      break
    }
    url = resolveRedirect(response.headers.get('location'), url)
  }
  throw new Error(`下载重定向次数过多：${new URL(source).hostname}`)
}
