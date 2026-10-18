import MarkdownIt from 'markdown-it'
import { h, type VNode, type VNodeChild } from 'vue'

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

const streamingTokenPattern = /(\s+|[\u3400-\u9fff\uf900-\ufaff]|[^\s\u3400-\u9fff\uf900-\ufaff]+)/g
const wordPattern = /[\p{L}\p{N}]/u
const nonStreamingTags = new Set(['pre', 'code'])
const streamingTailTokens = 120

interface StreamingToken {
  node: VNode
  parent: VNodeChild[]
  word: boolean
  space: boolean
}

interface StreamingState {
  position: number
  windowStart: number
  tokens: StreamingToken[]
}

function countStreamingTokens(children: VNodeChild[], insideCode = false): number {
  let count = 0
  for (const child of children) {
    if (typeof child === 'string') {
      if (!insideCode) count += (child.match(streamingTokenPattern) ?? [child]).length
    } else if (Array.isArray(child)) {
      count += countStreamingTokens(child, insideCode)
    } else if (child && typeof child === 'object' && 'type' in child) {
      const vnode = child as VNode
      if (Array.isArray(vnode.children)) {
        count += countStreamingTokens(vnode.children as VNodeChild[], insideCode || (typeof vnode.type === 'string' && nonStreamingTags.has(vnode.type)))
      }
    }
  }
  return count
}

function wrapStreamingTokens(children: VNodeChild[], state: StreamingState, insideCode = false): VNodeChild[] {
  const result: VNodeChild[] = []
  for (const child of children) {
    if (typeof child === 'string') {
      if (insideCode) {
        result.push(child)
        continue
      }
      let plain = ''
      for (const piece of child.match(streamingTokenPattern) ?? [child]) {
        const position = state.position
        state.position += 1
        if (position < state.windowStart) {
          plain += piece
          continue
        }
        if (plain) {
          result.push(plain)
          plain = ''
        }
        const node = h('span', { key: `stream-token-${position}`, class: 'stream-token' }, piece)
        state.tokens.push({ node, parent: result, word: wordPattern.test(piece), space: /^\s+$/.test(piece) })
        result.push(node)
      }
      if (plain) result.push(plain)
    } else if (Array.isArray(child)) {
      result.push(...wrapStreamingTokens(child, state, insideCode))
    } else if (child && typeof child === 'object' && 'type' in child) {
      const vnode = child as VNode
      if (Array.isArray(vnode.children)) {
        vnode.children = wrapStreamingTokens(vnode.children as VNodeChild[], state, insideCode || (typeof vnode.type === 'string' && nonStreamingTags.has(vnode.type)))
      }
      result.push(vnode)
    } else result.push(child)
  }
  return result
}

export function renderStreamingMarkdown(text: string): VNodeChild[] {
  const nodes = renderMarkdown(text)
  const total = countStreamingTokens(nodes)
  const state: StreamingState = { position: 0, windowStart: Math.max(0, total - streamingTailTokens), tokens: [] }
  const wrapped = wrapStreamingTokens(nodes, state)
  if (state.tokens.length === 0) return wrapped
  const words = state.tokens.filter((token) => token.word)
  for (const token of words.slice(-2)) token.node.props = { ...(token.node.props ?? {}), class: 'stream-token stream-token-fresh' }
  for (const token of state.tokens.slice(-12)) token.node.props = { ...(token.node.props ?? {}), class: `${token.node.props?.class ?? 'stream-token'} stream-token-enter` }
  const last = [...state.tokens].reverse().find((token) => !token.space)
  if (last) last.parent.push(h('span', { key: 'stream-caret', class: 'stream-caret', 'aria-hidden': 'true' }))
  return wrapped
}
