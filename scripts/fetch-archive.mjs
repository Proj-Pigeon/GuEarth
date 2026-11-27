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

export async function fetchArchive(source, { approveUrl, resolveRedirect, userAgent }) {
  let url = source
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const request = new Request(approveUrl(url), {
      redirect: 'manual',
      headers: { 'user-agent': userAgent }
    })
    const response = await fetch(request)
    if (response.status < 300 || response.status >= 400) {
      return response
    }
    await response.body?.cancel()
    if (hop === maxRedirects) {
      break
    }
    url = resolveRedirect(response.headers.get('location'), request.url)
  }
  throw new Error(`下载重定向次数过多：${new URL(source).hostname}`)
}
