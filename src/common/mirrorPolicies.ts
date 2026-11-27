export type MirrorPolicyId = 'agreement' | 'acceptable-use'

export const MIRROR_POLICY_IDS: readonly MirrorPolicyId[] = ['agreement', 'acceptable-use']

export const MIRROR_POLICY_FALLBACK_TITLES: Record<MirrorPolicyId, string> = {
  agreement: '咕咕地球镜像服务使用协议',
  'acceptable-use': '可接受使用政策'
}

export interface ParsedPolicyMarkdown {
  title: string
  body: string
}

export function parsePolicyMarkdown(markdown: string, fallbackTitle: string): ParsedPolicyMarkdown {
  const normalized = markdown.replace(/^﻿/, '').replaceAll(/\r\n?/g, '\n').trim()
  const match = /^#\s+(.+?)(?:\n+([\s\S]*))?$/.exec(normalized)
  if (!match) {
    return {
      title: fallbackTitle,
      body: normalized
    }
  }
  return {
    title: match[1].trim() || fallbackTitle,
    body: (match[2] ?? '').trim()
  }
}
