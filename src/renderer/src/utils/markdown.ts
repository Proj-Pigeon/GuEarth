import MarkdownIt from 'markdown-it'
import { h, type VNodeChild } from 'vue'

const markdown = new MarkdownIt({ breaks: true, linkify: true, html: false })
markdown.validateLink = (url) => /^https?:\/\//i.test(url)

type MarkdownToken = ReturnType<typeof markdown.parse>[number]

const allowedTags = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
  'strong', 'em', 's', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
])

function tokenAttribute(token: MarkdownToken, name: string): string | undefined {
  const value = token.attrGet(name)
  return value === null || value === undefined ? undefined : String(value)
}

function tokenAttributes(token: MarkdownToken): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (token.tag === 'a') {
    const href = tokenAttribute(token, 'href')
    if (href && markdown.validateLink(href)) attributes.href = href
    attributes.target = '_blank'
    attributes.rel = 'noopener noreferrer'
    const title = tokenAttribute(token, 'title')
    if (title) attributes.title = title
  }
  if (token.tag === 'ol') {
    const start = tokenAttribute(token, 'start')
    if (start && /^\d{1,9}$/.test(start)) attributes.start = Number(start)
  }
  if (token.tag === 'th' || token.tag === 'td') {
    const alignment = /^text-align:(left|center|right)$/.exec(tokenAttribute(token, 'style') ?? '')
    if (alignment) attributes.style = { textAlign: alignment[1] }
  }
  return attributes
}

function renderTokens(tokens: MarkdownToken[]): VNodeChild[] {
  const result: VNodeChild[] = []
  const stack = [result]
  for (const token of tokens) {
    const children = stack[stack.length - 1]
    if (token.nesting === -1) {
      if (stack.length > 1) stack.pop()
      continue
    }
    if (token.nesting === 1) {
      const nested: VNodeChild[] = []
      if (!token.hidden && allowedTags.has(token.tag)) children.push(h(token.tag, tokenAttributes(token), nested))
      else children.push(nested)
      stack.push(nested)
      continue
    }
    if (token.type === 'inline') {
      children.push(...renderTokens(token.children ?? []))
    } else if (token.type === 'code_inline') {
      children.push(h('code', token.content))
    } else if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info.trim().split(/\s+/)[0]
      children.push(h('pre', [h('code', language ? { class: `language-${language}` } : {}, token.content)]))
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      children.push(h('br'))
    } else if (token.type === 'hr') {
      children.push(h('hr'))
    } else if (token.type === 'image') {
      const src = tokenAttribute(token, 'src')
      const alt = markdown.renderer.renderInlineAsText(token.children ?? [], markdown.options, {})
      if (src && markdown.validateLink(src)) children.push(h('img', { src, alt, title: tokenAttribute(token, 'title') }))
      else children.push(alt)
    } else {
      children.push(token.content)
    }
  }
  return result
}

export function renderMarkdown(text: string): VNodeChild[] {
  return renderTokens(markdown.parse(text, {}))
}
