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

const streamingTokenPattern = /(\s+|[\u3400-\u9fff\uf900-\ufaff]|[^\s\p{P}\p{S}\u3400-\u9fff\uf900-\ufaff]+(?:[._'-][^\s\p{P}\p{S}\u3400-\u9fff\uf900-\ufaff]+)*|[\p{P}\p{S}])/gu
const wordPattern = /[\p{L}\p{N}]/u
const nonStreamingTags = new Set(['pre', 'code'])
const streamingTailTokens = 6
const streamingFreshWords = 2
const maxBatchStaggerMs = 36
const maxTokenStepMs = 12

export interface StreamingDelayState {
  seenCount: number
  settledCount: number
  lastText: string
  settledText: string
  delays: Map<number, number>
}

export function createStreamingDelayState(): StreamingDelayState {
  return { seenCount: 0, settledCount: 0, lastText: '', settledText: '', delays: new Map() }
}

export function settleStreamingDelayState(delayState: StreamingDelayState, text: string): void {
  delayState.settledCount = delayState.seenCount
  delayState.lastText = text
  delayState.settledText = text
  delayState.delays.clear()
}

export function resetStreamingDelayState(delayState: StreamingDelayState): void {
  delayState.seenCount = 0
  delayState.settledCount = 0
  delayState.lastText = ''
  delayState.settledText = ''
  delayState.delays.clear()
}

interface StreamingTokenMeta {
  position: number
  word: boolean
}

interface StreamingState {
  position: number
  windowStart: number
  freshStart: number
  delays: Map<number, number> | undefined
  lastCaretParent: VNodeChild[] | undefined
}

function collectStreamingTokens(children: VNodeChild[], tokens: StreamingTokenMeta[], offset = { value: 0 }, insideCode = false): void {
  for (const child of children) {
    if (typeof child === 'string') {
      if (insideCode) continue
      for (const piece of child.match(streamingTokenPattern) ?? [child]) {
        if (!/^\s+$/.test(piece)) {
          tokens.push({ position: offset.value, word: wordPattern.test(piece) })
        }
        offset.value += 1
      }
    } else if (Array.isArray(child)) {
      collectStreamingTokens(child, tokens, offset, insideCode)
    } else if (child && typeof child === 'object' && 'type' in child) {
      const vnode = child as VNode
      if (Array.isArray(vnode.children)) {
        collectStreamingTokens(
          vnode.children as VNodeChild[],
          tokens,
          offset,
          insideCode || (typeof vnode.type === 'string' && nonStreamingTags.has(vnode.type))
        )
      }
    }
  }
}

function updateStreamingDelays(text: string, tokens: StreamingTokenMeta[], tailStartIndex: number, delayState: StreamingDelayState): { windowStart: number; delays: Map<number, number> } {
  const total = tokens.length
  if ((delayState.lastText && !text.startsWith(delayState.lastText)) || (delayState.settledText && !text.startsWith(delayState.settledText))) {
    resetStreamingDelayState(delayState)
  } else if (total < delayState.seenCount) {
    delayState.seenCount = total
    delayState.settledCount = Math.min(delayState.settledCount, total)
  }
  const activeStartIndex = Math.max(tailStartIndex, Math.min(delayState.settledCount, total))
  const windowStart = activeStartIndex < total ? tokens[activeStartIndex].position : Number.POSITIVE_INFINITY
  delayState.delays.clear()
  const newlyAdded = tokens.slice(Math.max(delayState.seenCount, activeStartIndex))
  const stepMs = newlyAdded.length > 1 ? Math.min(maxTokenStepMs, Math.floor(maxBatchStaggerMs / newlyAdded.length)) : 0
  newlyAdded.forEach((token, index) => {
    const delay = index * stepMs
    if (delay > 0) delayState.delays.set(token.position, delay)
  })
  delayState.seenCount = total
  delayState.lastText = text
  return { windowStart, delays: delayState.delays }
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
        const isSpace = /^\s+$/.test(piece)
        if (!isSpace) state.lastCaretParent = result
        if (isSpace || position < state.windowStart) {
          plain += piece
          continue
        }
        if (plain) {
          result.push(plain)
          plain = ''
        }
        const isFreshWord = wordPattern.test(piece) && position >= state.freshStart
        const tokenClass = isFreshWord ? 'stream-token stream-token-fresh' : 'stream-token'
        const delay = state.delays?.get(position)
        const props: Record<string, unknown> = { key: `stream-token-${position}`, class: tokenClass }
        if (delay) props.style = { animationDelay: `${delay}ms` }
        result.push(h('span', props, piece))
      }
      if (plain) result.push(plain)
    } else if (Array.isArray(child)) {
      result.push(...wrapStreamingTokens(child, state, insideCode))
    } else if (child && typeof child === 'object' && 'type' in child) {
      const vnode = child as VNode
      if (Array.isArray(vnode.children)) {
        vnode.children = wrapStreamingTokens(
          vnode.children as VNodeChild[],
          state,
          insideCode || (typeof vnode.type === 'string' && nonStreamingTags.has(vnode.type))
        )
      }
      result.push(vnode)
    } else result.push(child)
  }
  return result
}

export function renderStreamingMarkdown(text: string, delayState?: StreamingDelayState): VNodeChild[] {
  const nodes = renderMarkdown(text)
  const tokens: StreamingTokenMeta[] = []
  collectStreamingTokens(nodes, tokens)
  const words = tokens.filter((token) => token.word)
  const tailStartIndex = Math.max(0, tokens.length - streamingTailTokens)
  const defaultWindowStart = tokens.length > 0 ? tokens[tailStartIndex].position : Number.POSITIVE_INFINITY
  const { windowStart, delays } = delayState
    ? updateStreamingDelays(text, tokens, tailStartIndex, delayState)
    : { windowStart: defaultWindowStart, delays: undefined }
  const freshStart = words.length > 0 ? Math.max(windowStart, words[Math.max(0, words.length - streamingFreshWords)].position) : Number.POSITIVE_INFINITY
  const state: StreamingState = {
    position: 0,
    windowStart,
    freshStart,
    delays,
    lastCaretParent: undefined
  }
  const wrapped = wrapStreamingTokens(nodes, state)
  if (state.lastCaretParent) {
    state.lastCaretParent.push(h('span', { key: 'stream-caret', class: 'stream-caret', 'aria-hidden': 'true' }))
  }
  return wrapped
}
