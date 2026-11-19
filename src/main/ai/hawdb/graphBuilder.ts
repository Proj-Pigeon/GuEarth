import type { StoredAiConversation } from '../../../preload'
import type { KnowledgeEntry } from '../knowledge'

export interface KnowledgeGraphEdge {
  fromId: string
  toId: string
  relation: 'CONTRASTS_WITH' | 'RELATED_TO'
  reason: string
}

const MAX_CONVERSATION_SEARCH_CHARS = 40_000
const MAX_RELATED_PER_ENTRY = 6
const MAX_SNIPPET_CHARS = 180

export function normalizeLookupText(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。；：、“”‘’！？（）()、/\\|·_-]+/g, '')
}

export function extractQueryTerms(query: string): string[] {
  const normalized = normalizeLookupText(query)
  const terms = new Set<string>()
  if (normalized) terms.add(normalized)
  const words = query.toLocaleLowerCase('zh-CN').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  for (const word of words) {
    const clean = normalizeLookupText(word)
    if (clean) terms.add(clean)
  }
  const cjk = normalized.replace(/[^㐀-鿿]/g, '')
  for (let index = 0; index < cjk.length - 1; index += 1) {
    terms.add(cjk.slice(index, index + 2))
  }
  return [...terms].filter((term) => term.length > 0)
}

export function buildKnowledgeSearchText(entry: KnowledgeEntry): string {
  const places = (entry.typicalPlaces ?? []).map((place) => `${place.name} ${place.note}`).join(' ')
  return [
    entry.name,
    ...entry.aliases,
    ...entry.keywords,
    entry.module,
    entry.grade,
    entry.definition,
    ...(entry.features ?? []),
    ...(entry.formation ?? []),
    ...(entry.commonConfusions ?? []),
    places
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildConversationSearchText(conversation: StoredAiConversation): string {
  const chunks: string[] = [conversation.title]
  if (conversation.compression?.summary) {
    chunks.push(conversation.compression.summary)
  }
  for (const message of conversation.messages) {
    if (message.content.trim()) {
      chunks.push(message.content.trim())
    } else if (message.parts.length > 0) {
      const textParts = message.parts
        .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text' && Boolean(part.text.trim()))
        .map((part) => part.text.trim())
      if (textParts.length > 0) chunks.push(textParts.join(' '))
    }
  }
  return chunks.join('\n').slice(0, MAX_CONVERSATION_SEARCH_CHARS)
}

export function buildConversationSnippet(conversation: StoredAiConversation, query: string): string {
  const candidates: string[] = []
  if (conversation.compression?.summary) candidates.push(conversation.compression.summary)
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const msg = conversation.messages[i]
    if (msg.content.trim()) {
      candidates.push(msg.content.trim())
    } else {
      const partText = msg.parts
        .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text' && Boolean(part.text.trim()))
        .map((part) => part.text.trim())
        .join(' ')
      if (partText) candidates.push(partText)
    }
  }
  const terms = extractQueryTerms(query).sort((left, right) => right.length - left.length)
  for (const term of terms) {
    for (const text of candidates) {
      const lower = text.toLocaleLowerCase('zh-CN')
      const idx = lower.indexOf(term)
      if (idx >= 0) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(text.length, start + MAX_SNIPPET_CHARS)
        const prefix = start > 0 ? '…' : ''
        const suffix = end < text.length ? '…' : ''
        return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
      }
    }
  }
  const fallback = candidates[0] ?? conversation.title
  const clean = fallback.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_SNIPPET_CHARS ? `${clean.slice(0, MAX_SNIPPET_CHARS)}…` : clean
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

function candidateLabels(entry: KnowledgeEntry): string[] {
  const labels = new Set<string>()
  const name = normalizeLookupText(entry.name)
  if (name.length >= 2) labels.add(name)
  for (const alias of entry.aliases) {
    const clean = normalizeLookupText(alias)
    if (clean.length >= 2) labels.add(clean)
  }
  return [...labels]
}

export function extractKnowledgeGraphEdges(entries: KnowledgeEntry[]): KnowledgeGraphEdge[] {
  const active = entries.filter((entry) => entry.status !== 'deprecated')
  const labelsById = new Map<string, string[]>()
  for (const entry of active) {
    labelsById.set(entry.id, candidateLabels(entry))
  }
  const seenPairs = new Set<string>()
  const edges: KnowledgeGraphEdge[] = []

  for (const source of active) {
    const confusions = source.commonConfusions ?? []
    if (!confusions.length) continue
    for (const sentence of confusions) {
      const normSentence = normalizeLookupText(sentence)
      if (!normSentence) continue
      for (const target of active) {
        if (target.id === source.id) continue
        const key = pairKey(source.id, target.id)
        if (seenPairs.has(key)) continue
        const targetLabels = labelsById.get(target.id) ?? []
        if (targetLabels.some((label) => normSentence.includes(label))) {
          seenPairs.add(key)
          edges.push({
            fromId: source.id,
            toId: target.id,
            relation: 'CONTRASTS_WITH',
            reason: sentence.trim().slice(0, 140)
          })
        }
      }
    }
  }

  for (const source of active) {
    const bodyText = normalizeLookupText(
      [source.definition, ...(source.formation ?? []), ...(source.features ?? [])].join(' ')
    )
    if (!bodyText) continue
    let added = 0
    for (const target of active) {
      if (added >= MAX_RELATED_PER_ENTRY) break
      if (target.id === source.id) continue
      const key = pairKey(source.id, target.id)
      if (seenPairs.has(key)) continue
      const targetName = normalizeLookupText(target.name)
      if (targetName.length < 2) continue
      if (bodyText.includes(targetName)) {
        seenPairs.add(key)
        edges.push({
          fromId: source.id,
          toId: target.id,
          relation: 'RELATED_TO',
          reason: `「${source.name}」与「${target.name}」概念关联`
        })
        added += 1
      }
    }
  }

  return edges
}
