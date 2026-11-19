import { createHash } from 'node:crypto'
import entries from './entries.json'
import expandedEntries from './entries-expanded.json'
import curriculumEntries from './entries-curriculum.json'
import finalEntries from './entries-final.json'
import humanEntries from './entries-human.json'

export interface KnowledgeSource {
  title: string
  url: string
  type: string
}

export interface KnowledgePlace {
  name: string
  longitude: number
  latitude: number
  note: string
}

export interface KnowledgeEntry {
  id: string
  type: 'terminology' | 'landform' | 'process' | 'place' | 'tool' | 'curriculum'
  name: string
  aliases: string[]
  keywords: string[]
  module: string
  grade: string
  definition: string
  features?: string[]
  formation?: string[]
  typicalPlaces?: KnowledgePlace[]
  commonConfusions?: string[]
  sources: KnowledgeSource[]
  status: 'draft' | 'reviewed' | 'deprecated'
  updatedAt: string
}

export interface KnowledgeMatch {
  id: string
  type: KnowledgeEntry['type']
  name: string
  module: string
  grade: string
  definition: string
  features: string[]
  formation: string[]
  typicalPlaces: KnowledgePlace[]
  commonConfusions: string[]
  sources: KnowledgeSource[]
  status: KnowledgeEntry['status']
  updatedAt: string
  score: number
  matchedFields: string[]
}

const knowledgeEntries = [...entries, ...expandedEntries, ...curriculumEntries, ...finalEntries, ...humanEntries] as KnowledgeEntry[]
const MAX_QUERY_LENGTH = 200
const DEFAULT_TOP_K = 3
const MAX_TOP_K = 5

function normalize(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。；：、“”‘’！？（）()、/\\|·_-]+/g, '')
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query)
  const terms = new Set<string>()
  if (normalized) terms.add(normalized)
  const words = query.toLocaleLowerCase('zh-CN').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  for (const word of words) terms.add(normalize(word))
  const cjk = normalized.replace(/[^\u3400-\u9fff]/g, '')
  for (let index = 0; index < cjk.length - 1; index += 1) terms.add(cjk.slice(index, index + 2))
  return [...terms].filter((term) => term.length > 0)
}

function fieldMatches(value: string, terms: string[]): number {
  const normalized = normalize(value)
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0)
}

function scoreEntry(entry: KnowledgeEntry, terms: string[], module?: string): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = []
  const nameScore = fieldMatches(entry.name, terms)
  const aliasScore = entry.aliases.reduce((score, alias) => score + fieldMatches(alias, terms), 0)
  const keywordScore = entry.keywords.reduce((score, keyword) => score + fieldMatches(keyword, terms), 0)
  const placeContent = (entry.typicalPlaces ?? []).map((place) => `${place.name} ${place.note}`).join(' ')
  const content = [entry.definition, ...(entry.features ?? []), ...(entry.formation ?? []), ...(entry.commonConfusions ?? []), placeContent].join(' ')
  const contentScore = fieldMatches(content, terms)
  let score = nameScore * 100 + aliasScore * 80 + keywordScore * 45 + contentScore * 12
  if (module && normalize(entry.module).includes(normalize(module))) {
    score += 25
    matchedFields.push('module')
  }
  if (nameScore) matchedFields.push('name')
  if (aliasScore) matchedFields.push('aliases')
  if (keywordScore) matchedFields.push('keywords')
  if (contentScore) matchedFields.push('content')
  return { score, matchedFields }
}

function toMatch(entry: KnowledgeEntry, score: number, matchedFields: string[]): KnowledgeMatch {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    module: entry.module,
    grade: entry.grade,
    definition: entry.definition,
    features: entry.features ?? [],
    formation: entry.formation ?? [],
    typicalPlaces: entry.typicalPlaces ?? [],
    commonConfusions: entry.commonConfusions ?? [],
    sources: entry.sources,
    status: entry.status,
    updatedAt: entry.updatedAt,
    score,
    matchedFields
  }
}

export function retrieveKnowledge(query: string, module?: string, topK = DEFAULT_TOP_K): { query: string; matches: KnowledgeMatch[]; total: number } {
  const cleanQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
  if (!cleanQuery) return { query: '', matches: [], total: 0 }
  const terms = queryTerms(cleanQuery)
  const limit = Math.min(MAX_TOP_K, Math.max(1, Math.round(topK)))
  const ranked = knowledgeEntries
    .map((entry) => {
      const result = scoreEntry(entry, terms, module)
      return { entry, ...result }
    })
    .filter((item) => item.score > 0 && item.entry.status !== 'deprecated')
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name, 'zh-CN'))
  return {
    query: cleanQuery,
    matches: ranked.slice(0, limit).map((item) => toMatch(item.entry, item.score, item.matchedFields)),
    total: ranked.length
  }
}

const datasetHash = createHash('sha256').update(JSON.stringify(knowledgeEntries)).digest('hex')

export function knowledgeEntryCount(): number {
  return knowledgeEntries.length
}

export function getAllKnowledgeEntries(): KnowledgeEntry[] {
  return knowledgeEntries
}

export function knowledgeDatasetHash(): string {
  return datasetHash
}
