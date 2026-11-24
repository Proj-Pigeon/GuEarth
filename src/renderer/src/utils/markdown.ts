import MarkdownIt from 'markdown-it'
import { cloneElement, createElement, isValidElement, type ReactNode } from 'react'

const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:)/i
const SAFE_IMAGE_PATTERN = /^https?:\/\//i

const markdown = new MarkdownIt({ breaks: true, linkify: true, html: false })
markdown.validateLink = (url) => SAFE_LINK_PATTERN.test(url)

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
    if (href && SAFE_LINK_PATTERN.test(href)) attributes.href = href
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

interface ElementFrame {
  tag: string | null
  attrs: Record<string, unknown>
  children: ReactNode[]
}

function renderTokens(tokens: MarkdownToken[], keyState: { seq: number } = { seq: 0 }): ReactNode[] {
  const root: ElementFrame = { tag: null, attrs: {}, children: [] }
  const stack: ElementFrame[] = [root]
  for (const token of tokens) {
    if (token.nesting === -1) {
      if (stack.length > 1) {
        const frame = stack.pop()!
        const parent = stack[stack.length - 1]
        if (frame.tag) {
          parent.children.push(createElement(frame.tag, { key: `md-${keyState.seq++}`, ...frame.attrs }, ...frame.children))
        } else {
          parent.children.push(...frame.children)
        }
      }
      continue
    }
    if (token.nesting === 1) {
      stack.push({
        tag: !token.hidden && allowedTags.has(token.tag) ? token.tag : null,
        attrs: tokenAttributes(token),
        children: []
      })
      continue
    }
    const children = stack[stack.length - 1].children
    if (token.type === 'inline') {
      children.push(...renderTokens(token.children ?? [], keyState))
    } else if (token.type === 'code_inline') {
      children.push(createElement('code', { key: `md-${keyState.seq++}` }, token.content))
    } else if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info.trim().split(/\s+/)[0]
      children.push(
        createElement(
          'pre',
          { key: `md-${keyState.seq++}` },
          createElement('code', language ? { className: `language-${language}` } : null, token.content)
        )
      )
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      children.push(createElement('br', { key: `md-${keyState.seq++}` }))
    } else if (token.type === 'hr') {
      children.push(createElement('hr', { key: `md-${keyState.seq++}` }))
    } else if (token.type === 'image') {
      const src = tokenAttribute(token, 'src')
      const alt = markdown.renderer.renderInlineAsText(token.children ?? [], markdown.options, {})
      if (src && SAFE_IMAGE_PATTERN.test(src)) {
        const title = tokenAttribute(token, 'title')
        const props: Record<string, unknown> = { key: `md-${keyState.seq++}`, src, alt }
        if (title) props.title = title
        children.push(createElement('img', props))
      } else {
        children.push(alt)
      }
    } else {
      children.push(token.content)
    }
  }
  while (stack.length > 1) {
    const frame = stack.pop()!
    const parent = stack[stack.length - 1]
    if (frame.tag) {
      parent.children.push(createElement(frame.tag, { key: `md-${keyState.seq++}`, ...frame.attrs }, ...frame.children))
    } else {
      parent.children.push(...frame.children)
    }
  }
  return root.children
}

export function renderMarkdown(text: string): ReactNode[] {
  return renderTokens(markdown.parse(text, {}))
}

function hasRenderableNodes(nodes: ReactNode[]): boolean {
  for (const child of nodes) {
    if (typeof child === 'string') {
      if (child.trim().length > 0) return true
    } else if (Array.isArray(child)) {
      if (hasRenderableNodes(child)) return true
    } else if (child !== null && child !== undefined && typeof child !== 'boolean') {
      return true
    }
  }
  return false
}

export function tryRenderMarkdown(
  text: string,
  render: (input: string) => ReactNode[] = renderMarkdown
): ReactNode[] | null {
  if (!text.trim()) return null
  try {
    const nodes = render(text)
    return hasRenderableNodes(nodes) ? nodes : null
  } catch {
    return null
  }
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
  lastTokenPosition: number
  delays: Map<number, number> | undefined
}

function normalizeChildren(children: ReactNode): ReactNode[] {
  if (children === null || children === undefined || typeof children === 'boolean') return []
  return Array.isArray(children) ? children : [children]
}

function collectStreamingTokens(children: ReactNode[], tokens: StreamingTokenMeta[], offset = { value: 0 }, insideCode = false): void {
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
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      const nested = normalizeChildren(child.props.children)
      if (nested.length > 0) {
        collectStreamingTokens(
          nested,
          tokens,
          offset,
          insideCode || (typeof child.type === 'string' && nonStreamingTags.has(child.type))
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

function wrapStreamingTokens(children: ReactNode[], state: StreamingState, insideCode = false): ReactNode[] {
  const result: ReactNode[] = []
  let containsLastToken = false
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
        if (!isSpace && position === state.lastTokenPosition) containsLastToken = true
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
        const props: Record<string, unknown> = { key: `stream-token-${position}`, className: tokenClass }
        if (delay) props.style = { animationDelay: `${delay}ms` }
        result.push(createElement('span', props, piece))
      }
      if (plain) result.push(plain)
    } else if (Array.isArray(child)) {
      result.push(...wrapStreamingTokens(child, state, insideCode))
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      const nested = normalizeChildren(child.props.children)
      if (nested.length > 0) {
        const wrappedNested = wrapStreamingTokens(
          nested,
          state,
          insideCode || (typeof child.type === 'string' && nonStreamingTags.has(child.type))
        )
        result.push(cloneElement(child, undefined, ...wrappedNested))
      } else {
        result.push(child)
      }
    } else {
      result.push(child)
    }
  }
  if (containsLastToken) {
    result.push(createElement('span', { key: 'stream-caret', className: 'stream-caret', 'aria-hidden': 'true' }))
  }
  return result
}

export function renderStreamingMarkdown(text: string, delayState?: StreamingDelayState): ReactNode[] {
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
  const lastTokenPosition = tokens.length > 0 ? tokens[tokens.length - 1].position : -1
  const state: StreamingState = {
    position: 0,
    windowStart,
    freshStart,
    lastTokenPosition,
    delays
  }
  return wrapStreamingTokens(nodes, state)
}
